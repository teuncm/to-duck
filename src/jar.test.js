import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJar } from "./jar.js";

describe("SVG duck rendering", () => {
  let host;
  let clock;
  function advanceFrame(time) {
    clock = time;
    requestAnimationFrame.mock.calls.at(-1)[0](time);
  }
  function poses() {
    return [...host.querySelectorAll(".duck")].map((duck) => {
      const [x, y, angle] = duck.getAttribute("transform").match(/[-+]?[\d.]+(?:e[-+]?\d+)?/gi).map(Number);
      return { x, y, angle };
    });
  }
  beforeEach(() => {
    clock = 0;
    vi.spyOn(performance, "now").mockImplementation(() => clock);
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
    host = document.createElement("div");
    document.body.append(host);
  });
  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([1, 1.25, 2, 3, 4])("uses SVG geometry without bitmap backing at %sx pixel density", (density) => {
    vi.stubGlobal("devicePixelRatio", density);
    createJar(host).setSlots([0], false);
    const svg = host.querySelector("svg");
    expect(svg.namespaceURI).toBe("http://www.w3.org/2000/svg");
    expect(svg.getAttribute("width")).toBe("100%");
    expect(svg.getAttribute("height")).toBe("100%");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg.getAttribute("viewBox")).toBe("-32 -32 64 64");
    expect(host.querySelector("canvas, image, foreignObject")).toBeNull();
    expect(svg.querySelectorAll("defs ellipse").length).toBeGreaterThan(10);
    expect(svg.querySelectorAll("defs path")).toHaveLength(4);
    expect(svg.querySelector(".duck use").getAttribute("href")).toBe("#" + svg.querySelector("defs > g").id);
  });

  it("reuses duck nodes and removes obsolete slots and reset contents", () => {
    const jar = createJar(host);
    jar.setSlots([0, 1], false);
    const original = host.querySelector('.duck[data-slot="1"]');
    jar.setSlots([1, 2], false);
    expect(host.querySelectorAll(".duck")).toHaveLength(2);
    expect(host.querySelector('.duck[data-slot="1"]')).toBe(original);
    expect(host.querySelector('.duck[data-slot="0"]')).toBeNull();
    jar.reset();
    expect(host.querySelectorAll(".duck")).toHaveLength(0);
  });

  it("highlights the matching slot and clears it on removal", () => {
    const jar = createJar(host);
    jar.setSlots([3, 8], false);
    jar.setHighlight(3);
    const selected = host.querySelector(".duck-highlight");
    expect(selected.getAttribute("visibility")).toBe("visible");
    expect(selected.dataset.slot).toBe("3");
    expect(selected.getAttribute("transform")).toBe(host.querySelector('.duck[data-slot="3"]').getAttribute("transform"));
    expect(selected.querySelector("ellipse").getAttribute("vector-effect")).toBe("non-scaling-stroke");
    jar.setTheme("light");
    expect(selected.querySelector("ellipse").getAttribute("stroke")).toBe("#805d00");
    jar.setHighlight(null);
    expect(selected.getAttribute("visibility")).toBe("hidden");
    jar.setHighlight(8);
    jar.setSlots([3], false);
    expect(selected.getAttribute("visibility")).toBe("hidden");
    expect(selected.dataset.slot).toBeUndefined();
  });

  it.each([false, true])("rights in place over 1.2s, then reflows over 1.6s (arriving: %s)", (animate) => {
    const jar = createJar(host);
    jar.setSlots([0, 1], animate);
    const before = poses();
    const viewBox = host.querySelector("svg").getAttribute("viewBox");
    jar.right();
    advanceFrame(0);
    expect(poses()).toEqual(before);
    advanceFrame(600);
    const halfway = poses();
    const distance = (angle) => Math.abs(Math.atan2(Math.sin(angle * Math.PI / 180), Math.cos(angle * Math.PI / 180)));
    for (let i = 0; i < 2; i++) {
      expect([halfway[i].x, halfway[i].y]).toEqual([before[i].x, before[i].y]);
      expect(distance(halfway[i].angle)).toBeGreaterThan(0);
      expect(distance(halfway[i].angle)).toBeLessThan(distance(before[i].angle));
    }
    advanceFrame(1200);
    expect(poses().map((pose) => pose.angle)).toEqual([0, 0]);
    expect(host.querySelector("svg").getAttribute("viewBox")).toBe(viewBox);
    const saved = jar.capture(2);
    jar.loadSpots(saved);
    jar.setSlots([0, 1], false);
    expect(jar.capture(2)).toEqual(saved);
    vi.spyOn(Math, "random").mockReturnValue(0.42);
    jar.respawn();
    expect(jar.capture(2).some((spot) => spot.angle !== 0)).toBe(true);
    advanceFrame(2000);
    expect(poses()[1].angle).not.toBe(0);
    const target = jar.capture(2);
    expect(poses()[1].angle).not.toBe(target[1].angle * 180 / Math.PI);
    advanceFrame(2800);
    poses().forEach((pose, i) => {
      expect(pose.x).toBe(target[i].x);
      expect(pose.y).toBe(target[i].y);
      expect(pose.angle).toBeCloseTo(target[i].angle * 180 / Math.PI);
    });
  });

  it("can smoothly interrupt reflow with a turn in place", () => {
    const jar = createJar(host);
    jar.setSlots([0, 1], false);
    vi.spyOn(Math, "random").mockReturnValue(0.42);
    jar.respawn();
    advanceFrame(800);
    const before = poses();
    jar.right();
    advanceFrame(800);
    expect(poses()).toEqual(before);
    advanceFrame(1400);
    expect(poses().map(({ x, y }) => [x, y])).toEqual(before.map(({ x, y }) => [x, y]));
    advanceFrame(2000);
    expect(poses().map((pose) => pose.angle)).toEqual([0, 0]);
  });

  it("rights and reflows immediately with reduced motion", () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true });
    const jar = createJar(host);
    jar.setSlots([0], false);
    jar.right();
    expect(poses()[0].angle).toBe(0);
    jar.respawn();
    expect(poses()[0].angle).toBeCloseTo(jar.capture(1)[0].angle * 180 / Math.PI);
  });
});
