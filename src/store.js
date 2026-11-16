const KEY = "todojar.v1";
const BACKUP = "todojar.v1.bak";
const CHUNK = 3200;
const MAX_CHUNKS = 16;
const YEAR = 60 * 60 * 24 * 365 * 10;

export function loadSync() {
  let stored = null;
  let backup = null;
  try {
    stored = readJson(localStorage.getItem(KEY));
    backup = readJson(localStorage.getItem(BACKUP));
  } catch {
    // A blocked storage API should not prevent opening the app.
  }
  const cookie = readCookie();
  return pick(stored, backup, cookie) || empty();
}

export function saveAll(state) {
  const payload = JSON.stringify(state);
  try {
    const previous = localStorage.getItem(KEY);
    if (previous && previous !== payload) localStorage.setItem(BACKUP, previous);
    localStorage.setItem(KEY, payload);
  } catch {
    /* quota or private mode */
  }
  writeCookie(payload);
  writeDb(state);
}

export function loadIndexedDB() {
  return readDb().catch(() => null);
}

function empty() {
  return { theme: "dark", open: [], done: [], nextSlot: 0, spots: [], savedAt: 0 };
}

function readJson(raw) {
  if (!raw) return null;
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function normalize(data) {
  if (!data || typeof data !== "object") return null;
  const item = (todo) =>
    todo && typeof todo.id === "string" && typeof todo.text === "string"
      ? { ...todo }
      : null;
  const done = Array.isArray(data.done) ? data.done.map(item).filter(Boolean) : [];
  let next = Number.isInteger(data.nextSlot) && data.nextSlot > 0 ? data.nextSlot : 0;
  const used = new Set();
  for (const todo of done) {
    const slot = todo.duckSlot;
    if (!Number.isInteger(slot) || slot < 0 || used.has(slot)) todo.duckSlot = null;
    else used.add(slot);
  }
  for (const todo of done) {
    if (todo.duckSlot == null) {
      while (used.has(next)) next += 1;
      todo.duckSlot = next;
      used.add(next);
      next += 1;
    } else next = Math.max(next, todo.duckSlot + 1);
  }
  const spots = [];
  if (Array.isArray(data.spots)) {
    for (let i = 0; i < data.spots.length && i < next; i++) {
      const spot = data.spots[i];
      const x = Number(spot?.x);
      const y = Number(spot?.y);
      const angle = Number(spot?.angle);
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) break;
      spots.push({ x, y, angle });
    }
  }
  return {
    theme: data.theme === "light" ? "light" : "dark",
    open: Array.isArray(data.open) ? data.open.map(item).filter(Boolean) : [],
    done,
    nextSlot: next,
    spots,
    savedAt: Number(data.savedAt) || 0,
  };
}

function pick(...copies) {
  return copies.filter(Boolean).sort((a, b) => {
    if (b.savedAt !== a.savedAt) return b.savedAt - a.savedAt;
    return b.open.length + b.done.length - (a.open.length + a.done.length);
  })[0] || null;
}

function readCookie() {
  const parts = new Map();
  let count = 0;
  for (const bit of document.cookie.split("; ")) {
    const eq = bit.indexOf("=");
    if (eq < 0) continue;
    const name = bit.slice(0, eq);
    let value;
    try {
      value = decodeURIComponent(bit.slice(eq + 1));
    } catch {
      continue;
    }
    if (name === "todojar.n") count = Number(value) || 0;
    else if (name.startsWith("todojar.")) parts.set(name, value);
  }
  if (!count) return null;
  let raw = "";
  for (let i = 0; i < count; i++) {
    const part = parts.get(`todojar.${i}`);
    if (part == null) return null;
    raw += part;
  }
  return readJson(raw);
}

function writeCookie(payload) {
  const chunks = [];
  for (let i = 0; i < payload.length && chunks.length < MAX_CHUNKS; i += CHUNK) {
    chunks.push(payload.slice(i, i + CHUNK));
  }
  const fits = chunks.join("").length === payload.length;
  const body = fits ? chunks : [];
  document.cookie = `todojar.n=${body.length}; Max-Age=${fits ? YEAR : 0}; Path=/; SameSite=Lax`;
  body.forEach((part, i) => {
    document.cookie = `todojar.${i}=${encodeURIComponent(part)}; Max-Age=${YEAR}; Path=/; SameSite=Lax`;
  });
  for (let i = body.length; i < MAX_CHUNKS; i++) {
    document.cookie = `todojar.${i}=; Max-Age=0; Path=/; SameSite=Lax`;
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("todojar", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeDb(state) {
  openDb()
    .then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction("state", "readwrite");
          tx.objectStore("state").put(state, "current");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        })
    )
    .catch(() => {});
}

function readDb() {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction("state", "readonly");
        const request = tx.objectStore("state").get("current");
        request.onsuccess = () => {
          db.close();
          resolve(normalize(request.result));
        };
        request.onerror = () => reject(request.error);
      })
  );
}
