function hasGpu() {
  try {
    const probe = document.createElement("canvas");
    const gl = probe.getContext("webgl2", { failIfMajorPerformanceCaveat: true })
      || probe.getContext("webgl", { failIfMajorPerformanceCaveat: true });
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function duckSprite() {
  const size = 256;
  const world = 64;
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = size;
  const ctx = sprite.getContext("2d");
  const unit = size / world;
  ctx.setTransform(unit, 0, 0, unit, size / 2, size / 2);

  const ellipse = (x, y, rx, ry, rot, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.fill();
  };

  ellipse(-1, 5, 17, 12, 0, "#f0c43a");
  ellipse(-2, 7, 13, 8, -0.15, "#f6cf55");
  ellipse(-3, 9, 9, 5, -0.25, "#ffe38a");
  ellipse(-4, 8.5, 10, 5.5, -0.35, "#e7b428");
  ellipse(2, 6, 6, 3.5, 0.4, "#f8d56a");

  ellipse(-18, 3, 5, 3.2, -0.8, "#e2ae2c");
  ellipse(-20, 1, 3.4, 2.2, -0.4, "#f3c94a");
  ellipse(-16, 5.5, 3, 2, 0.5, "#f6d35a");
  ctx.fillStyle = "#f6d35a";
  ctx.beginPath();
  ctx.moveTo(-16, 4);
  ctx.quadraticCurveTo(-22, 1, -15, -2);
  ctx.quadraticCurveTo(-12, 2, -14, 6);
  ctx.fill();

  ellipse(-6, 2, 7, 4.5, -0.6, "#f3c94a");
  ellipse(-7, 1.2, 5, 3, -0.7, "#ffe7a0");
  ellipse(-6, 3.2, 4, 2.2, -0.5, "#e2ae2c");
  ellipse(-8, 3.6, 2.2, 1.2, -0.4, "#c99420");

  ellipse(9, -8, 9, 9, 0, "#f6d35a");
  ellipse(7, -11, 5, 3.4, -0.5, "#fff4c4");
  ellipse(8, -6, 4, 2.2, 0.6, "#e7b428");
  ellipse(5, -7, 2.2, 1.4, 0.2, "#f3a3a0");

  ctx.fillStyle = "#ef8a22";
  ctx.beginPath();
  ctx.moveTo(15, -10);
  ctx.quadraticCurveTo(25, -8, 24, -5);
  ctx.quadraticCurveTo(23, -2, 15, -4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffb15a";
  ctx.beginPath();
  ctx.moveTo(16, -9);
  ctx.quadraticCurveTo(22, -8, 22, -6.2);
  ctx.quadraticCurveTo(20, -5.4, 16, -6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#d56d12";
  ctx.beginPath();
  ctx.moveTo(15, -6.2);
  ctx.lineTo(22, -5);
  ctx.lineTo(15, -4);
  ctx.fill();
  ellipse(19, -7.4, 0.7, 0.45, 0.4, "#a34e0c");

  ellipse(12, -10, 2.5, 2.5, 0, "#fff");
  ellipse(12.2, -10, 1.7, 1.7, 0, "#1c1c1c");
  ellipse(12.7, -10.6, 0.55, 0.55, 0, "#fff");

  return sprite;
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
  const canvas = document.createElement("canvas");
  const gpu = hasGpu();
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: gpu })
    || canvas.getContext("2d", { alpha: true });
  const sprite = duckSprite();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  host.appendChild(canvas);

  const ducks = [];
  let raf = 0;
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
      // Fit the full sprite at any rotation without adding camera padding.
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
    const wanted = new Set(slots);
    for (let i = ducks.length - 1; i >= 0; i--) {
      if (!wanted.has(ducks[i].slot)) ducks.splice(i, 1);
    }
    const have = new Set(ducks.map((duck) => duck.slot));
    for (const slot of slots) {
      if (have.has(slot)) continue;
      const spot = spotFor(slot);
      ducks.push({
        slot,
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
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) return;
    const scale = Math.min(width / cam.w, height / cam.h);
    const originX = (width - cam.w * scale) / 2 - cam.x * scale;
    const originY = (height - cam.h * scale) / 2 - cam.y * scale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const half = 32;
    for (const duck of ducks) {
      const cos = Math.cos(duck.angle);
      const sin = Math.sin(duck.angle);
      ctx.setTransform(scale * cos, scale * sin, -scale * sin, scale * cos, originX + duck.x * scale, originY + duck.y * scale);
      ctx.drawImage(sprite, -half, -half, half * 2, half * 2);
    }
  }

  function tick() {
    ease();
    draw();
    raf = moving() ? requestAnimationFrame(tick) : 0;
  }

  function kick() {
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function resize() {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    canvas.width = Math.max(1, Math.floor(w * ratio));
    canvas.height = Math.max(1, Math.floor(h * ratio));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    draw();
  }

  new ResizeObserver(resize).observe(host);
  resize();

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
      spots.length = 0;
      seed = Math.random() * 1000;
      sync([], false);
    },
    setTheme() {},
    respawn() {
      if (!ducks.length) return;
      seed = Math.random() * 1000;
      spots.length = 0;
      place();
      kick();
    },
  };
}
