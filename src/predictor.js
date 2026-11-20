import { english } from "./english.js";
import { matchTasks } from "./history.js";

const words = (text) => [...text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}'’\-]*/gu)];
const key = (tokens) => tokens.join("\u0000");
const END = "</s>";

// Small, synchronous word n-gram model. No workers, downloads, or inference runtime.
export function createPredictor(history = [], sequence = []) {
  const counts = new Map();
  const spelling = new Map();
  function train(text, weight) {
    const matches = words(text);
    const tokens = ["<s>", ...matches.map(([word]) => word.toLocaleLowerCase()), END];
    matches.forEach(([word], index) => {
      const token = word.toLocaleLowerCase();
      spelling.set(token, index === 0 && word !== "I" ? token : word);
    });
    for (let i = 1; i < tokens.length; i++) {
      for (let size = 1; size <= Math.min(3, i); size++) {
        const context = key(tokens.slice(i - size, i));
        if (!counts.has(context)) counts.set(context, new Map());
        const candidates = counts.get(context);
        candidates.set(tokens[i], (candidates.get(tokens[i]) || 0) + weight);
      }
    }
  }
  english.split(/[.!?\n]+/).forEach((sentence) => train(sentence, 1));
  [...history].reverse().forEach((text, index) => train(text, 8 + index / Math.max(1, history.length)));
  sequence.slice(-256).forEach((text) => train(text, 4));

  function next(context, prefix) {
    for (let size = Math.min(3, context.length); size >= 1; size--) {
      const candidates = counts.get(key(context.slice(-size)));
      if (!candidates) continue;
      let best;
      let score = -1;
      let second = 0;
      let total = 0;
      for (const [token, count] of candidates) {
        if (prefix && (token === END || !token.startsWith(prefix))) continue;
        total += count;
        if (count > score) { second = Math.max(0, score); best = token; score = count; }
        else second = Math.max(second, count);
      }
      if (best !== undefined) return { token: best, confidence: score / total, margin: (score - second) / total };
    }
    return { token: END, confidence: 1, margin: 1 };
  }

  return {
    predict(input) {
      if (!input.trim() || input.length >= 240) return "";
      // Exact personal phrase completions keep routine ranking ahead of English backoff.
      const typed = input.trimStart();
      const personal = matchTasks(history, input, sequence).find((match) => !match.fuzzy);
      if (personal?.confidence >= 0.75 && personal.text.toLocaleLowerCase().startsWith(typed.toLocaleLowerCase())) {
        return personal.text.slice(typed.length).slice(0, 240 - input.length);
      }
      const matches = words(input);
      if (!matches.length) return "";
      const last = matches.at(-1);
      const partial = last.index + last[0].length === input.length;
      if (!partial && !/\s$/.test(input)) return "";
      const prefix = partial ? last[0].toLocaleLowerCase() : "";
      const context = ["<s>", ...matches.slice(0, partial ? -1 : undefined).map(([word]) => word.toLocaleLowerCase())];
      if (context.length === 1 && prefix.length < 2) return "";
      let suffix = "";
      let confidence = 1;
      for (let i = 0; i < 3; i++) {
        const choice = next(context, i === 0 ? prefix : "");
        const { token } = choice;
        if (token === END) break;
        // Allow one uncertain word, but extend only through clear transitions.
        if (suffix.trim() && (choice.confidence < 0.7 || choice.margin < 0.2 || confidence * choice.confidence < 0.55)) break;
        const word = spelling.get(token) || token;
        const addition = i === 0 ? (partial ? word.slice(last[0].length) : word) : ` ${word}`;
        suffix += addition;
        context.push(token);
        if (addition.trim()) {
          confidence *= choice.confidence;
          if (choice.confidence < 0.7 || choice.margin < 0.2) break;
        }
      }
      return suffix.slice(0, 240 - input.length).trimEnd();
    },
  };
}
