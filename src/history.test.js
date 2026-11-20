import { beforeEach, describe, expect, it } from "vitest";
import { suggestTasks, taskHistory, taskSequence } from "./history.js";
import { loadSync, normalize, saveAll } from "./store.js";

describe("previous to-ducks", () => {
  beforeEach(() => {
    localStorage.clear();
    for (const cookie of document.cookie.split("; ")) document.cookie = cookie.split("=")[0] + "=; Max-Age=0; Path=/";
  });
  it("ranks familiar next steps ahead of simple recency", () => {
    const history = ["Dry dishes", "Fold laundry", "Dry laundry", "Wash laundry"];
    const sequence = ["Wash laundry", "Dry laundry", "Fold laundry", "Wash laundry"];
    expect(suggestTasks(history, "Dry", sequence)[0]).toBe("Dry laundry");
    expect(suggestTasks(history, "", sequence)).toEqual(["Dry laundry"]);
    expect(suggestTasks(history, "", [...sequence, "Dry laundry"])).toEqual(["Fold laundry"]);
  });
  it("uses two-task context instead of a more frequent one-task routine", () => {
    const sequence = ["Prepare report", "Send report", "File receipt",
      "Prepare invoice", "Send report", "Pay supplier", "Prepare invoice", "Send report", "Pay supplier",
      "Prepare report", "Send report"];
    expect(suggestTasks(["Pay supplier", "File receipt"], "", sequence)).toEqual(["File receipt"]);
    expect(suggestTasks(["Pay supplier", "File receipt"], "", [...sequence, "Unfamiliar start", "Send report"])[0]).toBe("Pay supplier");
  });
  it("uses three-task context to distinguish routines with the same last two tasks", () => {
    const sequence = ["Client A", "Prepare invoice", "Send invoice", "Archive A",
      "Client B", "Prepare invoice", "Send invoice", "Archive B",
      "Client B", "Prepare invoice", "Send invoice", "Archive B",
      "Client A", "Prepare invoice", "Send invoice"];
    expect(suggestTasks(["Archive B", "Archive A"], "", sequence)).toEqual(["Archive A"]);
  });
  it.each(["buy grocr", "buy groceires", "by groceries", "buy groxeries"])("finds a previously entered task despite the typo %s", (input) => {
    expect(suggestTasks(["Buy groceries", "Call dentist"], input)[0]).toBe("Buy groceries");
  });
  it("supports adjacent transpositions and Unicode while keeping exact prefixes first", () => {
    expect(suggestTasks(["Water plants"], "waetr plants")).toEqual(["Water plants"]);
    expect(suggestTasks(["Café"], "cafe")).toEqual(["Café"]);
    expect(suggestTasks(["Buy grocer supplies", "Buy groceries"], "buy grocer")[0]).toBe("Buy grocer supplies");
    expect(suggestTasks(["Water plants"], "wa")).toEqual(["Water plants"]);
    expect(suggestTasks(["Water plants"], "wx")).toEqual([]);
    expect(suggestTasks(["Water plants"], "completely unrelated")).toEqual([]);
  });
  it("keeps repeated task sequences through storage and limits their size", () => {
    const sequence = taskSequence(Array.from({length: 300}, (_, i) => i % 2 ? "Dry laundry" : "Wash laundry"));
    expect(sequence).toHaveLength(256);
    const state = normalize({ history: ["Dry laundry", "Wash laundry"], taskSequence: sequence, savedAt: 999 });
    saveAll(state);
    expect(loadSync().taskSequence).toEqual(sequence);
  });
  it("deduplicates case-insensitively and limits stored entries", () => {
    expect(taskHistory([" Tea ", "tea", "", null, "Toast"])).toEqual(["Tea", "Toast"]);
    expect(taskHistory(Array.from({ length: 250 }, (_, i) => `Task ${i}`))).toHaveLength(200);
  });

  it("matches prefixes, limits suggestions, and skips blank and exact matches", () => {
    const history = ["Drink water", "Draw", "Dream", "Dress", "Drive", "Dry clothes", "Water plants"];
    expect(suggestTasks(history, " DR ")).toEqual(history.slice(0, 5));
    expect(suggestTasks(history, "drink water")).toEqual([]);
    expect(suggestTasks(history, "")).toEqual([]);
    expect(suggestTasks(history, "plants")).toEqual([]);
  });

  it("seeds history from existing tasks and Quacked without changing an import", () => {
    const data = {
      open: [{ id: "a", text: "Tea", at: 20 }],
      done: [{ id: "b", text: "Toast", at: 10 }],
    };
    const before = structuredClone(data);
    expect(normalize(data).history).toEqual(["Tea", "Toast"]);
    expect(data).toEqual(before);
  });

  it("restores history even when its tasks have been deleted", () => {
    const state = normalize({ history: ["Remember me"], open: [], done: [], savedAt: Date.now() + 1000 });
    saveAll(state);
    expect(loadSync().history).toEqual(["Remember me"]);
  });
});
