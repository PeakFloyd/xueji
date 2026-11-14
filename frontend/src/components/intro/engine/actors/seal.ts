import { BEAT, C, CX, CY } from "../constants";
import { attr, s, show } from "../dom";
import { E, ep, lerp, mixColor, prog } from "../ease";
import { GLYPHS } from "../glyphs";
import { CJK_MID, type Layout } from "../layout";
import { N, align, check, circle, lerpPoly, rect, resample, toPath, type Poly } from "../morph";
import type { ActorFactory } from "../types";

// Morph windows.
const M1 = [4.92, 5.44] as const; // ID -> check in ring
const M2 = [5.74, 6.32] as const; // ring + check -> seal (frame + field)
const INK = [6.22, 6.68] as const; // vermilion sweeps across
const CARVE = 6.62; // characters rise into the field

/** Seal centre/scale over time once it is a finished mark (segments 4-5). */
export function sealPlacement(t: number, L: Layout) {
  const S = L.seal.outer;
  // signature chop: top aligned with the credit line's cap height, flush with the rule's end
  const chop = { x: L.end.x1 - 28, y: L.end.ruleY + L.end.ruleH + 22 + 28, size: 56 };
  let x = CX;
  let y = CY;
  let size = S;
  // into the data panel
  const a = ep(t, 12.05, 12.55, E.inOut);
  x = lerp(x, 290, a);
  y = lerp(y, 330, a);
  size = lerp(size, 180, a);
  // park beyond the rule's end (clear of the title), drifting while the title builds
  // leaves before the WELCOME tag arrives where it sat; a curved path (x early, y late) keeps it
  // above the travelling rule until it is past the rule's end
  const bp = prog(t, 15.42, 16.25);
  const b = E.inOut(bp);
  x = lerp(x, chop.x + 118, E.out(bp));
  y = lerp(y, chop.y + 6, E.in(bp));
  size = lerp(size, 84, b);
  const c = E.soft(prog(t, 16.25, 17.45));
  x = lerp(x, x + 10, c);
  size = lerp(size, size + 6, c);
  let r = -12 * b + 6 * c;
  // stamp
  const d = ep(t, 17.45, BEAT.welcome2, E.in);
  x = lerp(x, chop.x, d);
  y = lerp(y, chop.y, d);
  size = lerp(size, chop.size, d);
  r = lerp(r, 0, d);
  return { x, y, k: size / S, r };
}

export const seal: ActorFactory = (stage, L) => {
  const { cx, cy } = L.seal;

  // ---------- source outlines (exactly the glyphs the kinetic actor drew) ----------
  const glyphPoly = (ch: "I" | "D", slot: number, contour: number): Poly => {
    const gl = GLYPHS[ch];
    const ox = L.id.x + L.id.k * L.id.word.xs[slot] - (gl.advance / 1000) * 100 * L.id.k * 0.5;
    const sc = 0.1 * L.id.k;
    return gl.contours[contour].map(([x, y]) => [ox + x * sc, L.id.base + y * sc]);
  };
  const I0 = resample(glyphPoly("I", 0, 0));
  const Do0 = resample(glyphPoly("D", 1, 0));
  const Di0 = resample(glyphPoly("D", 1, 1));

  // ---------- targets ----------
  const R1 = 196;
  const R2 = 164;
  const chk = check([cx - 86, cy + 4], [cx - 26, cy + 64], [cx + 92, cy - 62], 40);
  const I1 = align(I0, resample(chk));
  const Do1 = align(Do0, circle(cx, cy, R1, N));
  const Di1 = align(Di0, circle(cx, cy, R2, N));
  const I2 = align(I1, resample(rect(cx, cy, L.seal.field, L.seal.field)));
  const Do2 = align(Do1, resample(rect(cx, cy, L.seal.outer, L.seal.outer)));
  const Di2 = align(Di1, resample(rect(cx, cy, L.seal.frameIn, L.seal.frameIn)));

  const rot = (p: Poly, deg: number): Poly => {
    if (!deg) return p;
    const a = (deg * Math.PI) / 180;
    const cs = Math.cos(a);
    const sn = Math.sin(a);
    return p.map(([x, y]) => [cx + (x - cx) * cs - (y - cy) * sn, cy + (x - cx) * sn + (y - cy) * cs]);
  };

  // ---------- elements ----------
  const root = s("g", {}, stage.cam);
  const clip = s("clipPath", { id: "seal-ink" }, stage.defs);
  const clipPath = s("path", {}, clip);
  const baseG = s("g", {}, root);
  const fieldP = s("path", {}, baseG);
  const frameP = s("path", { "fill-rule": "evenodd" }, baseG);
  const inkG = s("g", { "clip-path": "url(#seal-ink)" }, root);
  const fieldR = s("path", { fill: C.red }, inkG);
  const frameR = s("path", { fill: C.red, "fill-rule": "evenodd" }, inkG);
  const charG = s("g", { "font-family": stage.font }, root);
  const chars = L.seal.chars.map((c, i) => ({
    ...c,
    i,
    el: s("text", { "text-anchor": "middle", "font-size": L.seal.charSize, fill: C.ink }, charG, c.ch),
  }));

  // side labels
  const labels = s("g", { "font-family": stage.font }, stage.cam);
  const mk = (x: number, y: number, anchor: string, size: number, weight: number, fill: string, str: string, ls = "0") =>
    s("text", { x, y, "text-anchor": anchor, "font-size": size, "font-weight": weight, fill, "letter-spacing": ls }, labels, str);
  const LX = 330;
  const lab = [
    { el: mk(cx - LX, cy - 40, "end", 14, 700, C.paper, "IDENTITY", "0.34em"), y: cy - 40, at: BEAT.id - 0.02 },
    { el: mk(cx - LX, cy + 30, "end", 54, 900, C.paper, "身份核验", "0.04em"), y: cy + 30, at: BEAT.id + 0.06 },
    { el: mk(cx + LX, cy - 40, "start", 14, 700, C.paper, "CONFIRMED", "0.34em"), y: cy - 40, at: BEAT.confirmed + 0.2 },
    { el: mk(cx + LX, cy + 30, "start", 54, 900, C.yellow, "已确认", "0.04em"), y: cy + 30, at: BEAT.confirmed + 0.28 },
  ];
  (lab[0].el as SVGTextElement).setAttribute("fill-opacity", "0.7");
  (lab[2].el as SVGTextElement).setAttribute("fill-opacity", "0.7");

  const inkClip = (k: number) => {
    // half-plane whose edge sweeps from bottom-left to top-right
    const ux = Math.SQRT1_2;
    const uy = -Math.SQRT1_2;
    const vx = -uy;
    const vy = ux;
    const d = lerp(-330, 330, k);
    const ex = cx + ux * d;
    const ey = cy + uy * d;
    const F = 3000;
    const pts = [
      [ex + vx * F, ey + vy * F],
      [ex - vx * F, ey - vy * F],
      [ex - vx * F - ux * F, ey - vy * F - uy * F],
      [ex + vx * F - ux * F, ey + vy * F - uy * F],
    ];
    return "M" + pts.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join("L") + "Z";
  };

  return (t) => {
    const active = t >= M1[0] && !(t >= 8 && t < 12);
    show(root, active);

    // labels live only in segment 2
    const labOut = 1 - ep(t, 7.28, 7.56, E.in);
    show(labels, t >= 4.4 && t < 7.8);
    for (const l of lab) {
      const k = E.out(prog(t, l.at, l.at + 0.34)) * labOut;
      show(l.el, k > 0.002);
      if (k > 0.002) attr(l.el, "transform", `translate(0 ${l.y}) scale(1 ${k}) translate(0 ${-l.y})`);
    }

    if (!active) return;

    // ---------- geometry ----------
    const k1 = ep(t, M1[0], M1[1], E.snap);
    const k2 = ep(t, M2[0], M2[1], E.snap);
    const ang = 90 * k2;
    let pI: Poly, pDo: Poly, pDi: Poly;
    if (k2 <= 0) {
      pI = lerpPoly(I0, I1, k1);
      pDo = lerpPoly(Do0, Do1, k1);
      pDi = lerpPoly(Di0, Di1, k1);
    } else {
      pI = rot(lerpPoly(I1, I2, k2), ang);
      pDo = rot(lerpPoly(Do1, Do2, k2), ang);
      pDi = rot(lerpPoly(Di1, Di2, k2), ang);
    }
    const dField = toPath([pI]);
    const dFrame = toPath([pDo, pDi]);

    // placement (identity during segment 2, moves in segments 4-5)
    const pl = t >= 12 ? sealPlacement(t, L) : { x: cx, y: cy, k: 1, r: 0 };
    attr(root, "transform", `translate(${pl.x} ${pl.y}) rotate(${pl.r}) scale(${pl.k}) translate(${-cx} ${-cy})`);

    // ---------- colour ----------
    const ink = ep(t, INK[0], INK[1], E.inOut);
    const inkDone = ink >= 1;
    show(baseG, !inkDone);
    show(inkG, ink > 0);
    if (!inkDone) {
      attr(fieldP, "d", dField);
      attr(frameP, "d", dFrame);
      attr(fieldP, "fill", mixColor(C.paper, C.yellow, k1));
      attr(frameP, "fill", C.paper);
    }
    if (ink > 0) {
      attr(fieldR, "d", dField);
      attr(frameR, "d", dFrame);
      attr(clipPath, "d", inkDone ? inkClip(2) : inkClip(ink));
    }

    // ---------- characters ----------
    for (const c of chars) {
      const st = CARVE + c.i * 0.15;
      const k = E.out(prog(t, st, st + 0.32));
      show(c.el, k > 0.002);
      if (k <= 0.002) continue;
      const bx = cx + c.dx;
      const by = cy + c.dy + CJK_MID * L.seal.charSize;
      attr(c.el, "font-weight", Math.round(lerp(200, 900, E.out(prog(t, st, st + 0.4)))));
      attr(c.el, "transform", `translate(${bx} ${by}) scale(1 ${k})`);
    }
  };
};
