import { C, DURATION, H, SEG, SEGMENTS, W } from "../constants";
import { attr, s, show, text } from "../dom";
import { E, ep, prog } from "../ease";
import type { ActorFactory } from "../types";

/** Letterbox + strip (bg layer) and the screen-space HUD frame. */
export const frame: ActorFactory = (stage) => {
  // ---------- background ----------
  const BLEED = 4000;
  const LB = 60; // letterbox height at rest
  const strip = s("rect", { x: -BLEED, width: W + BLEED * 2, fill: C.strip }, stage.bg);

  // ---------- HUD ----------
  // once the letterbox has opened, it masks everything (the 3D floor would otherwise bleed into it)
  const masks = s("g", { fill: C.void }, stage.hud);
  s("rect", { x: -BLEED, y: -BLEED, width: W + BLEED * 2, height: BLEED + LB }, masks);
  s("rect", { x: -BLEED, y: H - LB, width: W + BLEED * 2, height: BLEED + LB }, masks);
  const hud = s("g", { "font-family": stage.font }, stage.hud);
  const ink = C.paper;

  /** Grows from an anchor: lines scale on x, everything else on y. */
  const grow = (el: SVGGraphicsElement, ox: number, oy: number, kx: number, ky: number) => {
    const vis = kx > 0.002 && ky > 0.002;
    show(el, vis);
    if (vis) attr(el, "transform", `translate(${ox} ${oy}) scale(${kx} ${ky}) translate(${-ox} ${-oy})`);
  };

  // Top modules (mirrored): bar, globe, chevrons, rule.
  const hudModule = (mirror: boolean) => {
    const g = s("g", { transform: mirror ? `translate(${W} 0) scale(-1 1)` : "" }, hud);
    const inner = s("g", {}, g);
    s("rect", { x: 120, y: 93, width: 22, height: 6, fill: ink }, inner);
    const globe = s("g", { fill: "none", stroke: ink, "stroke-width": 1.6 }, inner);
    s("circle", { cx: 164, cy: 96, r: 8 }, globe);
    s("ellipse", { cx: 164, cy: 96, rx: 3.4, ry: 8 }, globe);
    s("line", { x1: 156, y1: 96, x2: 172, y2: 96 }, globe);
    for (let i = 0; i < 3; i++)
      s("polyline", { points: `${186 + i * 9},91 ${191 + i * 9},96 ${186 + i * 9},101`, fill: "none", stroke: ink, "stroke-width": 2 }, inner);
    const rule = s("line", { x1: 224, y1: 96, x2: 380, y2: 96, stroke: ink, "stroke-opacity": 0.5, "stroke-width": 1 }, g);
    return { inner, rule };
  };
  const modL = hudModule(false);
  const modR = hudModule(true);

  const label = (x: number, y: number, anchor: "start" | "end", size = 13, weight = 600, op = 0.82) =>
    s("text", { x, y, "text-anchor": anchor, "font-size": size, "font-weight": weight, fill: ink, "fill-opacity": op, "letter-spacing": "0.16em" }, hud);

  const brand = label(120, 136, "start");
  text(brand, "学籍管理系统 · XUEJI REGISTRY");
  const seq = label(1800, 136, "end");
  const tc = label(152, 990, "start", 13, 600, 0.82);
  const tcTag = s("rect", { x: 120, y: 980, width: 24, height: 13, fill: ink }, hud);
  const tcTagText = s("text", { x: 132, y: 990.5, "text-anchor": "middle", "font-size": 9, "font-weight": 900, fill: C.ink, "letter-spacing": "0.05em" }, hud, "TC");

  // Segment progress, bottom right.
  const ticks = SEGMENTS.map((_, i) => {
    const x = 1800 - (SEGMENTS.length - i) * 40 + 6;
    const track = s("rect", { x, y: 983, width: 34, height: 4, fill: ink, "fill-opacity": 0.22 }, hud);
    const fill = s("rect", { x, y: 983, width: 0, height: 4, fill: C.yellow }, hud);
    return { x, track, fill };
  });
  const seqNum = label(1800 - SEGMENTS.length * 40 - 6, 990, "end", 13, 700, 0.82);

  // Side registration marks.
  const side = (mirror: boolean) => {
    const g = s("g", { transform: mirror ? `translate(${W} 0) scale(-1 1)` : "" }, hud);
    const line = s("line", { x1: 120, y1: 470, x2: 120, y2: 610, stroke: ink, "stroke-opacity": 0.35 }, g);
    const marks = s("g", {}, g);
    s("path", { d: "M132 452 h-12 v16 M132 628 h-12 v-16", fill: "none", stroke: ink, "stroke-width": 1.6 }, marks);
    s("rect", { x: 124, y: 532, width: 8, height: 8, fill: ink }, marks);
    s("rect", { x: 132, y: 540, width: 8, height: 8, fill: ink }, marks);
    return { line, marks };
  };
  const sideL = side(false);
  const sideR = side(true);

  const pad = (n: number, l = 2) => String(Math.floor(n)).padStart(l, "0");
  const LABELS = [
    ...SEGMENTS.map((sg, i) => ({ at: sg.at, label: `SEQ ${pad(i + 1)}/${pad(SEGMENTS.length)}   ${sg.en} · ${sg.zh}` })),
    { at: DURATION - 0.9, label: "SYSTEM READY · 系统就绪" },
  ];
  const timecode = (t: number) => {
    const c = Math.max(0, Math.min(t, DURATION));
    return `00:00:${pad(c)}:${pad((c % 1) * 25)}`;
  };

  return (t) => {
    // Letterbox opens from the centre line.
    const lb = t < 0 ? H / 2 : H / 2 - (H / 2 - LB) * ep(t, 0.08, 0.66, E.out);
    attr(strip, "y", lb);
    attr(strip, "height", Math.max(0, H - lb * 2));

    show(masks, t >= 0.66);

    // HUD boots from the centre outwards, then stays.
    show(hud, t >= 0);
    if (t < 0) return;
    const k1 = ep(t, 0.3, 0.75, E.out);
    const k2 = ep(t, 0.42, 0.9, E.out);
    const k3 = ep(t, 0.5, 1.0, E.out);
    grow(modL.inner, 120, 96, 1, k1);
    grow(modR.inner, 120, 96, 1, k1);
    grow(modL.rule, 224, 96, k2, 1);
    grow(modR.rule, 224, 96, k2, 1);
    grow(brand, 120, 136, 1, k2);
    grow(tc, 152, 990, 1, k3);
    grow(tcTag, 120, 990, 1, k3);
    grow(tcTagText, 120, 990, 1, k3);
    grow(seqNum, 0, 990, 1, k3);
    grow(sideL.line, 120, 540, 1, k2);
    grow(sideR.line, 120, 540, 1, k2);
    grow(sideL.marks, 120, 540, 1, k3);
    grow(sideR.marks, 120, 540, 1, k3);

    // Segment label rolls at each change (collapse to baseline, rise again).
    let li = 0;
    while (li + 1 < LABELS.length && t >= LABELS[li + 1].at) li++;
    const cur = LABELS[li];
    const next = LABELS[li + 1];
    let roll = li > 0 ? E.out(prog(t, cur.at, cur.at + 0.22)) : 1;
    if (next && t > next.at - 0.14) roll = 1 - E.in(prog(t, next.at - 0.14, next.at));
    text(seq, cur.label);
    grow(seq, 1800, 136, 1, k2 * roll);

    text(tc, timecode(t));
    text(seqNum, pad(Math.min(SEGMENTS.length, Math.floor(Math.min(t, DURATION - 0.001) / SEG) + 1)));
    ticks.forEach((tk, j) => {
      const p = prog(t, j * SEG, (j + 1) * SEG);
      attr(tk.fill, "width", 34 * p * k3);
      attr(tk.track, "width", 34 * k3);
    });
  };
};
