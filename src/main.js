import "./style.css";
import { Archive, Moon, Settings, Sun, Trash2, createIcons } from "lucide";
import { createJar } from "./jar.js";
import { loadIndexedDB, loadSync, normalize, saveAll } from "./store.js";
import { suggestTasks, taskHistory, taskSequence } from "./history.js";
import { createPredictor } from "./predictor.js";
import { systemTheme } from "./theme.js";

createIcons({
  icons: { Archive, Moon, Settings, Sun, Trash2 },
  attrs: { width: "18", height: "18", "stroke-width": "1.75", "aria-hidden": "true" },
});

const draft = document.getElementById("draft");
const enterAdd = document.getElementById("enter-add");
const composer = document.getElementById("composer");
const addPosition = document.getElementById("add-position");
const suggestions = document.getElementById("suggestions");
let suggestionIndex = -1;
const prediction = document.getElementById("prediction");
const predictionPrefix = document.getElementById("prediction-prefix");
const predictionSuffix = document.getElementById("prediction-suffix");
const predictionContent = document.getElementById("prediction-content");
const predictionHelp = document.getElementById("prediction-help");
let predictor;
let predictorHistory;
let continuation = "";
let composing = false;
const list = document.getElementById("list");
const todoBox = document.querySelector(".list-box");
const empty = document.getElementById("empty");
const archiveToggle = document.getElementById("archive-toggle");
const announcement = document.getElementById("announcement");
const shuffleBtn = document.getElementById("shuffle-todos");
const archive = document.getElementById("archive");
const archiveList = document.getElementById("archive-list");
const archiveEmpty = document.getElementById("archive-empty");
const settingsBtn = document.getElementById("settings");
const settingsPanel = document.getElementById("settings-panel");
const clearAllBtn = document.getElementById("clear-all");
const clearTodosBtn = document.getElementById("clear-todos");
const clearArchiveBtn = document.getElementById("clear-archive");
const respawnBtn = document.getElementById("respawn-ducks");
const rightDucksBtn = document.getElementById("right-ducks");
const zenBtn = document.getElementById("zen-toggle");
const zenEl = document.getElementById("zen");
const zenTask = document.getElementById("zen-task");
const zenTick = document.getElementById("zen-tick");
const helpOpen = document.getElementById("help-open");
const help = document.getElementById("help");
const exportOpen = document.getElementById("export-open");
const importOpen = document.getElementById("import-open");
const transfer = document.getElementById("transfer");
const transferTitle = document.getElementById("transfer-title");
const transferText = document.getElementById("transfer-text");
const transferError = document.getElementById("transfer-error");
const transferDownload = document.getElementById("transfer-download");
const transferChoose = document.getElementById("transfer-choose");
const transferApply = document.getElementById("transfer-apply");
const transferFile = document.getElementById("transfer-file");
const themeBtn = document.getElementById("theme");
const jar = createJar(document.getElementById("jar"));

let state = loadSync();
// Each visit starts with the OS appearance; the theme button overrides this visit.
state.theme = systemTheme();
let active = -1;
let picked = null;
let archiveOpen = false;
let zenOn = false;
let chordUntil = 0;
let edits = 0;
const pending = new Set();
const deleting = new Set();

function rememberSpots() {
  state.spots = jar.capture(state.nextSlot || 0);
}

function save() {
  edits += 1;
  state.savedAt = Date.now();
  rememberSpots();
  saveAll(state);
}

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  const color = state.theme === "dark" ? "#0e0e0e" : "#f6f6f4";
  document.querySelector('meta[name="theme-color"]').content = color;
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]').content =
    state.theme === "dark" ? "black-translucent" : "default";
  themeBtn.setAttribute(
    "aria-label",
    state.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
  );
}

function item(text) {
  return { id: crypto.randomUUID(), text, at: Date.now() };
}

function markOverflow() {
  const scroller = todoBox.querySelector("main");
  const extra = scroller.scrollHeight - scroller.clientHeight;
  todoBox.classList.toggle("overflow-top", extra > 1 && scroller.scrollTop > 1);
  todoBox.classList.toggle("overflow-bottom", extra > 1 && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1);
}

function render(persist = true) {
  if (!state.done.some((todo) => todo.id === picked)) picked = null;
  if (zenOn && state.open.length) active = 0;
  list.replaceChildren(...state.open.map((todo, i) => row(todo, i)));
  empty.hidden = archiveOpen || state.open.length > 0;
  const n = state.done.length;
  archiveToggle.setAttribute("aria-pressed", archiveOpen ? "true" : "false");
  archiveToggle.setAttribute("aria-label", archiveOpen ? "Show To-ducks" : "Show Quacked");
  archiveToggle.title = archiveOpen ? "To-ducks" : "Quacked";
  document.querySelector("h1.title").textContent = archiveOpen ? "Quacked" : "To-Duck";
  draft.disabled = archiveOpen;
  enterAdd.disabled = archiveOpen;
  addPosition.disabled = archiveOpen;
  syncAddPosition();
  composer.classList.toggle("disabled", archiveOpen);
  closeSuggestions();
  if (!state.open.length && state.done.length) {
    empty.replaceChildren("All clear. Enjoy the company.");
  } else if (!state.open.length) {
    const hint = document.createElement("span");
    hint.textContent = "Add something above to begin.";
    empty.replaceChildren("A little task. A little duck.", hint);
  }
  list.hidden = archiveOpen;
  archive.hidden = !archiveOpen;
  archiveEmpty.hidden = !archiveOpen || n > 0;
  clearAllBtn.disabled = state.open.length === 0 && n === 0;
  clearTodosBtn.disabled = state.open.length === 0;
  clearArchiveBtn.disabled = n === 0;
  shuffleBtn.disabled = state.open.length < 2;
  respawnBtn.disabled = n === 0;
  rightDucksBtn.disabled = n === 0;
  zenBtn.disabled = state.open.length === 0;
  archiveList.replaceChildren(
    ...state.done.map((todo) => row(todo, -1, true))
  );
  createIcons({
    icons: { Archive, Moon, Settings, Sun, Trash2 },
    attrs: { width: "18", height: "18", "stroke-width": "1.75", "aria-hidden": "true" },
  });
  syncZen();
  syncDuckHighlight();
  if (persist) save();
  requestAnimationFrame(markOverflow);
}

function flock() {
  return state.done.map((todo) => todo.duckSlot);
}

function syncDuckHighlight() {
  const selected = archiveOpen ? state.done.find((todo) => todo.id === picked) : null;
  jar.setHighlight(selected?.duckSlot ?? null);
  document.getElementById("jar").setAttribute("aria-label", selected ? `Ducks. Highlighted: ${selected.text}` : "Ducks");
}

function selectQuacked(id, focus = true) {
  focusIntent = null;
  picked = state.done.some((todo) => todo.id === id) ? id : null;
  for (const row of archiveList.children) {
    const selected = row.dataset.id === picked;
    row.classList.toggle("picked", selected);
    if (selected) row.setAttribute("aria-current", "true");
    else row.removeAttribute("aria-current");
    if (selected && focus) {
      row.focus();
      row.scrollIntoView?.({ block: "nearest" });
    }
  }
  syncDuckHighlight();
}

function row(todo, index, archived = false) {
  const li = document.createElement("li");
  li.className = "row" + (!archived && index === active ? " active" : "") + (archived && todo.id === picked ? " picked" : "");
  li.dataset.id = todo.id;
  li.classList.toggle("completing", !archived && pending.has(todo.id));
  if (!archived) {
    li.tabIndex = -1;
  } else {
    li.tabIndex = 0;
    li.title = "Select to highlight its duck";
    if (todo.id === picked) li.setAttribute("aria-current", "true");
  }

  const clip = document.createElement("div");
  clip.className = "row-clip";
  const inner = document.createElement("div");
  inner.className = "row-inner";

  const tick = document.createElement("button");
  tick.type = "button";
  tick.className = archived ? "tick done" : "tick";
  if (!archived && pending.has(todo.id)) tick.classList.add("pop");
  tick.setAttribute("aria-label", archived ? `Quacked: ${todo.text}` : `Complete ${todo.text}`);
  tick.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.2 8.2 6.4 11.4 12.8 4.6"/></svg>';
  if (archived) tick.disabled = true;

  const text = document.createElement("span");
  text.className = "text";
  text.textContent = todo.text;

  const trash = document.createElement("button");
  trash.type = "button";
  trash.className = "trash";
  trash.setAttribute("aria-label", `Delete ${todo.text}`);
  trash.innerHTML = '<i data-lucide="trash-2"></i>';
  trash.addEventListener("mousedown", (e) => e.preventDefault());
  trash.addEventListener("click", (e) => {
    e.stopPropagation();
    if (zenOn) return;
    if (archived) removeDone(todo.id);
    else removeOpen(todo.id);
  });

  inner.append(tick, text, trash);
  if (!archived) {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "drag-handle";
    handle.draggable = true;
    handle.disabled = pending.has(todo.id) || deleting.has(todo.id);
    handle.setAttribute("aria-label", `Reorder ${todo.text}`);
    handle.title = "Drag to reorder, or use Up and Down";
    handle.innerHTML = '<svg viewBox="0 0 16 20" width="12" height="16" fill="currentColor" aria-hidden="true"><circle cx="5" cy="4" r="1.25"/><circle cx="11" cy="4" r="1.25"/><circle cx="5" cy="10" r="1.25"/><circle cx="11" cy="10" r="1.25"/><circle cx="5" cy="16" r="1.25"/><circle cx="11" cy="16" r="1.25"/></svg>';
    handle.addEventListener("click", (event) => event.stopPropagation());
    handle.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      focusIntent = null;
      event.preventDefault();
      event.stopPropagation();
      const from = state.open.findIndex((item) => item.id === todo.id);
      reorderOpen(from, from + (event.key === "ArrowUp" ? -1 : 1));
      focusKey([...list.children].find((row) => row.dataset.id === todo.id)?.querySelector(".drag-handle"));
    });
    // Native HTML drag handles cover mouse input; pointer capture covers touch/pen.
    let pointer = null;
    let dropTarget = null;
    let startY = 0;
    let moved = false;
    handle.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" || handle.disabled || zenOn) return;
      pointer = event.pointerId;
      startY = event.clientY;
      moved = false;
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener("pointermove", (event) => {
      if (pointer !== event.pointerId) return;
      if (!moved && Math.abs(event.clientY - startY) < 6) return;
      moved = true;
      li.classList.add("dragging");
      const scroller = todoBox.querySelector("main");
      const bounds = scroller.getBoundingClientRect();
      if (event.clientY < bounds.top + 28) scroller.scrollTop -= 16;
      else if (event.clientY > bounds.bottom - 28) scroller.scrollTop += 16;
      dropTarget = [...list.children].find((row) => {
        const rect = row.getBoundingClientRect();
        return event.clientY >= rect.top && event.clientY <= rect.bottom;
      }) || null;
      clearDropMarks();
      if (dropTarget) markDrop(dropTarget, event.clientY);
    });
    const endPointer = (event) => {
      if (pointer !== event.pointerId) return;
      pointer = null;
      li.classList.remove("dragging");
      clearDropMarks();
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      if (event.type === "pointerup" && moved && dropTarget) {
        dropOn(todo.id, dropTarget, event.clientY);
      }
      dropTarget = null;
    };
    handle.addEventListener("pointerup", endPointer);
    handle.addEventListener("pointercancel", endPointer);
    inner.prepend(handle);
  }
  clip.append(inner);
  li.append(clip);

  if (!archived) {
    tick.addEventListener("click", (e) => {
      e.stopPropagation();
      complete(todo.id, tick, li);
    });
    li.addEventListener("click", () => {
      active = index;
      render();
      list.children[index]?.focus();
    });
    li.addEventListener("dragstart", (e) => {
      if (!e.target.closest(".drag-handle") || pending.has(todo.id) || deleting.has(todo.id) || zenOn) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", todo.id);
      li.classList.add("dragging");
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      clearDropMarks();
    });
    li.addEventListener("dragover", (e) => {
      if (!list.querySelector(".dragging")) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      markDrop(li, e.clientY);
    });
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      clearDropMarks();
      if (!list.querySelector(".dragging")) return;
      dropOn(id, li, e.clientY);
    });
  } else {
    li.addEventListener("click", () => selectQuacked(todo.id));
    li.addEventListener("focus", () => selectQuacked(todo.id, false));
  }
  return li;
}

function clearDropMarks() {
  list.querySelectorAll(".drop-before, .drop-after").forEach((node) => {
    node.classList.remove("drop-before", "drop-after");
  });
}

function dropOn(id, target, clientY) {
  const from = state.open.findIndex((item) => item.id === id);
  if (from < 0 || zenOn) return;
  const index = [...list.children].indexOf(target);
  if (index < 0) return;
  const rect = target.getBoundingClientRect();
  let to = index + (clientY > rect.top + rect.height / 2 ? 1 : 0);
  if (from < to) to -= 1;
  reorderOpen(from, to);
}

function markDrop(li, clientY) {
  clearDropMarks();
  const rect = li.getBoundingClientRect();
  li.classList.add(clientY > rect.top + rect.height / 2 ? "drop-after" : "drop-before");
}

function reorderOpen(from, to) {
  if (from === to || from < 0 || to < 0 || to >= state.open.length) return;
  const activeId = active >= 0 ? state.open[active]?.id : null;
  const [item] = state.open.splice(from, 1);
  state.open.splice(to, 0, item);
  if (activeId) active = state.open.findIndex((todo) => todo.id === activeId);
  render();
  if (active >= 0) list.children[active]?.focus();
}

function shuffleOpen() {
  if (state.open.length < 2) return;
  const activeId = active >= 0 ? state.open[active]?.id : null;
  for (let i = state.open.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.open[i], state.open[j]] = [state.open[j], state.open[i]];
  }
  if (activeId) active = state.open.findIndex((todo) => todo.id === activeId);
  render();
}

function complete(id, tick, li) {
  if (pending.has(id) || deleting.has(id) || !state.open.some((todo) => todo.id === id)) return;
  pending.add(id);
  const keepDraft = document.activeElement === draft;
  const zenTarget = zenOn && state.open[0]?.id === id;
  tick.classList.add("pop");
  li.classList.add("completing");
  if (zenTarget) dismissZenItem();
  const finish = () => {
    pending.delete(id);
    const todo = state.open.find((t) => t.id === id);
    if (!todo) return;
    const removedIndex = state.open.findIndex((t) => t.id === id);
    state.open = state.open.filter((t) => t.id !== id);
    if (todo) {
      const duckSlot = state.nextSlot || 0;
      state.nextSlot = duckSlot + 1;
      state.done.unshift({ ...todo, doneAt: Date.now(), duckSlot });
      jar.setSlots(flock(), true);
      announcement.textContent = `Quacked: ${todo.text}. A little duck joins you.`;
    }
    if (removedIndex >= 0 && active > removedIndex) active -= 1;
    else if (active === removedIndex) active = state.open.length ? Math.min(active, state.open.length - 1) : -1;
    if (zenOn && state.open.length === 0) setZen(false);
    render();
    if (zenOn) zenTick.focus();
    else if (keepDraft) draft.focus();
    else if (active >= 0) list.children[active]?.focus();
    else draft.focus();
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    finish();
    return;
  }
  // Match the CSS: glow and fade in place for 120ms, then close the gap for 100ms.
  setTimeout(() => {
    const current = [...list.children].find((row) => row.dataset.id === id);
    current?.classList.add("leaving");
  }, 120);
  setTimeout(finish, 220);
}

function completeTop() {
  if (archiveOpen) {
    archiveOpen = false;
    render();
  }
  const todo = state.open[0];
  const li = list.children[0];
  const tick = li?.querySelector(".tick");
  if (todo && li && tick) complete(todo.id, tick, li);
}

function add(text) {
  if (archiveOpen) return;
  const value = text.trim().replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase());
  if (!value) return;
  if (state.addPosition === "bottom") state.open.push(item(value));
  else state.open.unshift(item(value));
  state.history = taskHistory([value, ...state.history]);
  state.taskSequence = taskSequence([...state.taskSequence, value]);
  archiveOpen = false;
  active = -1;
  draft.value = "";
  render();
  draft.focus();
  updateSuggestions();
  requestAnimationFrame(() => {
    const scroller = todoBox.querySelector("main");
    scroller.scrollTop = state.addPosition === "bottom" ? scroller.scrollHeight : 0;
    markOverflow();
  });
}

function syncAddPosition() {
  const bottom = state.addPosition === "bottom";
  addPosition.dataset.position = bottom ? "bottom" : "top";
  addPosition.setAttribute("aria-pressed", String(bottom));
  addPosition.title = bottom ? "Adding at bottom. Switch to top." : "Adding at top. Switch to bottom.";
}

addPosition.addEventListener("click", () => {
  state.addPosition = state.addPosition === "bottom" ? "top" : "bottom";
  syncAddPosition();
  save();
});

let focusIntent = null;

function settleFocus() {
  if (focusIntent === "draft") {
    if (document.activeElement !== draft) draft.focus();
    draft.select();
    return;
  }
  if (focusIntent === "row" && active >= 0) {
    const row = list.children[active];
    if (row && document.activeElement !== row && !row.contains(document.activeElement)) row.focus();
    return;
  }
  if (focusIntent === "none") {
    const focused = document.activeElement;
    if (focused === draft || focused?.closest?.("#list")) focused.blur();
  }
}

function scheduleFocus(intent) {
  focusIntent = intent;
  settleFocus();
  queueMicrotask(settleFocus);
  setTimeout(settleFocus, 0);
}

function focusDraft() {
  scheduleFocus("draft");
}

function focusDraftTyping() {
  focusIntent = null;
  draft.focus();
  const end = draft.value.length;
  draft.setSelectionRange(end, end);
}

function addBoxSelected() {
  const { selectionStart, selectionEnd, value } = draft;
  if (selectionStart == null || selectionEnd == null) return true;
  const all = selectionStart === 0 && selectionEnd === value.length;
  const atEnd = selectionStart === value.length && selectionEnd === value.length;
  return all || atEnd;
}

function focusNone() {
  focusIntent = "none";
  active = -1;
  render();
  const focused = document.activeElement;
  if (focused && focused !== document.body && focused !== document.documentElement) focused.blur();
}

function focusKey(el) {
  focusIntent = null;
  document.querySelectorAll(".keytarget").forEach((node) => node.classList.remove("keytarget"));
  if (!el) return;
  el.classList.add("keytarget");
  try {
    el.focus({ focusVisible: true });
  } catch {
    el.focus();
  }
}

document.addEventListener("focusin", (e) => {
  document.querySelectorAll(".keytarget").forEach((node) => {
    if (node !== e.target) node.classList.remove("keytarget");
  });
});

function focusSoon(el) {
  if (!el) return;
  if (el !== draft && document.activeElement === draft) draft.blur();
  scheduleFocus("row");
}

function move(delta) {
  if (!state.open.length) return;
  if (active < 0) active = delta > 0 ? 0 : state.open.length - 1;
  else active = Math.max(0, Math.min(state.open.length - 1, active + delta));
  render();
  focusSoon(list.children[active]);
}

composer.addEventListener("submit", (e) => {
  e.preventDefault();
  add(draft.value);
});

function closeSuggestions() {
  clearPrediction();
  suggestions.hidden = true;
  suggestions.replaceChildren();
  suggestionIndex = -1;
  draft.setAttribute("aria-expanded", "false");
  draft.removeAttribute("aria-activedescendant");
}

function clearPrediction() {
  continuation = "";
  prediction.hidden = true;
  predictionPrefix.textContent = "";
  predictionSuffix.textContent = "";
  predictionHelp.textContent = "Tab accepts a predicted continuation when available.";
}

function predictionAllowed() {
  return !archiveOpen && !composing && document.activeElement === draft &&
    draft.selectionStart === draft.value.length && draft.selectionEnd === draft.value.length;
}

function displayPrediction(text) {
  continuation = text;
  if (!text) return;
  predictionPrefix.textContent = draft.value;
  predictionSuffix.textContent = text;
  predictionContent.style.transform = `translateX(${-draft.scrollLeft}px)`;
  prediction.hidden = false;
  predictionHelp.textContent = `Tab adds: ${text}`;
}

function updatePrediction() {
  clearPrediction();
  if (!predictionAllowed()) return;
  const historyKey = JSON.stringify([state.history, state.taskSequence]);
  if (predictorHistory !== historyKey) {
    predictor = createPredictor(state.history, state.taskSequence);
    predictorHistory = historyKey;
  }
  displayPrediction(predictor.predict(draft.value));
}

function chooseSuggestion(text) {
  focusIntent = null;
  draft.value = text;
  closeSuggestions();
  draft.focus();
  draft.setSelectionRange(text.length, text.length);
}

function updateSuggestions() {
  closeSuggestions();
  if (archiveOpen || document.activeElement !== draft) return;
  updatePrediction();
  const matches = suggestTasks(state.history, draft.value, state.taskSequence, state.open.map((todo) => todo.text));
  if (!matches.length) return;
  suggestions.replaceChildren(...matches.map((text, index) => {
    const option = document.createElement("li");
    option.id = `suggestion-${index}`;
    option.setAttribute("role", "option");
    option.setAttribute("aria-selected", "false");
    option.textContent = text;
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("click", () => chooseSuggestion(text));
    return option;
  }));
  suggestions.hidden = false;
  draft.setAttribute("aria-expanded", "true");
}

draft.addEventListener("input", (event) => {
  focusIntent = null;
  if (event.isComposing) closeSuggestions();
  else updateSuggestions();
});
draft.addEventListener("compositionstart", () => { composing = true; closeSuggestions(); });
draft.addEventListener("compositionend", () => { composing = false; updateSuggestions(); });
draft.addEventListener("focus", updateSuggestions);
draft.addEventListener("blur", closeSuggestions);
draft.addEventListener("click", updatePrediction);
draft.addEventListener("select", updatePrediction);
draft.addEventListener("scroll", () => {
  predictionContent.style.transform = `translateX(${-draft.scrollLeft}px)`;
});
draft.addEventListener("keyup", (event) => {
  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updatePrediction();
});

draft.addEventListener("keydown", (e) => {
  if (e.isComposing || composing) return;
  if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const selected = !suggestions.hidden && suggestionIndex >= 0
      ? suggestions.children[suggestionIndex].textContent : null;
    if (selected || (continuation && draft.selectionStart === draft.value.length && draft.selectionEnd === draft.value.length)) {
      e.preventDefault();
      e.stopPropagation();
      chooseSuggestion(selected || draft.value + continuation);
      return;
    }
  }
  if (e.key === "Escape" && continuation && suggestions.hidden) {
    e.preventDefault();
    e.stopPropagation();
    clearPrediction();
    return;
  }
  if (!suggestions.hidden) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      focusIntent = null;
      e.preventDefault();
      e.stopPropagation();
      const count = suggestions.children.length;
      suggestionIndex = suggestionIndex < 0
        ? (e.key === "ArrowDown" ? 0 : count - 1)
        : (suggestionIndex + (e.key === "ArrowDown" ? 1 : -1) + count) % count;
      [...suggestions.children].forEach((option, index) => {
        option.setAttribute("aria-selected", String(index === suggestionIndex));
      });
      draft.setAttribute("aria-activedescendant", suggestions.children[suggestionIndex].id);
      return;
    }
    if (e.key === "Enter" && suggestionIndex >= 0) {
      e.preventDefault();
      e.stopPropagation();
      chooseSuggestion(suggestions.children[suggestionIndex].textContent);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeSuggestions();
      return;
    }
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    add(draft.value);
  } else if (e.key === "ArrowRight" && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && addBoxSelected()) {
    e.preventDefault();
    e.stopPropagation();
    focusKey(enterAdd);
  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "ArrowUp" || !state.open.length) {
      focusNone();
      return;
    }
    active = 0;
    render();
    focusSoon(list.children[0]);
  } else if (e.key === "Escape") {
    draft.blur();
  }
});

function navigateAddRow(e) {
  if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === "ArrowLeft") {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === addPosition) focusKey(enterAdd);
    else focusDraftTyping();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    e.stopPropagation();
    focusKey(addPosition);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    focusNone();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    if (!state.open.length) focusNone();
    else {
      active = 0;
      render();
      focusSoon(list.children[0]);
    }
  }
}

enterAdd.addEventListener("keydown", navigateAddRow);
addPosition.addEventListener("keydown", navigateAddRow);

window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") settleFocus();
}, true);

function payload() {
  rememberSpots();
  return JSON.stringify(state, null, 2);
}

function showError(message) {
  transferError.hidden = !message;
  transferError.textContent = message || "";
}

function openTransfer(mode) {
  closeSettings();
  const exporting = mode === "export";
  transfer.dataset.mode = mode;
  transferTitle.textContent = exporting ? "Export" : "Import";
  transferText.value = exporting ? payload() : "";
  transferText.readOnly = false;
  transferDownload.hidden = !exporting;
  transferChoose.hidden = exporting;
  transferApply.hidden = exporting;
  showError("");
  if (!transfer.open) transfer.showModal();
  transferText.focus();
  if (exporting) transferText.select();
}

function applyImport(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    showError("That is not valid JSON.");
    return false;
  }
  const next = normalize(data);
  const recognizable = data && typeof data === "object" && ("open" in data || "done" in data || "ducks" in data || "theme" in data);
  if (!next || !recognizable) {
    showError("That file is not a to-duck export.");
    return false;
  }
  state = next;
  active = -1;
  archiveOpen = false;
  applyTheme();
  jar.setTheme(state.theme);
  jar.loadSpots(state.spots);
  jar.setSlots(flock(), false);
  render();
  transfer.close();
  draft.focus();
  return true;
}

function dismissZenItem() {
  zenTick.classList.add("pop");
  document.querySelector(".zen-item")?.classList.add("completing");
}

function syncZen() {
  const top = state.open[0];
  const item = document.querySelector(".zen-item");
  item?.classList.toggle("completing", Boolean(top && pending.has(top.id)));
  zenTick.classList.toggle("pop", Boolean(top && pending.has(top.id)));
  zenTask.textContent = top ? top.text : "Nothing open.";
  zenTask.classList.toggle("muted", !top);
  zenTick.hidden = !top;
  if (top) zenTick.setAttribute("aria-label", `Complete ${top.text}`);
  if (zenOn && top) zenTick.focus();
}

function setZen(on) {
  if (on && state.open.length === 0) return;
  const was = zenOn;
  zenOn = on;
  zenEl.hidden = !on;
  document.documentElement.toggleAttribute("data-zen", on);
  zenBtn.setAttribute("aria-pressed", zenOn ? "true" : "false");
  closeSettings();
  if (zenOn) render();
  else if (was) {
    syncZen();
    if (active >= 0 && list.children[active]) focusSoon(list.children[active]);
    else draft.focus();
  }
}

function toggleZen() {
  setZen(!zenOn);
}

document.addEventListener("keydown", (e) => {
  // Dialogs own their keyboard input, including Escape and browser shortcuts.
  if (help.open || transfer.open || e.isComposing) return;
  if (e.key === "Escape" && zenOn) {
    e.preventDefault();
    setZen(false);
    return;
  }
  if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    chordUntil = Date.now() + 1500;
    return;
  }
  if (chordUntil) {
    const armed = Date.now() < chordUntil;
    chordUntil = 0;
    if (armed && e.key.toLowerCase() === "z" && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      toggleZen();
    }
    return;
  }
  if ((e.key === "e" || e.key === "i") && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    openTransfer(e.key === "e" ? "export" : "import");
    return;
  }
  const field = document.activeElement;
  const typing = field === draft || field?.tagName === "TEXTAREA" || field?.tagName === "INPUT";
  if (typing) return;
  if (e.key === "c" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
    e.preventDefault();
    completeTop();
    return;
  }
  if (e.key === "d" && !e.metaKey && !e.ctrlKey && !e.altKey && !e.repeat) {
    e.preventDefault();
    if (zenOn) return;
    if (archiveOpen && picked) removeDone(picked);
    else if (!archiveOpen && active >= 0 && state.open[active]) removeOpen(state.open[active].id);
    return;
  }
  if (e.key === "Escape" && !settingsPanel.hidden) {
    closeSettings();
    return;
  }
  const focused = document.activeElement;
  const inList = focused?.closest?.("#list");
  if (archiveOpen && !focused?.closest?.(".menu")) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const current = state.done.findIndex((todo) => todo.id === picked);
      const next = current < 0
        ? (e.key === "ArrowDown" ? 0 : state.done.length - 1)
        : Math.max(0, Math.min(state.done.length - 1, current + (e.key === "ArrowDown" ? 1 : -1)));
      if (state.done[next]) selectQuacked(state.done[next].id);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      selectQuacked(null, false);
      archiveToggle.focus();
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && focused?.matches?.("#archive-list .row")) {
      e.preventDefault();
      selectQuacked(focused.dataset.id);
      return;
    }
  }
  if (zenOn && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    if (e.key === "ArrowLeft") focusKey(zenTick);
    return;
  }
  if (focused?.tagName === "BUTTON" && !inList && !focused.closest?.("#archive")) return;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    const host = focused?.closest?.(".row");
    const row = host
      ? host
      : archiveOpen && picked
        ? archiveList.querySelector(".row.picked")
        : !archiveOpen && active >= 0
          ? list.children[active]
          : null;
    if (!row) return;
    e.preventDefault();
    if (!archiveOpen) {
      active = state.open.findIndex((todo) => todo.id === row.dataset.id);
      [...list.children].forEach((item) => item.classList.toggle("active", item === row));
    }
    const controls = archiveOpen
      ? [row, row.querySelector(".trash")]
      : [row.querySelector(".drag-handle"), row.querySelector(".tick"), row, row.querySelector(".trash")];
    const index = Math.max(0, controls.indexOf(focused === row ? row : focused?.closest?.("button") || row));
    const next = Math.max(0, Math.min(controls.length - 1, index + (e.key === "ArrowLeft" ? -1 : 1)));
    focusKey(controls[next]);
    return;
  }
  if ((e.key === "Enter" || e.key === " ") && focused?.classList?.contains("trash")) {
    e.preventDefault();
    if (zenOn) return;
    const row = focused.closest(".row");
    const id = row?.dataset.id;
    if (!id) return;
    if (row.closest("#archive")) removeDone(id);
    else removeOpen(id);
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (active < 0) focusDraft();
    else if (active >= state.open.length - 1) focusNone();
    else move(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (active < 0) {
      if (state.open.length) move(-1);
      else focusDraft();
    } else if (active === 0) {
      active = -1;
      render();
      focusDraft();
    } else move(-1);
  } else if ((e.key === "Enter" || e.key === " ") && active >= 0) {
    e.preventDefault();
    const todo = state.open[active];
    const li = list.children[active];
    const tick = li?.querySelector(".tick");
    if (todo && li && tick) complete(todo.id, tick, li);
  }
});

function closeSettings() {
  settingsPanel.hidden = true;
  settingsBtn.setAttribute("aria-expanded", "false");
}

archiveToggle.addEventListener("click", () => {
  archiveOpen = !archiveOpen;
  closeSettings();
  render();
});

shuffleBtn.addEventListener("click", () => {
  closeSettings();
  shuffleOpen();
});

settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const open = settingsPanel.hidden;
  settingsPanel.hidden = !open;
  settingsBtn.setAttribute("aria-expanded", open ? "true" : "false");
});

function afterLeave(li, finish) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !li) {
    finish();
    return;
  }
  li.classList.add("leaving");
  setTimeout(finish, 220);
}

function removeOpen(id) {
  if (zenOn) return;
  if (pending.has(id) || deleting.has(id)) return;
  const index = state.open.findIndex((todo) => todo.id === id);
  const li = list.children[index];
  if (index < 0 || !li || li.classList.contains("leaving")) return;
  deleting.add(id);
  afterLeave(li, () => {
    deleting.delete(id);
    const index = state.open.findIndex((todo) => todo.id === id);
    if (index < 0) return;
    const nextIndex = index < state.open.length - 1 ? index + 1 : index - 1;
    state.open.splice(index, 1);
    if (state.open.length === 0) setZen(false);
    active = nextIndex < 0 ? -1 : nextIndex > index ? nextIndex - 1 : nextIndex;
    render();
    if (zenOn) zenTick.focus();
    else if (active >= 0) list.children[active]?.focus();
    else draft.focus();
  });
}

function removeDone(id) {
  if (zenOn) return;
  const index = state.done.findIndex((todo) => todo.id === id);
  const li = archiveList.children[index];
  if (index < 0 || !li || li.classList.contains("leaving")) return;
  afterLeave(li, () => {
    const index = state.done.findIndex((todo) => todo.id === id);
    if (index < 0) return;
    const nextIndex = index < state.done.length - 1 ? index + 1 : index - 1;
    state.done.splice(index, 1);
    picked = nextIndex < 0 ? null : state.done[nextIndex > index ? nextIndex - 1 : nextIndex]?.id ?? null;
    jar.setSlots(flock(), true);
    render();
    if (picked) archiveList.querySelector(".picked")?.focus();
  });
}

function emptyJar() {
  state.nextSlot = 0;
  state.spots = [];
  jar.reset();
}

clearAllBtn.addEventListener("click", () => {
  state.open = [];
  state.done = [];
  state.history = [];
  state.taskSequence = [];
  active = -1;
  archiveOpen = false;
  emptyJar();
  setZen(false);
  closeSettings();
  render();
});

clearTodosBtn.addEventListener("click", () => {
  state.open = [];
  active = -1;
  setZen(false);
  closeSettings();
  render();
});

clearArchiveBtn.addEventListener("click", () => {
  state.done = [];
  archiveOpen = false;
  emptyJar();
  closeSettings();
  render();
});

rightDucksBtn.addEventListener("click", () => {
  jar.right();
  save();
  closeSettings();
});

respawnBtn.addEventListener("click", () => {
  jar.respawn();
  rememberSpots();
  save();
  closeSettings();
});

helpOpen.addEventListener("click", () => {
  closeSettings();
  help.showModal();
});

zenBtn.addEventListener("click", () => toggleZen());

zenTick.addEventListener("click", () => {
  const todo = state.open[0];
  const li = list.children[0];
  const tick = li?.querySelector(".tick");
  if (todo && li && tick) complete(todo.id, tick, li);
});

exportOpen.addEventListener("click", () => openTransfer("export"));
importOpen.addEventListener("click", () => openTransfer("import"));

transferDownload.addEventListener("click", () => {
  const blob = new Blob([transferText.value || payload()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "to-duck.json";
  link.click();
  URL.revokeObjectURL(url);
});

transferChoose.addEventListener("click", () => transferFile.click());

transferFile.addEventListener("change", () => {
  const file = transferFile.files?.[0];
  transferFile.value = "";
  if (!file) return;
  file.text().then((raw) => {
    transferText.value = raw;
    applyImport(raw);
  });
});

transferApply.addEventListener("click", () => applyImport(transferText.value));

document.addEventListener("click", (e) => {
  if (!settingsPanel.hidden && !e.target.closest(".menu")) closeSettings();
});

themeBtn.addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  applyTheme();
  jar.setTheme(state.theme);
  save();
});

todoBox.querySelector("main").addEventListener("scroll", markOverflow, { passive: true });
window.addEventListener("resize", markOverflow);

applyTheme();
jar.setTheme(state.theme);
jar.loadSpots(state.spots);
jar.setSlots(flock(), false);
render(false);
focusDraft();

loadIndexedDB().then((remote) => {
  if (edits === 0 && remote && remote.savedAt > (state.savedAt || 0)) {
    state = { ...remote, theme: state.theme };
    applyTheme();
    jar.setTheme(state.theme);
    jar.loadSpots(state.spots);
    jar.setSlots(flock(), false);
  }
  render();
  if (focusIntent !== "row" && focusIntent !== "none") focusDraft();
});
