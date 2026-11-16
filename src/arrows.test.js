import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

function installCanvas() {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const noop = () => {};
  HTMLCanvasElement.prototype.getContext = () => ({
    setTransform: noop,
    beginPath: noop,
    ellipse: noop,
    arc: noop,
    fill: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    closePath: noop,
    clearRect: noop,
    drawImage: noop,
    fillStyle: "",
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  });
}

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

async function boot() {
  vi.resetModules();
  localStorage.clear();
  document.cookie = "todojar.n=; Max-Age=0; Path=/";
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
    installCanvas();
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

  it("moves between the add box and its enter button", async () => {
    const draft = document.getElementById("draft");
    const enter = document.getElementById("enter-add");
    draft.value = "hello";
    draft.focus();
    draft.select();
    press("ArrowRight", draft);
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
    expect(selectedText()).toBe("one");
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
    drag("dragstart", first);
    drag("drop", second, 20);
    await flush();
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["one", "two"]);
    expect(document.querySelector("#archive-list [draggable='true']")).toBeNull();

    const random = Math.random;
    Math.random = () => 0;
    document.getElementById("shuffle-todos").click();
    Math.random = random;
    await flush();
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["two", "one"]);
  });

  it("focuses the add box on startup", () => {
    expect(document.activeElement).toBe(document.getElementById("draft"));
    expect(selectedText()).toBe(null);
  });

  it("moves down the list from the add box without skipping", async () => {
    await addTodo("one");
    await addTodo("two");
    const draft = document.getElementById("draft");
    draft.value = "draft";
    press("ArrowDown", draft);
    await flush();

    expect(selectedText()).toBe("two");
    expect(document.activeElement).toBe(rows()[0]);

    press("ArrowDown", document.activeElement);
    await flush();
    expect(selectedText()).toBe("one");
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

    expect(selectedText()).toBe("one");
    expect(document.activeElement).toBe(rows().at(-1));
  });

  it("ignores blank tasks and renders task text safely", async () => {
    await addTodo("   ");
    expect(rows()).toHaveLength(0);
    await addTodo("<img src=x onerror=alert(1)>");
    expect(rows()[0].querySelector(".text").textContent).toBe("<img src=x onerror=alert(1)>");
    expect(rows()[0].querySelector("img")).toBeNull();
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
    expect(composer.classList.contains("disabled")).toBe(true);
    composer.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(rows()).toHaveLength(0);
    expect(document.getElementById("archive").hidden).toBe(false);
    document.getElementById("archive-toggle").click();
    expect(draft.disabled).toBe(false);
    expect(submit.disabled).toBe(false);
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
    const saved = JSON.parse(localStorage.getItem("todojar.v1"));
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
    expect(rows().map((row) => row.querySelector(".text").textContent)).toEqual(["keep"]);
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
    const saved = JSON.parse(localStorage.getItem("todojar.v1"));
    expect(saved.open).toHaveLength(0);
    expect(saved.done).toHaveLength(0);
    expect(saved.nextSlot).toBe(0);
  });
});
