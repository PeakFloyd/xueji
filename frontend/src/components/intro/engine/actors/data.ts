import { BEAT, C, CLASSES, COUNTS, CX, CY } from "../constants";
import { attr, s, show, text } from "../dom";
import { E, ep, lerp, mixColor, prog } from "../ease";
import type { ActorFactory } from "../types";

/**
 * Segment 4 - data / UI.
 * The impression's bottom edge peels off into the chart baseline; 50 students' earned credits rise
 * against the graduation requirement; the status chip flips to AUTHORIZED. On the way out the
 * baseline becomes the title rule and the chip becomes the WELCOME tag.
 */
export const data: ActorFactory = (stage, L) => {
  const g = s("g", { "font-family": stage.font }, stage.cam);

  // ---------- chart geometry ----------
  const X0 = 660;
  const X1 = 1760;
  const BASE = 790;
  const PX = 12; // px per credit
  const BAR = 16;
  const GAP = 2;
  const GROUP_GAP = 24;
  const groupW = 5 * BAR + 4 * GAP;
  const plotW = CLASSES.length * groupW + (CLASSES.length - 1) * GROUP_GAP;
  const bx0 = X0 + (X1 - X0 - plotW) / 2;
  const yOf = (v: number) => BASE - v * PX;

  // "processing": each class sorts its five records ascending (stable), so the requirement line still holds
  const bars = CLASSES.flatMap((cl, gi) => {
    const order = cl.credits.map((v, j) => ({ v, j })).sort((a, b) => a.v - b.v || a.j - b.j);
    return cl.credits.map((v, j) => ({
      v,
      met: v >= cl.required,
      g: gi,
      x: bx0 + gi * (groupW + GROUP_GAP) + j * (BAR + GAP),
      xs: bx0 + gi * (groupW + GROUP_GAP) + order.findIndex((o) => o.j === j) * (BAR + GAP),
      i: gi * 5 + j,
    }));
  });
  const SORT = 14.05;
  const barX = (b: { x: number; xs: number; g: number }, t: number) =>
    lerp(b.x, b.xs, ep(t, SORT + b.g * 0.05, SORT + b.g * 0.05 + 0.5, E.inOut));
  const metN = bars.filter((b) => b.met).length;
  const belowN = bars.length - metN;

  const ticksG = s("g", {}, g);
  const gridVals = [10, 20, 30];
  const grids = gridVals.map((v, i) => ({
    line: s("rect", { x: X0, y: yOf(v) - 0.5, width: X1 - X0, height: 1, fill: C.paper, "fill-opacity": 0.14 }, ticksG),
    label: s("text", { x: X0 - 18, y: yOf(v) + 4.5, "text-anchor": "end", "font-size": 13, "font-weight": 600, fill: C.paper, "fill-opacity": 0.55, style: "font-variant-numeric: tabular-nums" }, ticksG, String(v)),
    at: 12.24 + i * 0.07,
    y: yOf(v),
  }));

  const barEls = bars.map((b) => ({ ...b, el: s("path", { fill: b.met ? C.paper : C.red }, g) }));
  const barPath = (x: number, h: number) => {
    if (h <= 0.5) return "";
    const r = Math.min(4, h);
    return `M${x} ${BASE}V${BASE - h + r}Q${x} ${BASE - h} ${x + r} ${BASE - h}H${x + BAR - r}Q${x + BAR} ${BASE - h} ${x + BAR} ${BASE - h + r}V${BASE}Z`;
  };

  // graduation requirement: a step line (20 for CS/SE, 24 for Maths)
  const stepX = bx0 + 7 * (groupW + GROUP_GAP) - GROUP_GAP / 2;
  const req = s(
    "path",
    { d: `M${X0} ${yOf(20)}H${stepX}V${yOf(24)}H${X1}`, fill: "none", stroke: C.yellow, "stroke-width": 2, "stroke-linejoin": "round" },
    g,
  );
  const reqLen = X1 - X0 + 4 * PX;
  attr(req, "stroke-dasharray", `${reqLen} ${reqLen}`);
  const reqLab = s("g", { "font-size": 12, "font-weight": 700, fill: C.paper, "fill-opacity": 0.8, "letter-spacing": "0.08em" }, g);
  s("text", { x: X0 + 4, y: yOf(20) - 10 }, reqLab, "毕业要求 20");
  s("text", { x: X1, y: yOf(24) - 10, "text-anchor": "end" }, reqLab, "24");

  const classLabs = CLASSES.map((cl, gi) =>
    s("text", { x: bx0 + gi * (groupW + GROUP_GAP) + groupW / 2, y: BASE + 26, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: C.paper, "fill-opacity": 0.55, "letter-spacing": "0.04em", style: "font-variant-numeric: tabular-nums" }, g, cl.id),
  );

  // selective direct labels: the extremes only
  const maxBar = bars.reduce((a, b) => (b.v > a.v ? b : a));
  const minBar = bars.reduce((a, b) => (b.v < a.v ? b : a));
  const extBars = [maxBar, minBar];
  const ext = extBars.map((b) =>
    s("text", { x: b.x + BAR / 2, y: yOf(b.v) - 9, "text-anchor": "middle", "font-size": 13, "font-weight": 800, fill: C.paper }, g, String(b.v)),
  );

  const extY = [maxBar, minBar].map((b) => yOf(b.v) - 9);

  // heading + legend
  const head = s("g", {}, g);
  s("text", { x: X0, y: 384, "font-size": 15, "font-weight": 800, fill: C.paper, "letter-spacing": "0.2em" }, head, "EARNED CREDITS · 已修学分");
  const legend = s("g", { "font-size": 12, "font-weight": 600, fill: C.paper, "fill-opacity": 0.8, "letter-spacing": "0.06em" }, head);
  const items = [
    { kind: "box", color: C.paper, label: `达标 MET ${metN}` },
    { kind: "box", color: C.red, label: `未达标 BELOW ${belowN}` },
    { kind: "line", color: C.yellow, label: "毕业要求 REQUIRED" },
  ];
  let lx = X1;
  for (const it of [...items].reverse()) {
    const w = stage.measure(it.label, 600, 12) + it.label.length * 0.06 * 12;
    lx -= w;
    s("text", { x: lx, y: 384 }, legend, it.label);
    lx -= 18;
    if (it.kind === "box") s("rect", { x: lx, y: 374, width: 10, height: 10, fill: it.color, "fill-opacity": 1 }, legend);
    else s("rect", { x: lx - 4, y: 378, width: 14, height: 2, fill: it.color }, legend);
    lx -= 26;
  }

  // ---------- left panel ----------
  const PX0 = 200;
  const panel = s("g", {}, g);
  const statusLab = s("text", { x: PX0, y: 474, "font-size": 12, "font-weight": 700, fill: C.paper, "fill-opacity": 0.65, "letter-spacing": "0.3em" }, panel, "STATUS · 状态");

  const chip = s("g", {}, g);
  const chipBg = s("rect", { fill: C.red }, chip);
  const chipY = s("rect", { fill: C.yellow }, chip);
  const chipText = s("text", { "font-size": 22, "font-weight": 900, "letter-spacing": "0.14em" }, chip);

  const hero = s("text", { x: PX0 - 6, y: 668, "font-size": 128, "font-weight": 900, fill: C.paper, "letter-spacing": "-0.02em" }, panel);
  const heroPct = s("text", { y: 668, "font-size": 52, "font-weight": 900, fill: C.paper }, panel, "%");
  const track = s("rect", { x: PX0, y: 700, width: 360, height: 6, fill: C.paper, "fill-opacity": 0.16 }, panel);
  const fillR = s("rect", { x: PX0, y: 700, height: 6, fill: C.red }, panel);
  const fillY = s("rect", { x: PX0, y: 700, height: 6, fill: C.yellow }, panel);

  const kpis = [
    { v: COUNTS.students, label: "学生 STUDENTS", x: PX0, end: 13.7 },
    { v: COUNTS.courses, label: "课程 COURSES", x: PX0 + 124, end: 13.9 },
    { v: COUNTS.enrollments, label: "选课 ENROLLED", x: PX0 + 248, end: 14.5 },
  ].map((k) => ({
    ...k,
    val: s("text", { x: k.x, y: 790, "font-size": 44, "font-weight": 800, fill: C.paper }, panel),
    lab: s("text", { x: k.x, y: 818, "font-size": 12, "font-weight": 600, fill: C.paper, "fill-opacity": 0.65, "letter-spacing": "0.08em" }, panel, k.label),
  }));

  // the line that runs through the whole second half: seal edge -> baseline -> title rule
  const rule = s("rect", {}, g);

  const rise = (el: SVGElement, y: number, k: number) => {
    show(el, k > 0.002);
    if (k > 0.002) attr(el, "transform", `translate(0 ${y}) scale(1 ${k}) translate(0 ${-y})`);
  };

  const chipW = (str: string) => stage.measure(str, 900, 22) + str.length * 0.14 * 22 + 36;
  const AUTH_W = chipW("AUTHORIZED · 授权通过");
  const WELCOME_W = chipW("WELCOME · 欢迎使用");
  const AUTH = BEAT.authorized;

  return (t) => {
    const on = t >= 12;
    show(g, on);
    if (!on) return;

    const out = ep(t, 15.25, 15.52, E.in); // collapse of everything that does not travel on

    // ---------- rule ----------
    const r1 = ep(t, 12.05, 12.6, E.inOut);
    const r2 = ep(t, 15.55, 16.15, E.inOut);
    const ex0 = lerp(lerp(CX - 210, X0, r1), L.end.x0, r2);
    const ex1 = lerp(lerp(CX + 210, X1, r1), L.end.x1, r2);
    const ry = lerp(lerp(CY + 208, BASE - 1, r1), L.end.ruleY, r2);
    const rh = lerp(2, L.end.ruleH, r2);
    attr(rule, "x", ex0);
    attr(rule, "width", ex1 - ex0);
    attr(rule, "y", ry);
    attr(rule, "height", rh);
    attr(rule, "fill", mixColor(C.paper, C.yellow, r2));

    // ---------- grid + ticks ----------
    for (const gr of grids) {
      const k = ep(t, gr.at, gr.at + 0.42, E.out) * (1 - out);
      show(gr.line, k > 0.001);
      attr(gr.line, "width", (X1 - X0) * k);
      rise(gr.label, gr.y + 4.5, k);
    }

    // ---------- bars ----------
    for (const b of barEls) {
      const st = BEAT.start + 0.04 + b.i * 0.024;
      const grow = E.out(prog(t, st, st + 0.42));
      const c = 15.25 + (49 - b.i) * 0.005;
      const h = b.v * PX * grow * (1 - ep(t, c, c + 0.22, E.in));
      attr(b.el, "d", barPath(barX(b, t), h));
    }
    attr(req, "stroke-dashoffset", reqLen * (1 - ep(t, 13.12, 13.62, E.inOut)) + reqLen * out);
    rise(reqLab, yOf(20), E.out(prog(t, 13.4, 13.7)) * (1 - out));
    classLabs.forEach((el, i) => rise(el, BASE + 26, E.out(prog(t, 12.62 + i * 0.03, 12.92 + i * 0.03)) * (1 - out)));
    ext.forEach((el, i) => {
      attr(el, "x", barX(extBars[i], t) + BAR / 2);
      rise(el, extY[i], E.out(prog(t, 13.7 + i * 0.08, 14.0 + i * 0.08)) * (1 - out));
    });
    rise(head, 384, E.out(prog(t, 12.5, 12.82)) * (1 - out));

    // ---------- panel ----------
    rise(statusLab, 474, E.out(prog(t, BEAT.start, BEAT.start + 0.3)) * (1 - out));
    const pct = Math.round(100 * E.soft(prog(t, BEAT.processing, 14.85)));
    text(hero, String(pct));
    attr(heroPct, "x", PX0 - 6 + stage.measure(String(pct), 900, 128) - 0.02 * 128 * (String(pct).length - 1) + 6);
    const heroK = E.out(prog(t, BEAT.processing - 0.06, BEAT.processing + 0.26)) * (1 - out);
    rise(hero, 668, heroK);
    rise(heroPct, 668, heroK);
    const trackK = ep(t, BEAT.processing, BEAT.processing + 0.4, E.out) * (1 - out);
    show(track, trackK > 0.001);
    attr(track, "width", 360 * trackK);
    const fillW = 360 * (pct / 100) * (1 - out);
    const sweep = ep(t, AUTH - 0.05, AUTH + 0.16, E.inOut);
    attr(fillR, "width", fillW);
    attr(fillY, "width", Math.min(fillW, 360 * sweep));
    for (const k of kpis) {
      const v = Math.round(k.v * E.soft(prog(t, 12.9, k.end)));
      text(k.val, String(v));
      const kk = E.out(prog(t, 12.84, 13.14)) * (1 - out);
      rise(k.val, 790, kk);
      rise(k.lab, 818, kk);
    }

    // ---------- chip: PROCESSING (red) -> AUTHORIZED (yellow) -> WELCOME tag ----------
    const c1 = ep(t, 15.6, 16.2, E.inOut);
    const cx0 = lerp(PX0, L.end.x0, c1);
    const cy0 = lerp(492, L.end.top - 92, c1);
    const ch = lerp(50, 44, c1);
    const authed = t >= AUTH;
    // keep room for the current label; tighten to the WELCOME label only once it has rolled in
    const cw0 = lerp(lerp(360, AUTH_W, c1), WELCOME_W, ep(t, BEAT.welcome - 0.12, BEAT.welcome + 0.16, E.inOut));
    const grow = ep(t, BEAT.start, BEAT.start + 0.34, E.out);
    const cw = cw0 * grow;
    attr(chipBg, "x", cx0);
    attr(chipBg, "y", cy0);
    attr(chipBg, "height", ch);
    attr(chipBg, "width", cw);
    attr(chipY, "x", cx0);
    attr(chipY, "y", cy0);
    attr(chipY, "height", ch);
    attr(chipY, "width", cw * sweep);
    show(chip, grow > 0.001);

    let label = "PROCESSING · 处理中";
    let tk = E.out(prog(t, BEAT.start + 0.14, BEAT.start + 0.44));
    if (t >= AUTH - 0.12) {
      label = t < AUTH ? label : "AUTHORIZED · 授权通过";
      tk = t < AUTH ? 1 - E.in(prog(t, AUTH - 0.12, AUTH)) : E.out(prog(t, AUTH, AUTH + 0.26));
    }
    const WEL = BEAT.welcome - 0.12;
    if (t >= WEL - 0.12) {
      label = t < WEL ? "AUTHORIZED · 授权通过" : "WELCOME · 欢迎使用";
      tk = t < WEL ? 1 - E.in(prog(t, WEL - 0.12, WEL)) : E.out(prog(t, WEL, WEL + 0.28));
    }
    text(chipText, label);
    attr(chipText, "fill", authed ? C.ink : C.paper);
    const tb = cy0 + ch / 2 + 8;
    attr(chipText, "x", cx0 + 18);
    attr(chipText, "y", tb);
    rise(chipText, tb, tk);
  };
};
