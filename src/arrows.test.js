import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

function press(key, target = document.activeElement || document.body) {
  const down = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  target.dispatchEvent(down);
  const upTarget = document.activeElement || target;
  upTarget.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
}

function rows() {
  return [...document.querySelectorAll("#list .row")];
}

function selectedText() {
  return rows().find((row) => row.classList.contains("active"))?.querySelector(".text")?.textContent ?? null;
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function boot(saved = null) {
  vi.resetModules();
  localStorage.clear();
  if (saved) localStorage.setItem("to-duck.v1", JSON.stringify(saved));
  document.cookie = "to-duck.n=; Max-Age=0; Path=/";
  const html = readFileSync(resolve("index.html"), "utf8");
  const parsed = new DOMParser().parseFromString(html, "text/html");
  parsed.querySelectorAll("script").forEach((node) => node.remove());
  document.head.replaceChildren(...parsed.head.childNodes);
  document.body.replaceChildren(...parsed.body.childNodes);
  await import("./main.js");
  await flush();
}

async function addTodo(text) {
  const draft = document.getElementById("draft");
  draft.focus();
  draft.value = text;
  press("Enter", draft);
  await flush();
}

describe("arrow keys and the add box", () => {
  let documentListeners;
  let windowListeners;
  beforeAll(() => {
    globalThis.matchMedia = () => ({ matches: false });
  });

  beforeEach(async () => {
    documentListeners = vi.spyOn(document, "addEventListener");
    windowListeners = vi.spyOn(window, "addEventListener");
    await boot();
  });

  afterEach(() => {
    vi.useRealTimers();
    // Module resets do not remove listeners attached to the shared jsdom document.
    for (const [type, listener, options] of documentListeners.mock.calls) {
      document.removeEventListener(type, listener, options);
    }
    for (const [type, listener, options] of windowListeners.mock.calls) {
      window.removeEventListener(type, listener, options);
    }
    vi.restoreAllMocks();
  });

  it("moves across the add box, enter button, and position toggle with arrow keys", async () => {
    const draft = document.getElementById("draft");
    const enter = document.getElementById("enter-add");
    const position = document.getElementById("add-position");
    draft.value = "hello";
    draft.focus();
    draft.select();
    press("ArrowRight", draft);
    await flush();
    expect(document.activeElement).toBe(enter);

    press("ArrowRight", enter);
    await flush();
    expect(document.activeElement).toBe(position);
    press("ArrowRight", position);
    expect(document.activeElement).toBe(position);
    press("ArrowLeft", position);
    await flush();
    expect(document.activeElement).toBe(enter);

    press("ArrowLeft", enter);
    await flush();
    expect(document.activeElement).toBe(draft);
    expect(draft.selectionStart).toBe(draft.value.length);
    expect(draft.selectionEnd).toBe(draft.value.length);

    draft.setSelectionRange(2, 2);
    press("ArrowRight", draft);
    await flush();
    expect(document.activeElement).toBe(draft);
    expect(draft.selectionStart).toBe(2);
  });

  it("ignores the a key", async () => {
    await addTodo("one");
    const draft = document.getElementById("draft");
    press("ArrowDown", draft);
    await flush();
    press("a", document.activeElement);
    await flush();
    expect(document.activeElement).not.toBe(draft);
    expect(selectedText()).toBe("One");
  });

  it("reorders open to-dos by dragging and can shuffle them", async () => {
    await addTodo("one");
    await addTodo("two");
    const [first, second] = rows();
    const data = new (globalThis.DataTransfer || class {
      constructor() { this.map = new Map(); }
      setData(type, value) { this.map.set(type, String(value)); }
      getData(type) { return this.map.get(type) || ""; }
    })();
    const drag = (type, target, clientY = 0) => {
      const EventType = globalThis.DragEvent || Event;
      const event = new EventType(type, { bubbles: true, cancelable: true });
      Object.defineProperty(event, "dataTransfer", { value: data });
      Object.defineProperty(event, "clientY", { value: clientY });
      target.dispatchEvent(event);
    };
    drag("dragstart", first.querySelector(".drag-handle"));
    drag("drop", second, 20);
    await flush();
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["One", "Two"]);
    expect(document.querySelector("#archive-list [draggable='true']")).toBeNull();

    const random = Math.random;
    Math.random = () => 0;
    document.getElementById("shuffle-todos").click();
    Math.random = random;
    await flush();
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["Two", "One"]);
  });

  it("focuses the add box on startup", () => {
    expect(document.activeElement).toBe(document.getElementById("draft"));
    expect(selectedText()).toBe(null);
  });

  it.each(["light", "dark"])("starts with the system's %s theme instead of the previous saved appearance", async (theme) => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(prefers-color-scheme: dark)" && theme === "dark",
    }));
    await boot({ theme: theme === "dark" ? "light" : "dark", savedAt: 100 });
    expect(document.documentElement.dataset.theme).toBe(theme);
    expect(document.querySelector('meta[name="theme-color"]').content).toBe(theme === "dark" ? "#0e0e0e" : "#f6f6f4");
    document.getElementById("theme").click();
    expect(document.documentElement.dataset.theme).toBe(theme === "dark" ? "light" : "dark");
  });

  it("toggles adding at the bottom or top without changing existing order", async () => {
    await addTodo("one");
    await addTodo("two");
    const toggle = document.getElementById("add-position");
    expect(toggle.dataset.position).toBe("top");
    toggle.click();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(toggle.title).toContain("Adding at bottom");
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["Two", "One"]);
    await addTodo("three");
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["Two", "One", "Three"]);
    expect(JSON.parse(localStorage.getItem("to-duck.v1")).addPosition).toBe("bottom");
    toggle.click();
    await addTodo("four");
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["Four", "Two", "One", "Three"]);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(JSON.parse(localStorage.getItem("to-duck.v1")).addPosition).toBe("top");
  });

  it("reorders with the handle's arrow keys and saves the order", async () => {
    await addTodo("one");
    await addTodo("two");
    const handle = rows()[0].querySelector(".drag-handle");
    handle.focus();
    press("ArrowDown", handle);
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["One", "Two"]);
    expect(document.activeElement).toBe(rows()[1].querySelector(".drag-handle"));
    const saved = JSON.parse(localStorage.getItem("to-duck.v1"));
    expect(saved.open.map((todo) => todo.text)).toEqual(["One", "Two"]);
    expect(saved.done).toHaveLength(0);
    press("ArrowDown", document.activeElement);
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["One", "Two"]);
  });

  it("reaches the reorder handle from the add box using only arrow keys", async () => {
    await addTodo("one");
    await addTodo("two");
    press("ArrowDown", document.getElementById("draft"));
    press("ArrowLeft", document.activeElement);
    expect(document.activeElement).toBe(rows()[0].querySelector(".tick"));
    press("ArrowLeft", document.activeElement);
    expect(document.activeElement).toBe(rows()[0].querySelector(".drag-handle"));
    expect(document.activeElement.classList.contains("keytarget")).toBe(true);
    press("ArrowDown", document.activeElement);
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["One", "Two"]);
    expect(document.activeElement).toBe(rows()[1].querySelector(".drag-handle"));
    press("ArrowRight", document.activeElement);
    expect(document.activeElement).toBe(rows()[1].querySelector(".tick"));
    press("ArrowRight", document.activeElement);
    expect(document.activeElement).toBe(rows()[1]);
    press("ArrowRight", document.activeElement);
    expect(document.activeElement).toBe(rows()[1].querySelector(".trash"));
  });

  it.each(["pointerup", "pointercancel"])("handles touch reordering and %s", async (ending) => {
    await addTodo("one");
    await addTodo("two");
    const initial = rows();
    initial.forEach((row, index) => {
      row.getBoundingClientRect = () => ({ top: index * 36, bottom: (index + 1) * 36, height: 36 });
    });
    const handle = initial[0].querySelector(".drag-handle");
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = () => true;
    handle.releasePointerCapture = vi.fn();
    const pointer = (type, y) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        pointerType: { value: "touch" },
        pointerId: { value: 1 },
        clientY: { value: y },
      });
      handle.dispatchEvent(event);
    };
    pointer("pointerdown", 18);
    pointer("pointermove", 60);
    expect(initial[0].classList.contains("dragging")).toBe(true);
    pointer(ending, 60);
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(
      ending === "pointerup" ? ["One", "Two"] : ["Two", "One"]
    );
    expect(document.querySelector(".dragging, .drop-before, .drop-after")).toBeNull();
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("moves down the list from the add box without skipping", async () => {
    await addTodo("one");
    await addTodo("two");
    const draft = document.getElementById("draft");
    draft.value = "draft";
    press("ArrowDown", draft);
    await flush();

    expect(selectedText()).toBe("Two");
    expect(document.activeElement).toBe(rows()[0]);

    press("ArrowDown", document.activeElement);
    await flush();
    expect(selectedText()).toBe("One");
    expect(document.activeElement).toBe(rows()[1]);
  });

  it("clears the selection from the add box and the last to-do", async () => {
    await addTodo("one");
    await addTodo("two");
    const draft = document.getElementById("draft");
    press("ArrowUp", draft);
    await flush();
    expect(selectedText()).toBe(null);
    expect(document.activeElement).not.toBe(draft);

    press("ArrowDown", document.activeElement);
    await flush();
    expect(document.activeElement).toBe(draft);

    press("ArrowDown", draft);
    await flush();
    press("ArrowDown", document.activeElement);
    await flush();
    press("ArrowDown", document.activeElement);
    await flush();
    expect(selectedText()).toBe(null);
    expect(document.activeElement).not.toBe(draft);
    expect(document.activeElement?.closest?.("#list")).toBeFalsy();
  });

  it("returns to the add box with its text selected", async () => {
    await addTodo("one");
    await addTodo("two");
    const draft = document.getElementById("draft");
    draft.value = "draft";
    press("ArrowDown", draft);
    await flush();
    press("ArrowUp", document.activeElement);
    await flush();

    expect(selectedText()).toBe(null);
    expect(document.activeElement).toBe(draft);
    expect(draft.selectionStart).toBe(0);
    expect(draft.selectionEnd).toBe("draft".length);
  });

  it("focuses the add box when down is pressed with nothing selected", async () => {
    await addTodo("one");
    const draft = document.getElementById("draft");
    draft.value = "draft";
    draft.blur();
    document.body.focus();
    press("ArrowDown", document.body);
    await flush();

    expect(document.activeElement).toBe(draft);
    expect(draft.selectionStart).toBe(0);
    expect(draft.selectionEnd).toBe("draft".length);
    expect(selectedText()).toBe(null);
  });

  it("selects the last to-do when up is pressed with nothing selected", async () => {
    await addTodo("one");
    await addTodo("two");
    document.getElementById("draft").blur();
    document.body.focus();
    press("ArrowUp", document.body);
    await flush();

    expect(selectedText()).toBe("One");
    expect(document.activeElement).toBe(rows().at(-1));
  });

  it.each([
    ["  buy milk  ", "Buy milk"],
    ["read the NASA report", "Read the NASA report"],
    ["🦆 élève notes", "🦆 Élève notes"],
  ])("capitalizes the first letter of %s when added", async (input, expected) => {
    await addTodo(input);
    expect(rows()[0].querySelector(".text").textContent).toBe(expected);
    const saved = JSON.parse(localStorage.getItem("to-duck.v1"));
    expect(saved.open[0].text).toBe(expected);
    expect(saved.history[0]).toBe(expected);
  });

  it("ignores blank tasks and renders task text safely", async () => {
    await addTodo("   ");
    expect(rows()).toHaveLength(0);
    await addTodo("<img src=x onerror=alert(1)>");
    expect(rows()[0].querySelector(".text").textContent).toBe("<Img src=x onerror=alert(1)>");
    expect(rows()[0].querySelector("img")).toBeNull();
  });

  it("suggests deleted tasks and fills a suggestion without adding it", async () => {
    vi.spyOn(globalThis, "matchMedia").mockReturnValue({ matches: true });
    await addTodo("Drink water");
    rows()[0].querySelector(".trash").click();
    const draft = document.getElementById("draft");
    draft.focus();
    draft.value = "dr";
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const suggestions = document.getElementById("suggestions");
    expect(suggestions.hidden).toBe(false);
    expect(suggestions.textContent).toBe("Drink water");
    press("ArrowDown", draft);
    expect(draft.getAttribute("aria-activedescendant")).toBe("suggestion-0");
    press("Enter", draft);
    expect(draft.value).toBe("Drink water");
    expect(rows()).toHaveLength(0);
    expect(suggestions.hidden).toBe(true);
    press("Enter", draft);
    expect(rows()).toHaveLength(1);
  });

  it("shows typo matches without changing typed text until explicitly selected", async () => {
    await addTodo("Buy groceries");
    const draft = document.getElementById("draft");
    draft.value = "buy grocr";
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(document.querySelector("#suggestions [role=option]").textContent).toBe("Buy groceries");
    expect(draft.value).toBe("buy grocr");
    expect(document.getElementById("prediction").hidden).toBe(true);
    press("ArrowDown", draft);
    press("Tab", draft);
    expect(draft.value).toBe("Buy groceries");
    expect(rows()).toHaveLength(1);
  });

  it("supports clicking suggestions and dismissing them with Escape", async () => {
    await addTodo("Make tea");
    const draft = document.getElementById("draft");
    draft.value = "ma";
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    document.querySelector("#suggestions [role=option]").click();
    expect(draft.value).toBe("Make tea");
    expect(document.activeElement).toBe(draft);
    draft.value = "ma";
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    press("Escape", draft);
    expect(document.getElementById("suggestions").hidden).toBe(true);
    expect(document.activeElement).toBe(draft);
    expect(draft.value).toBe("ma");
  });

  it("clears suggestion history with Clear All", async () => {
    await addTodo("Make tea");
    document.getElementById("clear-all").click();
    const draft = document.getElementById("draft");
    draft.focus();
    draft.value = "ma";
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(document.getElementById("suggestions").hidden).toBe(true);
    expect(JSON.parse(localStorage.getItem("to-duck.v1")).history).toEqual([]);
  });

  it("shows an English prediction and accepts it with Tab without submitting", async () => {
    const draft = document.getElementById("draft");
    draft.value = "Please se";
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await flush();
    expect(document.getElementById("prediction").hidden).toBe(false);
    expect(document.getElementById("prediction-suffix").textContent).toBe("nd me");
    press("Tab", draft);
    expect(draft.value).toBe("Please send me");
    expect(document.activeElement).toBe(draft);
    expect(rows()).toHaveLength(0);
    press("Enter", draft);
    expect(rows()[0].querySelector(".text").textContent).toBe("Please send me");
  });

  it("suggests a familiar next task after repeating the start of a routine", async () => {
    await addTodo("Wash laundry");
    await addTodo("Dry laundry");
    await addTodo("Fold laundry");
    await addTodo("Wash laundry");
    expect(document.querySelector("#suggestions [role=option]").textContent).toBe("Dry laundry");
    const saved = JSON.parse(localStorage.getItem("to-duck.v1"));
    expect(saved.taskSequence).toEqual(["Wash laundry", "Dry laundry", "Fold laundry", "Wash laundry"]);
    document.getElementById("clear-all").click();
    expect(JSON.parse(localStorage.getItem("to-duck.v1")).taskSequence).toEqual([]);
  });

  it("keeps normal Tab navigation when no prediction is available or Shift is held", () => {
    const draft = document.getElementById("draft");
    draft.value = "qzxw ";
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    draft.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    draft.value = "Please se";
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    const shiftTab = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    draft.dispatchEvent(shiftTab);
    expect(shiftTab.defaultPrevented).toBe(false);
    expect(draft.value).toBe("Please se");
  });

  it("hides predictions for text selection, composition, blur, and Quacked", async () => {
    const draft = document.getElementById("draft");
    draft.value = "Please se";
    draft.setSelectionRange(2, 2);
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(document.getElementById("prediction").hidden).toBe(true);
    draft.setSelectionRange(draft.value.length, draft.value.length);
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await flush();
    expect(document.getElementById("prediction").hidden).toBe(false);
    draft.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    expect(document.getElementById("prediction").hidden).toBe(true);
    press("Tab", draft);
    expect(draft.value).toBe("Please se");
    draft.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    draft.blur();
    expect(document.getElementById("prediction").hidden).toBe(true);
    draft.focus();
    document.getElementById("archive-toggle").click();
    expect(document.getElementById("prediction").hidden).toBe(true);
  });

  it("uses Tab to accept a highlighted history suggestion before a model prediction", async () => {
    await addTodo("Please send my special message");
    const draft = document.getElementById("draft");
    draft.value = "Please se";
    draft.dispatchEvent(new InputEvent("input", { bubbles: true }));
    press("ArrowDown", draft);
    press("Tab", draft);
    expect(draft.value).toBe("Please send my special message");
    expect(rows()).toHaveLength(1);
  });

  it("disables the add bar in Quacked and restores the draft on return", async () => {
    const draft = document.getElementById("draft");
    const submit = document.getElementById("enter-add");
    const composer = document.getElementById("composer");
    draft.value = "Keep my draft";
    document.getElementById("archive-toggle").click();
    expect(document.getElementById("archive-toggle").getAttribute("aria-pressed")).toBe("true");
    expect(draft.disabled).toBe(true);
    expect(submit.disabled).toBe(true);
    expect(document.getElementById("add-position").disabled).toBe(true);
    expect(composer.classList.contains("disabled")).toBe(true);
    composer.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(rows()).toHaveLength(0);
    expect(document.getElementById("archive").hidden).toBe(false);
    document.getElementById("archive-toggle").click();
    expect(draft.disabled).toBe(false);
    expect(submit.disabled).toBe(false);
    expect(document.getElementById("add-position").disabled).toBe(false);
    expect(draft.value).toBe("Keep my draft");
    expect(draft.placeholder).toBe("Add...");
    submit.click();
    expect(document.getElementById("list").hidden).toBe(false);
    expect(document.getElementById("archive").hidden).toBe(true);
    expect(rows()[0].textContent).toContain("Keep my draft");
  });

  it("awards one duck despite repeated completion clicks and a rerender", async () => {
    await addTodo("Take a walk");
    const tick = rows()[0].querySelector(".tick");
    tick.click();
    tick.click();
    document.getElementById("archive-toggle").click();
    document.getElementById("archive-toggle").click();
    rows()[0].querySelector(".tick").click();
    await new Promise((resolve) => setTimeout(resolve, 360));
    const saved = JSON.parse(localStorage.getItem("to-duck.v1"));
    expect(saved.open).toHaveLength(0);
    expect(saved.done).toHaveLength(1);
    expect(saved.nextSlot).toBe(1);
    expect(document.getElementById("announcement").textContent).toContain("A little duck joins you");
    expect(document.getElementById("empty").textContent).toContain("All clear");
  });

  it("does not complete a task behind a dialog", async () => {
    await addTodo("Keep me open");
    document.getElementById("draft").blur();
    document.getElementById("help").setAttribute("open", "");
    press("c", document.body);
    await new Promise((resolve) => setTimeout(resolve, 360));
    expect(rows()).toHaveLength(1);
    expect(document.querySelectorAll("#archive-list .row")).toHaveLength(0);
  });

  it("leaves zen mode with Escape", async () => {
    await addTodo("One quiet thing");
    document.getElementById("zen-toggle").click();
    expect(document.getElementById("zen").hidden).toBe(false);
    press("Escape", document.activeElement);
    expect(document.getElementById("zen").hidden).toBe(true);
  });

  it("enables Right ducks after earning a duck and saves its upright direction", async () => {
    const right = document.getElementById("right-ducks");
    expect(right.disabled).toBe(true);
    expect(document.getElementById("respawn-ducks").nextElementSibling).toBe(right);
    vi.spyOn(globalThis, "matchMedia").mockReturnValue({ matches: true });
    await addTodo("Earn a duck");
    rows()[0].querySelector(".tick").click();
    expect(right.disabled).toBe(false);
    right.click();
    const saved = JSON.parse(localStorage.getItem("to-duck.v1"));
    expect(saved.spots[saved.done[0].duckSlot].angle).toBe(0);
    expect(saved.done).toHaveLength(1);
    document.getElementById("clear-all").click();
    expect(right.disabled).toBe(true);
  });

  it("selects Quacked items by click and keyboard and clears the duck highlight on exit", async () => {
    vi.spyOn(globalThis, "matchMedia").mockReturnValue({ matches: true });
    await addTodo("first duck");
    rows()[0].querySelector(".tick").click();
    await addTodo("second duck");
    rows()[0].querySelector(".tick").click();
    await addTodo("still open");
    document.getElementById("archive-toggle").click();
    const quacked = [...document.querySelectorAll("#archive-list .row")];
    quacked[1].click();
    expect(quacked[1].getAttribute("aria-current")).toBe("true");
    expect(document.getElementById("jar").getAttribute("aria-label")).toContain("Highlighted: First duck");
    press("ArrowUp", document.activeElement);
    expect(quacked[0].classList.contains("picked")).toBe(true);
    expect(quacked[1].classList.contains("picked")).toBe(false);
    expect(document.getElementById("jar").getAttribute("aria-label")).toContain("Highlighted: Second duck");
    press("Enter", document.activeElement);
    expect(rows()).toHaveLength(1);
    press("Escape", document.activeElement);
    expect(document.querySelector("#archive-list .picked")).toBeNull();
    expect(document.getElementById("jar").getAttribute("aria-label")).toBe("Ducks");
    quacked[1].focus();
    expect(quacked[1].classList.contains("picked")).toBe(true);
    document.getElementById("archive-toggle").click();
    expect(document.getElementById("jar").getAttribute("aria-label")).toBe("Ducks");
  });

  it("moves the duck highlight to the next Quacked item when deleting the selection", async () => {
    vi.spyOn(globalThis, "matchMedia").mockReturnValue({ matches: true });
    await addTodo("first duck");
    rows()[0].querySelector(".tick").click();
    await addTodo("second duck");
    rows()[0].querySelector(".tick").click();
    document.getElementById("archive-toggle").click();
    document.querySelector("#archive-list .row").click();
    press("d", document.activeElement);
    expect(document.getElementById("jar").getAttribute("aria-label")).toContain("Highlighted: First duck");
    press("d", document.activeElement);
    expect(document.querySelector("#archive-list .picked")).toBeNull();
    expect(document.getElementById("jar").getAttribute("aria-label")).toBe("Ducks");
  });

  it("disables deletion in zen mode and restores it after exiting", async () => {
    vi.spyOn(globalThis, "matchMedia").mockReturnValue({ matches: true });
    await addTodo("Keep while focused");
    document.getElementById("zen-toggle").click();
    expect(document.querySelector("#zen .trash")).toBeNull();
    press("ArrowRight", document.activeElement);
    expect(document.activeElement).toBe(document.getElementById("zen-tick"));
    press("d", document.activeElement);
    rows()[0].querySelector(".trash").click();
    expect(rows()).toHaveLength(1);
    expect(document.getElementById("zen-task").textContent).toBe("Keep while focused");
    expect(document.querySelectorAll("#archive-list .row")).toHaveLength(0);
    press("Escape", document.activeElement);
    press("d", document.activeElement);
    expect(rows()).toHaveLength(0);
    expect(document.getElementById("zen").hidden).toBe(true);
    expect(document.activeElement).toBe(document.getElementById("draft"));
  });

  it("deletes the intended tasks when two deletions overlap", async () => {
    await addTodo("keep");
    await addTodo("remove second");
    await addTodo("remove first");
    rows()[0].querySelector(".trash").click();
    rows()[1].querySelector(".trash").click();
    await new Promise((resolve) => setTimeout(resolve, 260));
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["Keep"]);
  });

  it("completes immediately when reduced motion is preferred", async () => {
    vi.spyOn(globalThis, "matchMedia").mockReturnValue({ matches: true });
    await addTodo("A calm completion");
    rows()[0].querySelector(".tick").click();
    expect(rows()).toHaveLength(0);
    expect(document.querySelectorAll("#archive-list .row")).toHaveLength(1);
  });

  it.each([false, true])("finishes the glow, fade, and gap close in 220ms (zen: %s)", async (zen) => {
    await addTodo("Next task");
    await addTodo("Finish this");
    if (zen) document.getElementById("zen-toggle").click();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const outgoing = rows()[0];
    (zen ? document.getElementById("zen-tick") : outgoing.querySelector(".tick")).click();
    expect(outgoing.classList.contains("completing")).toBe(true);
    if (zen) expect(document.querySelector(".zen-item").classList.contains("completing")).toBe(true);

    await vi.advanceTimersByTimeAsync(119);
    expect(outgoing.classList.contains("leaving")).toBe(false);
    expect(rows()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(outgoing.classList.contains("leaving")).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(rows()).toHaveLength(1);
    expect(rows()[0].querySelector(".text").textContent).toBe("Next task");
    expect(document.querySelectorAll("#archive-list .row")).toHaveLength(1);
    if (zen) {
      expect(document.getElementById("zen-task").textContent).toBe("Next task");
      expect(document.querySelector(".zen-item").classList.contains("completing")).toBe(false);
    }
  });

  it("does not submit text while an input method is composing", () => {
    const draft = document.getElementById("draft");
    draft.value = "Still composing";
    draft.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Enter", isComposing: true, bubbles: true, cancelable: true,
    }));
    expect(rows()).toHaveLength(0);
    expect(draft.value).toBe("Still composing");
  });

  it("does not restore a cleared task when its completion animation finishes", async () => {
    await addTodo("Clear me");
    rows()[0].querySelector(".tick").click();
    document.getElementById("clear-all").click();
    await new Promise((resolve) => setTimeout(resolve, 360));
    const saved = JSON.parse(localStorage.getItem("to-duck.v1"));
    expect(saved.open).toHaveLength(0);
    expect(saved.done).toHaveLength(0);
    expect(saved.nextSlot).toBe(0);
  });
});
