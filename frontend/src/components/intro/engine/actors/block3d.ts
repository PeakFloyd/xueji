import { BEAT, C, CX, CY } from "../constants";
import { attr, css, h, s, show } from "../dom";
import { E, bezier, clamp, ep, lerp, prog } from "../ease";
import { CJK_MID, type Layout } from "../layout";
import { layoutWord, type Stage } from "../stage";
import type { ActorFactory } from "../types";

export const STAMP = 10.42;
const DROP = bezier(0.6, 0, 1, 0.6); // accelerates all the way into contact
const LEAVE = bezier(0.5, 0, 0.75, 0);

/** The finished seal mark as a standalone SVG (used for the block's face and the impression). */
export function sealSvg(stage: Stage, L: Layout, parent: Element) {
  const S = L.seal.outer;
  const o = (S - L.seal.frameIn) / 2;
  const f = (S - L.seal.field) / 2;
  const svg = s("svg", { width: S, height: S, viewBox: `0 0 ${S} ${S}`, "text-rendering": "geometricPrecision" }, parent);
  svg.style.display = "block";
  svg.style.overflow = "visible";
  s("path", { d: `M0 0H${S}V${S}H0Z M${o} ${o}V${S - o}H${S - o}V${o}Z`, fill: C.red, "fill-rule": "evenodd" }, svg);
  s("rect", { x: f, y: f, width: L.seal.field, height: L.seal.field, fill: C.red }, svg);
  const g = s("g", { "font-family": stage.font, "font-size": L.seal.charSize, "font-weight": 900, fill: C.ink, "text-anchor": "middle" }, svg);
  for (const c of L.seal.chars) s("text", { x: S / 2 + c.dx, y: S / 2 + c.dy + CJK_MID * L.seal.charSize }, g, c.ch);
  return svg;
}

// CSS rotation matrices (y down, z towards the viewer), applied to column vectors.
type V = [number, number, number];
const rx = (a: number, [x, y, z]: V): V => {
  const c = Math.cos(a), s_ = Math.sin(a);
  return [x, c * y - s_ * z, s_ * y + c * z];
};
const rz = (a: number, [x, y, z]: V): V => {
  const c = Math.cos(a), s_ = Math.sin(a);
  return [c * x - s_ * y, s_ * x + c * y, z];
};
const RAD = Math.PI / 180;
const LIGHT: V = (() => {
  const v: V = [-0.38, -0.72, 0.58];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

export const block3d: ActorFactory = (stage, L) => {
  const S = L.seal.outer;
  const px = (n: number) => `${n.toFixed(2)}px`;

  const plane = h("div", {}, stage.cam3d);
  Object.assign(plane.style, {
    position: "absolute",
    left: "0",
    top: "0",
    width: "1920px",
    height: "1080px",
    transformStyle: "preserve-3d",
    transformOrigin: `${CX}px ${CY}px`,
  });

  // ---------- floor grid, grown out of the seal's edges ----------
  const GRID = 70;
  const HALF = 2100;
  const grid = s("svg", { width: HALF * 2, height: HALF * 2, viewBox: `${CX - HALF} ${CY - HALF} ${HALF * 2} ${HALF * 2}` }, plane);
  Object.assign(grid.style, { position: "absolute", left: px(CX - HALF), top: px(CY - HALF), overflow: "visible" });
  const lines: { el: SVGLineElement; n: number; horiz: boolean }[] = [];
  const gl = s("g", { stroke: C.paper, "stroke-opacity": 0.16, "stroke-width": 1.5 }, grid);
  for (let n = -HALF / GRID; n <= HALF / GRID; n++) {
    if (n % 1 !== 0) continue;
    lines.push({ el: s("line", {}, gl), n, horiz: true });
    lines.push({ el: s("line", {}, gl), n, horiz: false });
  }

  // ---------- floor words ----------
  const floor = s("svg", { width: 1920, height: 1080, viewBox: "0 0 1920 1080", "text-rendering": "geometricPrecision" }, plane);
  Object.assign(floor.style, { position: "absolute", left: "0", top: "0", overflow: "visible" });
  // two rows painted on the floor in front of the block, flush with its left edge
  const FS = 112;
  const fw = (word: string, base: number, beat: number) => {
    const lay = layoutWord(stage, word, 900, FS, -0.01);
    return [...word].map((ch, i) => ({
      el: s("text", { "font-family": stage.font, "font-size": FS, "font-weight": 900, fill: C.paper, "text-anchor": "middle" }, floor, ch),
      x: CX - S / 2 + lay.xs[i],
      y: base,
      at: beat - 0.04 + i * 0.03,
    }));
  };
  const words = [...fw("REQUEST", CY + S / 2 + 150, BEAT.request), ...fw("RECEIVED", CY + S / 2 + 284, BEAT.received)];

  // ---------- impression left on the floor ----------
  const imp = h("div", {}, plane);
  Object.assign(imp.style, { position: "absolute", left: px(CX - S / 2), top: px(CY - S / 2), width: px(S), height: px(S) });
  sealSvg(stage, L, imp);

  // ---------- the block ----------
  const block = h("div", {}, plane);
  Object.assign(block.style, {
    position: "absolute",
    left: px(CX - S / 2),
    top: px(CY - S / 2),
    width: px(S),
    height: px(S),
    transformStyle: "preserve-3d",
  });
  type Face = { el: HTMLDivElement; shadeEl: HTMLDivElement; n: V };
  const face = (n: V, style: Partial<CSSStyleDeclaration>, content?: (el: HTMLDivElement) => void): Face => {
    const el = h("div", {}, block);
    Object.assign(el.style, { position: "absolute", background: C.red, backfaceVisibility: "hidden", ...style });
    content?.(el);
    const shadeEl = h("div", {}, el);
    Object.assign(shadeEl.style, { position: "absolute", inset: "0", background: "#000" });
    return { el, shadeEl, n };
  };
  const top = face([0, 0, 1], { left: "0", top: "0", width: px(S), height: px(S), background: C.strip }, (el) => sealSvg(stage, L, el));
  const bottom = face([0, 0, -1], { left: "0", top: "0", width: px(S), height: px(S), transform: "rotateY(180deg)" });
  const north = face([0, -1, 0], { left: "0", top: "0", width: px(S), transformOrigin: "50% 0" });
  const south = face([0, 1, 0], { left: "0", width: px(S), transformOrigin: "50% 100%" });
  const west = face([-1, 0, 0], { left: "0", top: "0", height: px(S), transformOrigin: "0 50%" });
  const east = face([1, 0, 0], { top: "0", height: px(S), transformOrigin: "100% 50%" });
  const sides = [north, south, west, east];

  return (t) => {
    const on = t >= 8 && t < 12;
    show(stage.l3d, on);
    if (!on) return;

    // ---------- plane: page -> floor -> page ----------
    const back = ep(t, 11.15, 11.98, E.inOut);
    const pa = 56 * ep(t, 8.0, 8.75, E.inOut) * (1 - back);
    const pz = (-32 * ep(t, 8.0, 8.75, E.inOut) + 18 * ep(t, 8.6, 10.4, E.soft)) * (1 - back);
    // reframe while tilted so block + floor type sit centred in the strip
    const tilt = pa / 56;
    css(plane, "transform", `translate(${(-150 * tilt).toFixed(2)}px, ${(40 * tilt).toFixed(2)}px) rotateX(${pa.toFixed(3)}deg) rotateZ(${pz.toFixed(3)}deg)`);

    // grid
    for (const ln of lines) {
      const d = Math.abs(ln.n);
      const a = 8.05 + d * 0.012;
      const len = HALF * ep(t, a, a + 0.62, E.out) * (1 - ep(t, 10.95, 11.5, E.in));
      const vis = len > 1;
      show(ln.el, vis);
      if (!vis) continue;
      const o = ln.n * GRID;
      if (ln.horiz) {
        attr(ln.el, "x1", CX - len);
        attr(ln.el, "x2", CX + len);
        attr(ln.el, "y1", CY + o);
        attr(ln.el, "y2", CY + o);
      } else {
        attr(ln.el, "x1", CX + o);
        attr(ln.el, "x2", CX + o);
        attr(ln.el, "y1", CY - len);
        attr(ln.el, "y2", CY + len);
      }
    }

    // floor words unfold from their baseline
    // the stamp knocks the floor type flat on impact
    for (const w of words) {
      const k = E.out(prog(t, w.at, w.at + 0.34)) * (1 - ep(t, STAMP, STAMP + 0.24, E.out));
      show(w.el, k > 0.002);
      if (k > 0.002) attr(w.el, "transform", `translate(${w.x} ${w.y}) scale(1 ${k})`);
    }

    // ---------- block ----------
    const depth = 150 * ep(t, 8.0, 8.55, E.out);
    // lift first: mid-flip the block's half-diagonal (~223px) must stay above the floor plane,
    // otherwise the browser splits the intersecting planes and the grid shows through
    let up = 250 * ep(t, 9.42, 9.8, E.out) * (1 - ep(t, STAMP - 0.22, STAMP, DROP));
    up += 1700 * ep(t, STAMP + 0.1, STAMP + 0.6, LEAVE);
    const flip = 180 * ep(t, 9.55, 10.12, E.inOut);
    const spin = 90 * ep(t, 9.55, 10.12, E.inOut);
    const blockOn = t < STAMP + 0.6;
    show(block, blockOn);
    show(imp, t >= STAMP);

    if (blockOn) {
      css(
        block,
        "transform",
        `translateZ(${(up + depth / 2).toFixed(2)}px) rotateZ(${spin.toFixed(3)}deg) rotateX(${flip.toFixed(3)}deg) translateZ(${(-depth / 2).toFixed(2)}px)`,
      );
      css(top.el, "transform", `translateZ(${depth.toFixed(2)}px)`);
      north.el.style.height = px(depth);
      css(north.el, "transform", "rotateX(90deg)");
      south.el.style.height = px(depth);
      south.el.style.top = px(S - depth);
      css(south.el, "transform", "rotateX(-90deg)");
      west.el.style.width = px(depth);
      css(west.el, "transform", "rotateY(-90deg)");
      east.el.style.width = px(depth);
      east.el.style.left = px(S - depth);
      css(east.el, "transform", "rotateY(90deg)");
      for (const sd of sides) show(sd.el, depth > 0.5);

      // Lambert shading from the real orientation of each face
      for (const f of [top, bottom, ...sides]) {
        let n = rx(flip * RAD, f.n);
        n = rz(spin * RAD, n);
        n = rz(pz * RAD, n);
        n = rx(pa * RAD, n);
        const lam = clamp(n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2], 0, 1);
        // the face that is the flat seal at t=8 must start un-shaded
        const flat = f === top ? 1 - ep(t, 8.0, 8.5, E.out) : 0;
        const dark = lerp(0.62 * (1 - lam), 0, flat);
        css(f.shadeEl, "opacity", dark.toFixed(3));
      }
    }
  };
};
