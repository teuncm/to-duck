const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(tag, attrs = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function createDuckArtwork(id) {
  const artwork = svgElement("g", { id });
  const path = (d, fill) => artwork.append(svgElement("path", { d, fill }));
  const ellipse = (x, y, rx, ry, rot, color) => {
    artwork.append(svgElement("ellipse", {
      cx: x, cy: y, rx, ry, fill: color,
      transform: `rotate(${rot * 180 / Math.PI} ${x} ${y})`,
    }));
  };

  ellipse(-1, 5, 17, 12, 0, "#f0c43a");
  ellipse(-2, 7, 13, 8, -0.15, "#f6cf55");
  ellipse(-3, 9, 9, 5, -0.25, "#ffe38a");
  ellipse(-4, 8.5, 10, 5.5, -0.35, "#e7b428");
  ellipse(2, 6, 6, 3.5, 0.4, "#f8d56a");

  ellipse(-18, 3, 5, 3.2, -0.8, "#e2ae2c");
  ellipse(-20, 1, 3.4, 2.2, -0.4, "#f3c94a");
  ellipse(-16, 5.5, 3, 2, 0.5, "#f6d35a");
  path("M-16 4 Q-22 1 -15 -2 Q-12 2 -14 6", "#f6d35a");

  ellipse(-6, 2, 7, 4.5, -0.6, "#f3c94a");
  ellipse(-7, 1.2, 5, 3, -0.7, "#ffe7a0");
  ellipse(-6, 3.2, 4, 2.2, -0.5, "#e2ae2c");
  ellipse(-8, 3.6, 2.2, 1.2, -0.4, "#c99420");

  ellipse(9, -8, 9, 9, 0, "#f6d35a");
  ellipse(7, -11, 5, 3.4, -0.5, "#fff4c4");
  ellipse(8, -6, 4, 2.2, 0.6, "#e7b428");
  ellipse(5, -7, 2.2, 1.4, 0.2, "#f3a3a0");

  path("M15 -10 Q25 -8 24 -5 Q23 -2 15 -4 Z", "#ef8a22");
  path("M16 -9 Q22 -8 22 -6.2 Q20 -5.4 16 -6 Z", "#ffb15a");
  path("M15 -6.2 L22 -5 L15 -4", "#d56d12");
  ellipse(19, -7.4, 0.7, 0.45, 0.4, "#a34e0c");

  ellipse(12, -10, 2.5, 2.5, 0, "#fff");
  ellipse(12.2, -10, 1.7, 1.7, 0, "#1c1c1c");
  ellipse(12.7, -10.6, 0.55, 0.55, 0, "#fff");
  return artwork;
}
const PAD = 2;
const PARTS = [
  { x: -6, y: 5, r: 12 },
  { x: 4, y: 5, r: 12 },
  { x: 9, y: -8, r: 9 },
  { x: 20, y: -6, r: 6 },
  { x: -18, y: 2, r: 5 },
];

export function createJar(host) {
  const svg = svgElement("svg", {
    width: "100%", height: "100%", preserveAspectRatio: "xMidYMid meet",
    "aria-hidden": "true", focusable: "false",
  });
  const artId = `duck-${crypto.randomUUID()}`;
  const defs = svgElement("defs");
  defs.append(createDuckArtwork(artId));
  const flockLayer = svgElement("g", { class: "duck-flock" });
  const highlighted = svgElement("g", { class: "duck-highlight", visibility: "hidden" });
  const halo = svgElement("ellipse", {
    cx: 0, cy: 0, rx: 29, ry: 25, fill: "#f6cf55", "fill-opacity": 0.18,
    "stroke-width": 2, "vector-effect": "non-scaling-stroke",
  });
  highlighted.append(halo, svgElement("use", { href: `#${artId}` }));
  svg.append(defs, flockLayer, highlighted);
  host.append(svg);

  const ducks = [];
  let highlightedSlot = null;
  let highlightColor = "#fff2b3";
  let raf = 0;
  let motion = null;
  const cam = { x: -120, y: -90, w: 240, h: 180 };
  const camTo = { ...cam };

  const spots = [];
  let seed = 1;

  function unit(index, salt) {
    const n = Math.sin(index * 127.1 + salt + seed) * 43758.5453;
    return n - Math.floor(n);
  }

  function overlaps(x, y, angle, other) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const cb = Math.cos(other.angle);
    const sb = Math.sin(other.angle);
    for (const a of PARTS) {
      const ax = x + a.x * ca - a.y * sa;
      const ay = y + a.x * sa + a.y * ca;
      for (const b of PARTS) {
        const bx = other.x + b.x * cb - b.y * sb;
        const by = other.y + b.x * sb + b.y * cb;
        const need = a.r + b.r + PAD;
        const dx = ax - bx;
        const dy = ay - by;
        if (dx * dx + dy * dy < need * need) return true;
      }
    }
    return false;
  }

  function spotFor(index) {
    if (spots[index]) return spots[index];
    const angle = unit(index, 311.7) * Math.PI * 2;
    if (index === 0) {
      spots[0] = { x: 0, y: 0, angle };
      return spots[0];
    }
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < index; i++) {
      const earlier = spotFor(i);
      cx += earlier.x;
      cy += earlier.y;
    }
    cx /= index;
    cy /= index;
    const spin = unit(index, 17.2) * Math.PI * 2;
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let attempt = 0; attempt < 480; attempt++) {
      const dist = 18 + attempt * 2.4;
      const dir = spin + attempt * golden;
      const x = cx + Math.cos(dir) * dist;
      const y = cy + Math.sin(dir) * dist;
      const candidate = { x, y, angle };
      let clear = true;
      for (let i = 0; i < index; i++) {
        if (overlaps(x, y, angle, spots[i])) {
          clear = false;
          break;
        }
      }
      if (clear) {
        spots[index] = candidate;
        return candidate;
      }
    }
    spots[index] = { x: cx + 40 * (index + 1), y: cy, angle };
    return spots[index];
  }

  function place() {
    for (const duck of ducks) {
      const next = spotFor(duck.slot);
      duck.tx = next.x;
      duck.ty = next.y;
      duck.ta = next.angle;
    }
    frame();
  }

  function frame() {
    if (!ducks.length) {
      Object.assign(camTo, { x: -140, y: -100, w: 280, h: 200 });
      return;
    }
    const maxSlot = ducks.reduce((max, duck) => Math.max(max, duck.slot), 0);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let slot = 0; slot <= maxSlot; slot++) {
      const spot = spotFor(slot);
      // Fit the full duck at any rotation without adding camera padding.
      minX = Math.min(minX, spot.x - 32);
      maxX = Math.max(maxX, spot.x + 32);
      minY = Math.min(minY, spot.y - 32);
      maxY = Math.max(maxY, spot.y + 32);
    }
    Object.assign(camTo, {
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
    });
  }

  function sync(slots, animate) {
    motion = null;
    const wanted = new Set(slots);
    if (!wanted.has(highlightedSlot)) highlightedSlot = null;
    for (let i = ducks.length - 1; i >= 0; i--) {
      if (!wanted.has(ducks[i].slot)) {
        ducks[i].node.remove();
        ducks.splice(i, 1);
      }
    }
    const have = new Set(ducks.map((duck) => duck.slot));
    for (const slot of slots) {
      if (have.has(slot)) continue;
      const spot = spotFor(slot);
      const node = svgElement("g", { class: "duck", "data-slot": slot });
      node.append(svgElement("use", { href: `#${artId}` }));
      flockLayer.append(node);
      ducks.push({
        slot, node,
        x: spot.x,
        y: spot.y - 30,
        angle: spot.angle,
        tx: spot.x,
        ty: spot.y,
        ta: spot.angle,
      });
    }
    place();
    if (!animate) {
      for (const duck of ducks) {
        duck.x = duck.tx;
        duck.y = duck.ty;
        duck.angle = duck.ta;
      }
      Object.assign(cam, camTo);
    }
    draw();
    kick();
  }

  function moving() {
    const drift = (value, toward) => Math.abs(toward - value) > 0.4;
    if (drift(cam.x, camTo.x) || drift(cam.y, camTo.y) || drift(cam.w, camTo.w) || drift(cam.h, camTo.h)) {
      return true;
    }
    return ducks.some((duck) => drift(duck.x, duck.tx) || drift(duck.y, duck.ty) || drift(duck.angle, duck.ta));
  }

  function ease() {
    const step = (value, toward) => value + (toward - value) * 0.18;
    cam.x = step(cam.x, camTo.x);
    cam.y = step(cam.y, camTo.y);
    cam.w = step(cam.w, camTo.w);
    cam.h = step(cam.h, camTo.h);
    for (const duck of ducks) {
      duck.x = step(duck.x, duck.tx);
      duck.y = step(duck.y, duck.ty);
      duck.angle = step(duck.angle, duck.ta);
    }
  }

  function draw() {
    svg.setAttribute("viewBox", `${cam.x} ${cam.y} ${cam.w} ${cam.h}`);
    for (const duck of ducks) {
      duck.node.setAttribute("transform", `translate(${duck.x} ${duck.y}) rotate(${duck.angle * 180 / Math.PI})`);
    }
    const selected = ducks.find((duck) => duck.slot === highlightedSlot);
    highlighted.setAttribute("visibility", selected ? "visible" : "hidden");
    if (selected) {
      highlighted.dataset.slot = String(selected.slot);
      highlighted.setAttribute("transform", selected.node.getAttribute("transform"));
      halo.setAttribute("stroke", highlightColor);
    } else delete highlighted.dataset.slot;
  }

  function startMotion(duration) {
    const settle = () => {
      Object.assign(cam, camTo);
      for (const duck of ducks) {
        duck.x = duck.tx;
        duck.y = duck.ty;
        duck.angle = duck.ta;
      }
    };
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      motion = null;
      settle();
      draw();
      return;
    }
    motion = {
      start: performance.now(), duration, camera: { ...cam },
      ducks: ducks.map((duck) => ({
        duck, x: duck.x, y: duck.y, angle: duck.angle,
        // Turn along the shortest arc, including when an earlier motion is interrupted.
        turn: Math.atan2(Math.sin(duck.ta - duck.angle), Math.cos(duck.ta - duck.angle)),
      })),
      settle,
    };
    kick();
  }

  function tick(now) {
    if (motion) {
      const progress = Math.max(0, Math.min(1, (now - motion.start) / motion.duration));
      const eased = progress * progress * (3 - 2 * progress);
      const blend = (from, to) => from + (to - from) * eased;
      for (const key of ["x", "y", "w", "h"]) cam[key] = blend(motion.camera[key], camTo[key]);
      for (const start of motion.ducks) {
        start.duck.x = blend(start.x, start.duck.tx);
        start.duck.y = blend(start.y, start.duck.ty);
        start.duck.angle = start.angle + start.turn * eased;
      }
      if (progress === 1) {
        motion.settle();
        motion = null;
      }
    } else ease();
    draw();
    raf = motion || moving() ? requestAnimationFrame(tick) : 0;
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  draw();

  return {
    loadSpots(list) {
      spots.length = 0;
      if (!Array.isArray(list)) return;
      for (const spot of list) {
        const x = Number(spot?.x);
        const y = Number(spot?.y);
        const angle = Number(spot?.angle);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) break;
        spots.push({ x, y, angle });
      }
    },
    capture(count) {
      const list = [];
      const total = Math.max(0, count | 0);
      for (let i = 0; i < total; i++) {
        const spot = spotFor(i);
        list.push({ x: spot.x, y: spot.y, angle: spot.angle });
      }
      return list;
    },
    setSlots(slots, animate) {
      sync(slots, animate);
    },
    reset() {
      ducks.length = 0;
      flockLayer.replaceChildren();
      spots.length = 0;
      seed = Math.random() * 1000;
      sync([], false);
    },
    setHighlight(slot) {
      const next = ducks.some((duck) => duck.slot === slot) ? slot : null;
      if (next === highlightedSlot) return;
      highlightedSlot = next;
      draw();
    },
    setTheme(theme) {
      highlightColor = theme === "light" ? "#805d00" : "#fff2b3";
      draw();
    },
    right() {
      if (!ducks.length) return;
      for (const duck of ducks) {
        // Freeze the visible position, even if a reflow or arrival is in progress.
        spots[duck.slot] = { x: duck.x, y: duck.y, angle: 0 };
        duck.tx = duck.x;
        duck.ty = duck.y;
        duck.ta = 0;
      }
      Object.assign(camTo, cam);
      startMotion(1200);
    },
    respawn() {
      if (!ducks.length) return;
      seed = Math.random() * 1000;
      spots.length = 0;
      place();
      startMotion(1600);
    },
  };
}
