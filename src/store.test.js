import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSync, normalize, saveAll } from "./store.js";

describe("saved tasks and ducks", () => {
  beforeEach(() => {
    localStorage.clear();
    for (const cookie of document.cookie.split("; ")) {
      document.cookie = `${cookie.split("=")[0]}=; Max-Age=0; Path=/`;
    }
  });

  afterEach(() => vi.restoreAllMocks());

  it("restores tasks, theme, duck slots, and positions after saving", () => {
    const state = normalize({
      theme: "light",
      addPosition: "bottom",
      open: [{ id: "next", text: "Go outside" }],
      done: [{ id: "done", text: "Drink water", duckSlot: 0 }],
      spots: [{ x: 20, y: 30, angle: 0.5 }],
      savedAt: 100,
    });
    saveAll(state);
    expect(loadSync()).toEqual(state);
  });

  it("recovers the backup when the main saved copy is corrupt", () => {
    localStorage.setItem("to-duck.v1", "{broken");
    localStorage.setItem("to-duck.v1.bak", JSON.stringify({
      open: [{ id: "safe", text: "Still here" }], savedAt: 50,
    }));
    expect(loadSync().open[0].text).toBe("Still here");
  });

  it("defaults older exports to adding at the top", () => {
    expect(normalize({ open: [], done: [] }).addPosition).toBe("top");
    expect(normalize({ addPosition: "invalid" }).addPosition).toBe("top");
  });

  it("opens safely when local storage is blocked and a cookie is malformed", () => {
    document.cookie = "to-duck.0=%invalid; Path=/";
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    expect(loadSync().open).toEqual([]);
  });

  it("repairs duplicate duck slots without changing the imported object", () => {
    const data = { done: [
      { id: "a", text: "One", duckSlot: 2 },
      { id: "b", text: "Two", duckSlot: 2 },
      { id: "c", text: "Three", duckSlot: -1 },
    ] };
    const before = structuredClone(data);
    const state = normalize(data);
    expect(new Set(state.done.map((todo) => todo.duckSlot)).size).toBe(3);
    expect(state.nextSlot).toBeGreaterThan(Math.max(...state.done.map((todo) => todo.duckSlot)));
    expect(data).toEqual(before);
  });
});
