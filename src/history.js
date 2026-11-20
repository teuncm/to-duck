// Unique task names are kept separately from chronological repetitions.
export function taskHistory(values) {
  const seen = new Set();
  const history = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const text = value.trim().slice(0, 240);
    const key = text.toLocaleLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    history.push(text);
    if (history.length === 200) break;
  }
  return history;
}

export function taskSequence(values) {
  return values.filter((value) => typeof value === "string")
    .map((value) => value.trim().slice(0, 240)).filter(Boolean).slice(-256);
}

const lower = (text) => text.toLocaleLowerCase().normalize("NFC");

// Prefer the longest familiar routine, then back off to shorter task contexts.
function routineMatches(sequence) {
  const names = sequence.map(lower);
  for (let size = Math.min(3, names.length - 1); size >= 1; size--) {
    const context = names.slice(-size);
    const counts = new Map();
    for (let i = size; i < names.length; i++) {
      if (context.every((name, index) => name === names[i - size + index])) {
        counts.set(names[i], (counts.get(names[i]) || 0) + 1);
      }
    }
    if (counts.size) return { depth: size, counts };
  }
  return { depth: 0, counts: new Map() };
}

// Banded optimal-string-alignment distance against a task prefix. Adjacent
// transpositions count as one typo; the narrow band and early exit bound work.
function prefixDistance(query, candidate, limit) {
  const a = Array.from(query);
  const b = Array.from(candidate).slice(0, a.length + limit);
  if (b.length < a.length - limit) return limit + 1;
  const infinity = limit + 1;
  let older = new Array(b.length + 1).fill(infinity);
  let previous = new Array(b.length + 1).fill(infinity);
  let current = new Array(b.length + 1).fill(infinity);
  for (let j = 0; j <= Math.min(b.length, limit); j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current.fill(infinity);
    current[0] = i <= limit ? i : infinity;
    let best = current[0];
    for (let j = Math.max(1, i - limit); j <= Math.min(b.length, i + limit); j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        current[j] = Math.min(current[j], older[j - 2] + 1);
      }
      best = Math.min(best, current[j]);
    }
    if (best > limit) return infinity;
    [older, previous, current] = [previous, current, older];
  }
  return Math.min(...previous.slice(Math.max(0, a.length - limit)));
}

export function matchTasks(history, input, sequence = [], open = []) {
  const query = lower(input.trim());
  const counts = new Map();
  sequence.forEach((text) => {
    const name = lower(text);
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  const routine = routineMatches(sequence);
  if (!query && !routine.counts.size) return [];
  const alreadyOpen = new Set(open.map(lower));
  const limit = Array.from(query).length >= 8 ? 2 : 1;
  const matches = [];
  history.forEach((text, index) => {
    const name = lower(text);
    if (query && name === query) return;
    const hits = routine.counts.get(name) || 0;
    let distance = 0;
    if (!query) { if (!hits) return; }
    else if (!name.startsWith(query)) {
      if (Array.from(query).length < 4) return;
      distance = prefixDistance(query, name, limit);
      if (distance > limit) return;
    }
    const frequency = counts.get(name) || 0;
    matches.push({
      text, fuzzy: distance > 0, distance, frequency,
      routineDepth: hits ? routine.depth : 0, routineHits: hits,
      score: 12 * hits + 3 * Math.log1p(frequency) + 1 / (index + 1) - (alreadyOpen.has(name) ? 4 : 0),
    });
  });
  matches.sort((a, b) => Number(a.fuzzy) - Number(b.fuzzy) || a.distance - b.distance ||
    b.routineDepth - a.routineDepth || b.score - a.score);
  const exact = matches.filter((match) => !match.fuzzy);
  const routineTotal = exact.reduce((total, match) => total + match.routineHits, 0);
  const frequencyTotal = exact.reduce((total, match) => total + match.frequency + 1, 0);
  for (const match of matches) {
    match.confidence = match.fuzzy ? 0 : match.routineDepth
      ? match.routineHits / routineTotal : (match.frequency + 1) / frequencyTotal;
  }
  return matches;
}

export function suggestTasks(history, input, sequence = [], open = []) {
  return matchTasks(history, input, sequence, open).slice(0, 5).map(({ text }) => text);
}
