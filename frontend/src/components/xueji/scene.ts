// The interface's persistent graphic layer: letterbox, HUD frame, the identity lockup (tag, big type,
// rule, caption, seal), the caret and the outline ghost word. It starts as an exact copy of the intro's
// last frame and every later screen is built by moving these same objects - nothing is ever cut or
// cross-faded. Imperative SVG like the intro engine; React owns the HTML parts on top.
import { C, CX, CY, DURATION, H, SEGMENTS, W } from "../intro/engine/constants";
import { attr, s, show, text as setText } from "../intro/engine/dom";
import { camera } from "../intro/engine/engine";
import { sealPlacement } from "../intro/engine/actors/seal";
import { CAP, CJK_MID, makeLayout } from "../intro/engine/layout";
import type { Stage } from "../intro/engine/stage";
import { E, Value, clamp, lerp, mixColor, now, timecode } from "./anim";
import { ROLE } from "./abilities";
import type { Role } from "./types";

export type Fonts = { intro: string; ui: string };

// ---------------------------------------------------------------- geometry shared with React

export const CAM_END = camera(DURATION); // the intro ends pushed in to 1.06
export const LB = 60; // letterbox

/** Console placement of the lockup (camera at 1.0). */
export const CONSOLE = {
  x: 200,
  ruleY: 330,
  nameSize: 92,
  colW: 0, // filled in by createScene (rule length scales with the name)
  cmd: { x: 200, prompt: 216, caretX: 238, caretY: 887, caretW: 13, caretH: 32, ruleY: 936, x1: 1720 },
};

/** Gate -> console choreography, seconds after confirm(); React times its HTML build-in on these. */
export const T_CONFIRM = { sweep: 0, idOut: 0.06, nameIn: 0.36, move: 0.7, moveDur: 0.72, build: 1.06, briefing: 1.44 };
/** Intro end -> gate, seconds after handoff(). */
export const T_HANDOFF = { caret: 0.62, demo: 0.42, ready: 0.62 };

const measurer = (family: string) => {
  const ctx = document.createElement("canvas").getContext("2d")!;
  const cache = new Map<string, number>();
  return (str: string, weight: number, size: number) => {
    const key = `${weight}|${size}|${str}`;
    let v = cache.get(key);
    if (v === undefined) {
      ctx.font = `${weight} ${size}px ${family}`;
      v = ctx.measureText(str).width;
      cache.set(key, v);
    }
    return v;
  };
};

// ---------------------------------------------------------------- small animated parts

/** A label that changes by collapsing onto its pivot line and rising again with the new text. */
class Roll {
  readonly k = new Value(1);
  private queue: { at: number; text: string }[] = [];
  private shown = "";
  constructor(
    readonly el: SVGTextElement,
    initial: string,
    private pivot: () => number,
  ) {
    this.shown = initial;
    setText(el, initial);
  }
  get text() {
    return this.queue.length ? this.queue[this.queue.length - 1].text : this.shown;
  }
  /** Change text. `delay` from now; collapse 0.13s, rise 0.26s. */
  roll(next: string, delay = 0, at = now()) {
    if (next === this.text && this.k.target === 1) return;
    const hidden = this.k.target === 0 && !this.k.busy;
    if (hidden) {
      this.push(at + delay, next);
      this.k.to(1, 0.3, delay, E.out, at);
      return;
    }
    this.k.to(0, 0.13, delay, E.in, at);
    this.push(at + delay + 0.13, next);
    this.k.to(1, 0.26, delay + 0.13, E.out, at);
  }
  // a newer instruction replaces anything queued to happen after it
  private push(at: number, text: string) {
    this.queue = this.queue.filter((q) => q.at < at);
    this.queue.push({ at, text });
  }
  hide(delay = 0, at = now()) {
    this.k.to(0, 0.16, delay, E.in, at);
  }
  /** Show `next` at once (no roll): used when another layer has just shown the same text in place. */
  set(next: string) {
    this.queue = [];
    this.shown = next;
    this.k.set(1);
  }
  render(t: number) {
    while (this.queue.length && this.queue[0].at <= t) this.shown = this.queue.shift()!.text;
    setText(this.el, this.shown);
    const k = this.k.get(t);
    show(this.el, k > 0.002 && this.shown !== "");
    if (k > 0.002) {
      const y = this.pivot();
      attr(this.el, "transform", `translate(0 ${y}) scale(1 ${k}) translate(0 ${-y})`);
    }
  }
}

/** One character of the big line: rises out of the rule, sinks back into it. */
type Big = { ch: string; el: SVGTextElement; x: Value; rise: Value; weight: Value; size: Value; dead?: number };

// ---------------------------------------------------------------- the scene

export type SceneStatus = "idle" | "verifying" | "denied" | "confirmed";

export function createScene(svgs: { bg: SVGSVGElement; main: SVGSVGElement; hud: SVGSVGElement }, fonts: Fonts) {
  const mIntro = measurer(fonts.intro);
  const L = makeLayout({ measure: mIntro } as unknown as Stage);
  const T = L.end;
  const RULE_W = T.x1 - T.x0;
  const S_CON = CONSOLE.nameSize / T.size;
  CONSOLE.colW = RULE_W * S_CON;
  const uiFamily = `${fonts.ui}, ${fonts.intro}`;
  const mUi = measurer(uiFamily);

  // ---------- background (bg svg): strip between the letterbox bars ----------
  const BLEED = 4000;
  s("rect", { x: -BLEED, y: LB, width: W + BLEED * 2, height: H - LB * 2, fill: C.strip }, svgs.bg);

  // ---------- camera group (main svg) ----------
  const cam = s("g", {}, svgs.main);
  const camK = new Value(CAM_END);

  // ghost words
  const GHOST = 500;
  const ghostBase = T.base - 0.38 * T.size + (CAP * GHOST) / 2;
  const ghostAttrs = { "font-size": GHOST, "font-weight": 900, fill: "none", stroke: C.paper, "stroke-opacity": 0.13, "stroke-width": 1.5, "letter-spacing": "0.02em" };
  const ghost = s("text", { x: CX, y: ghostBase, "text-anchor": "middle", "font-family": uiFamily, ...ghostAttrs }, cam, "XUEJI");
  const ghostK = new Value(1);
  let ghostT0 = Infinity; // drift continuation clock, starts at the hand-off
  // the role, set vertically in the left margin (reads bottom to top, rises out of the margin's edge)
  const ROLE_GHOST = 148;
  const RG = { x: 108, y: 900 };
  const roleGhost = s("text", { x: 0, y: 0, "font-family": uiFamily, ...ghostAttrs, "font-size": ROLE_GHOST, "stroke-opacity": 0.16, "letter-spacing": "0.04em" }, cam, "");
  const roleGhostK = new Value(0);

  // lockup group: big line + rule live in "gate space" and are moved together into the console
  const lock = s("g", {}, cam);
  const lockK = new Value(0); // 0 = gate placement, 1 = console placement
  const bigG = s("g", { "font-family": uiFamily }, lock);
  const rule = s("rect", { x: T.x0, y: T.ruleY, width: RULE_W, height: T.ruleH, fill: C.yellow }, lock);
  const ruleRed = new Value(0);
  const scan = s("rect", { width: 4, fill: C.yellow }, lock);

  // tag (chip)
  const chipG = s("g", {}, cam);
  const chipBg = s("rect", { fill: C.red }, chipG);
  const chipY = s("rect", { fill: C.yellow }, chipG);
  const chipText = s("text", { "font-weight": 900, "letter-spacing": "0.14em", "font-family": uiFamily }, chipG);
  const chipW = (str: string, size: number) => mUi(str, 900, size) + str.length * 0.14 * size + (36 * size) / 22;
  const chip = {
    x: new Value(T.x0),
    y: new Value(T.top - 92),
    h: new Value(44),
    size: new Value(22),
    sweep: new Value(1),
    w: new Value(chipW("WELCOME · 欢迎使用", 22)),
    ink: true, // text colour: ink on yellow, paper on red
    inkQueue: [] as { at: number; ink: boolean }[],
  };
  const chipRoll = new Roll(chipText, "WELCOME · 欢迎使用", () => chip.y.get() + chip.h.get() / 2 + chip.size.get() * (8 / 22));

  // caption row: sub (left) + credit (right)
  const SUB = 15;
  const subTop = T.ruleY + T.ruleH + 22;
  const subBase = subTop + CAP * SUB;
  const subPos = { x: new Value(T.x0), y: new Value(subBase) };
  const sub = s("text", { "font-size": SUB, "font-weight": 700, fill: C.paper, "fill-opacity": 0.7, "letter-spacing": "0.46em", "font-family": uiFamily }, cam);
  const subRoll = new Roll(sub, "STUDENT REGISTRY MANAGEMENT SYSTEM", () => subPos.y.get() - CAP * SUB);
  const credit = s("text", { x: T.x1 - 76, y: subBase, "text-anchor": "end", "font-size": SUB, "font-weight": 600, fill: C.paper, "fill-opacity": 0.88, "letter-spacing": "0.1em", "font-family": uiFamily }, cam);
  const creditRoll = new Roll(credit, "presented by TianMeng", () => subTop);

  // seal (signature chop), same geometry as the intro's finished mark
  const chop = sealPlacement(DURATION, L);
  const sealG = s("g", {}, cam);
  const sl = L.seal;
  const half = (v: number) => v / 2;
  s("rect", { x: -half(sl.field), y: -half(sl.field), width: sl.field, height: sl.field, fill: C.red }, sealG);
  s(
    "path",
    {
      d: `M${-half(sl.outer)} ${-half(sl.outer)}h${sl.outer}v${sl.outer}h${-sl.outer}Z M${-half(sl.frameIn)} ${-half(sl.frameIn)}v${sl.frameIn}h${sl.frameIn}v${-sl.frameIn}Z`,
      fill: C.red,
      "fill-rule": "evenodd",
    },
    sealG,
  );
  for (const c of sl.chars)
    s("text", { x: c.dx, y: c.dy + CJK_MID * sl.charSize, "text-anchor": "middle", "font-size": sl.charSize, "font-weight": 900, fill: C.ink, "font-family": uiFamily }, sealG, c.ch);
  const seal = { x: new Value(chop.x), y: new Value(chop.y), size: new Value(chop.k * sl.outer), press: new Value(1) };

  // caret
  const caret = s("rect", { fill: C.yellow }, cam);
  const CUR_W = 18;
  const curTop = T.top + 0.06 * T.size;
  const car = { x: new Value(T.x1 + 26), y: new Value(curTop), w: new Value(CUR_W), h: new Value(T.base - curTop), vis: new Value(1) };
  let caretBlinkFrom = 0; // time the caret last moved/typed (solid for a beat after)
  let caretMode: "solid" | "blink" | "hidden" = "solid";

  // ---------- HUD (screen space, hud svg) - exact copy of the intro's frame actor at rest ----------
  const masks = s("g", { fill: C.void }, svgs.hud);
  s("rect", { x: -BLEED, y: -BLEED, width: W + BLEED * 2, height: BLEED + LB }, masks);
  s("rect", { x: -BLEED, y: H - LB, width: W + BLEED * 2, height: BLEED + LB }, masks);
  const hud = s("g", { "font-family": uiFamily }, svgs.hud);
  const ink = C.paper;
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
    s("line", { x1: 224, y1: 96, x2: 380, y2: 96, stroke: ink, "stroke-opacity": 0.5, "stroke-width": 1 }, g);
  };
  hudModule(false);
  hudModule(true);
  const label = (x: number, y: number, anchor: "start" | "end", size = 13, weight = 600, op = 0.82) =>
    s("text", { x, y, "text-anchor": anchor, "font-size": size, "font-weight": weight, fill: ink, "fill-opacity": op, "letter-spacing": "0.16em" }, hud);
  const brand = label(120, 136, "start");
  setText(brand, "学籍管理系统 · XUEJI REGISTRY");
  const seq = label(1800, 136, "end");
  const seqRoll = new Roll(seq, "SYSTEM READY · 系统就绪", () => 136);
  const tc = label(152, 990, "start", 13, 600, 0.82);
  s("rect", { x: 120, y: 980, width: 24, height: 13, fill: ink }, hud);
  s("text", { x: 132, y: 990.5, "text-anchor": "middle", "font-size": 9, "font-weight": 900, fill: C.ink, "letter-spacing": "0.05em" }, hud, "TC");
  const NT = SEGMENTS.length;
  const ticks = Array.from({ length: NT }, (_, i) => {
    const x = 1800 - (NT - i) * 40 + 6;
    s("rect", { x, y: 983, width: 34, height: 4, fill: ink, "fill-opacity": 0.22 }, hud);
    const fill = s("rect", { x, y: 983, width: 34, height: 4, fill: C.yellow }, hud);
    return { x, fill, k: new Value(1), color: C.yellow as string };
  });
  const seqNum = label(1800 - NT * 40 - 6, 990, "end", 13, 700, 0.82);
  const seqNumRoll = new Roll(seqNum, "05", () => 990);
  const side = (mirror: boolean) => {
    const g = s("g", { transform: mirror ? `translate(${W} 0) scale(-1 1)` : "" }, hud);
    s("line", { x1: 120, y1: 470, x2: 120, y2: 610, stroke: ink, "stroke-opacity": 0.35 }, g);
    const marks = s("g", {}, g);
    s("path", { d: "M132 452 h-12 v16 M132 628 h-12 v-16", fill: "none", stroke: ink, "stroke-width": 1.6 }, marks);
    s("rect", { x: 124, y: 532, width: 8, height: 8, fill: ink }, marks);
    s("rect", { x: 132, y: 540, width: 8, height: 8, fill: ink }, marks);
  };
  side(false);
  side(true);
  const tcBase = DURATION; // timecode keeps running from the intro's last frame
  let tcFrom = now();

  // ---------- big line ----------
  let big: Big[] = [];
  let bigSize = T.size;
  const bigTrack = 0.06;

  const newBig = (ch: string, x: number, risen: boolean): Big => {
    const el = s("text", { "text-anchor": "middle", "font-size": bigSize, fill: C.paper }, bigG, ch);
    return { ch, el, x: new Value(x), rise: new Value(risen ? 1 : 0), weight: new Value(risen ? 900 : 300), size: new Value(bigSize) };
  };
  // the intro's title, exactly where it was
  big = [..."学籍管理系统"].map((ch, i) => newBig(ch, T.x0 + T.word.xs[i], true));

  /** Centres of each char of `str` laid out from T.x0 at `size` (kerning kept, like layoutWord). */
  const layout = (str: string, size: number) => {
    const xs: number[] = [];
    let prev = 0;
    for (let i = 0; i < str.length; i++) {
      const w = mUi(str.slice(0, i + 1), 900, size);
      xs.push(T.x0 + prev + i * bigTrack * size + (w - prev) / 2);
      prev = w;
    }
    return { xs, width: prev + Math.max(0, str.length - 1) * bigTrack * size };
  };
  const fitSize = (str: string) => {
    const w = layout(str, T.size).width;
    return w > RULE_W - 60 ? (T.size * (RULE_W - 60)) / w : T.size;
  };

  /** Retire characters: sink into the rule (right to left), then remove. */
  const sinkAll = (list: Big[], delay: number, stagger: number, at = now()) => {
    list
      .filter((b) => b.dead === undefined)
      .reverse()
      .forEach((b, i) => {
        const d = delay + i * stagger;
        b.rise.to(0, 0.2, d, E.in, at);
        b.weight.to(300, 0.2, d, E.in, at);
        b.dead = at + d + 0.2;
      });
  };

  let liveText = "";
  /** Show `str` on the big line: chars that stay slide into place, new ones rise, removed ones sink. */
  const setBig = (str: string, opts: { stagger?: number; delay?: number; at?: number } = {}) => {
    const at = opts.at ?? now();
    const delay = opts.delay ?? 0;
    const stagger = opts.stagger ?? 0;
    const alive = big.filter((b) => b.dead === undefined);
    bigSize = fitSize(str);
    const { xs } = layout(str, bigSize);
    let keep = 0;
    while (keep < alive.length && keep < str.length && alive[keep].ch === str[keep]) keep++;
    sinkAll(alive.slice(keep), delay, 0.02, at);
    for (let i = 0; i < keep; i++) {
      alive[i].x.to(xs[i], 0.24, 0, E.out, at);
      alive[i].size.to(bigSize, 0.24, 0, E.out, at);
    }
    const fresh: Big[] = [];
    for (let i = keep; i < str.length; i++) {
      const b = newBig(str[i], xs[i], false);
      const d = delay + (i - keep) * stagger;
      b.rise.to(1, 0.34, d, E.out, at);
      b.weight.to(900, 0.42, d, E.out, at);
      fresh.push(b);
    }
    big = [...alive.slice(0, keep), ...fresh, ...big.filter((b) => b.dead !== undefined)];
    liveText = str;
    return { endX: str.length ? T.x0 + layout(str, bigSize).width : T.x0 };
  };

  // ---------- caret helpers ----------
  const caretAt = (x: number, dur = 0.16, delay = 0, at = now()) => {
    car.x.to(x, dur, delay, E.out, at);
    car.y.to(T.top + 0.06 * T.size + (T.size - bigSize) * 0.88, 0.2, delay, E.out, at);
    car.h.to(T.base - (T.top + 0.06 * T.size + (T.size - bigSize) * 0.88), 0.2, delay, E.out, at);
    caretBlinkFrom = at + delay + dur;
  };

  // ---------- status / scan ----------
  let status: SceneStatus = "idle";
  let scanFrom = 0;

  const setChipInk = (ink: boolean, at: number) => chip.inkQueue.push({ at, ink });

  // ---------- render ----------
  let onCam: ((k: number) => void) | null = null;
  let ghostRest: number | null = null; // set once the drift has been stopped for good

  const render = (t = now()) => {
    // camera
    const ck = camK.get(t);
    attr(cam, "transform", `translate(${CX} ${CY}) scale(${ck}) translate(${-CX} ${-CY})`);
    onCam?.(ck);

    // ghost: the intro's drift continues and decays (no dead stop)
    const tau = 1.4;
    const v0 = 140 / (DURATION - 16.2);
    const drift = ghostRest ?? -70 - v0 * tau * (1 - Math.exp(-Math.max(0, t - ghostT0) / tau));
    const gk = ghostK.get(t);
    show(ghost, gk > 0.002);
    if (gk > 0.002) attr(ghost, "transform", `translate(${drift} ${T.ruleY}) scale(1 ${gk}) translate(0 ${-T.ruleY})`);
    const rk = roleGhostK.get(t);
    show(roleGhost, rk > 0.002);
    if (rk > 0.002) attr(roleGhost, "transform", `translate(${RG.x} ${RG.y}) rotate(-90) scale(1 ${rk})`);

    // lockup placement
    const lk = lockK.get(t);
    const sx = lerp(1, S_CON, lk);
    const tx = lerp(0, CONSOLE.x - T.x0 * S_CON, lk);
    const ty = lerp(0, CONSOLE.ruleY - T.ruleY * S_CON, lk);
    attr(lock, "transform", lk === 0 ? "" : `translate(${tx} ${ty}) scale(${sx})`);
    attr(rule, "fill", mixColor(C.yellow, C.red, ruleRed.get(t)));

    // big chars
    const scanning = status === "verifying";
    const period = 0.95;
    const liveEnd = T.x0 + layout(liveText, bigSize).width;
    const sxScan = scanning ? lerp(T.x0 - 40, liveEnd + 40, E.soft(((t - scanFrom) % period) / period)) : -1e4;
    big = big.filter((b) => {
      if (b.dead !== undefined && t > b.dead + 0.05) {
        b.el.remove();
        return false;
      }
      return true;
    });
    for (const b of big) {
      const k = b.rise.get(t);
      show(b.el, k > 0.002);
      if (k <= 0.002) continue;
      let w = b.weight.get(t);
      if (scanning) w -= 560 * Math.exp(-(((b.x.get(t) - sxScan) / 70) ** 2));
      attr(b.el, "font-weight", Math.round(clamp(w, 100, 900)));
      attr(b.el, "font-size", b.size.get(t));
      attr(b.el, "transform", `translate(${b.x.get(t)} ${T.ruleY}) scale(1 ${k}) translate(0 ${T.base - T.ruleY})`);
    }
    show(scan, scanning);
    if (scanning) {
      attr(scan, "x", sxScan - 2);
      attr(scan, "y", T.top - 34);
      attr(scan, "height", T.ruleY - (T.top - 34));
    }

    // chip
    while (chip.inkQueue.length && chip.inkQueue[0].at <= t) chip.ink = chip.inkQueue.shift()!.ink;
    const cx = chip.x.get(t);
    const cy = chip.y.get(t);
    const ch = chip.h.get(t);
    const cw = chip.w.get(t);
    const csz = chip.size.get(t);
    for (const r of [chipBg, chipY]) {
      attr(r, "x", cx);
      attr(r, "y", cy);
      attr(r, "height", ch);
    }
    attr(chipBg, "width", cw);
    attr(chipY, "width", cw * chip.sweep.get(t));
    attr(chipText, "x", cx + (18 * csz) / 22);
    attr(chipText, "y", cy + ch / 2 + csz * (8 / 22));
    attr(chipText, "font-size", csz);
    attr(chipText, "fill", chip.ink ? C.ink : C.paper);
    chipRoll.render(t);

    // caption
    attr(sub, "x", subPos.x.get(t));
    attr(sub, "y", subPos.y.get(t));
    subRoll.render(t);
    creditRoll.render(t);

    // seal
    const ssz = seal.size.get(t) * seal.press.get(t);
    attr(sealG, "transform", `translate(${seal.x.get(t)} ${seal.y.get(t)}) scale(${ssz / sl.outer})`);

    // caret: travels in lock space during the gate, in camera space otherwise
    const cv = car.vis.get(t);
    let on = cv > 0.5 && caretMode !== "hidden";
    if (on && caretMode === "blink" && t > caretBlinkFrom + 0.48) on = Math.floor((t - caretBlinkFrom - 0.48) / 0.48) % 2 === 1;
    show(caret, on);
    const px = car.x.get(t);
    const py = car.y.get(t);
    const pw = car.w.get(t);
    const ph = car.h.get(t);
    const ck2 = caretInLock.get(t);
    // blend between lock-space placement and absolute placement (for the drop to the command line)
    attr(caret, "x", lerp(px, tx + px * sx, ck2));
    attr(caret, "y", lerp(py, ty + py * sx, ck2));
    attr(caret, "width", lerp(pw, pw * sx, ck2));
    attr(caret, "height", lerp(ph, ph * sx, ck2));

    // HUD
    seqRoll.render(t);
    seqNumRoll.render(t);
    setText(tc, timecode(tcBase + (t - tcFrom)));
    for (const tk of ticks) {
      attr(tk.fill, "width", 34 * tk.k.get(t));
      attr(tk.fill, "fill", tk.color);
    }
  };
  // the caret is drawn in lock space while the lockup moves (it rides with the big line)
  const caretInLock = new Value(0);

  // ------------------------------------------------------------ choreography

  /** Intro end -> identity gate. The caret walks back across the title, erasing it into the rule. */
  const handoff = (reduced: boolean) => {
    const at = now();
    ghostT0 = at;
    tcFrom = at;
    if (reduced) {
      for (const b of big) {
        b.rise.set(0);
        b.dead = at;
      }
      car.x.set(T.x0);
      chip.w.set(chipW("IDENTITY · 身份验证", 22));
      chipRoll.roll("IDENTITY · 身份验证", 0, at - 1);
      subRoll.roll("ENTER STUDENT OR STAFF ID · 输入学号或教师号", 0, at - 1);
      creditRoll.roll("PRESS ENTER · 回车确认", 0, at - 1);
      seqRoll.roll("AWAITING ID · 等待身份", 0, at - 1);
      seqNumRoll.roll("00", 0, at - 1);
      for (const tk of ticks) tk.k.set(0);
      caretMode = "blink";
      caretBlinkFrom = at;
      return;
    }
    const D = T_HANDOFF.caret;
    const curX = T.x1 + 26;
    car.x.to(T.x0, D, 0, E.inOut, at);
    // each title char sinks the moment the caret's leading edge passes its right side
    const passTime = (x: number) => {
      for (let i = 0; i <= 60; i++) {
        const k = i / 60;
        if (lerp(curX, T.x0, E.inOut(k)) <= x) return k * D;
      }
      return D;
    };
    big.forEach((b, i) => {
      const right = b.x.get(at) + T.word.adv[i] / 2;
      const d = passTime(right);
      b.rise.to(0, 0.22, d, E.in, at);
      b.weight.to(300, 0.22, d, E.in, at);
      b.dead = at + d + 0.22;
    });
    seqRoll.roll("AWAITING ID · 等待身份", 0.05, at);
    chipRoll.roll("IDENTITY · 身份验证", 0.12, at);
    chip.w.to(chipW("IDENTITY · 身份验证", 22), 0.36, 0.12, E.inOut, at);
    subRoll.roll("ENTER STUDENT OR STAFF ID · 输入学号或教师号", 0.22, at);
    creditRoll.roll("PRESS ENTER · 回车确认", 0.3, at);
    ticks
      .slice()
      .reverse()
      .forEach((tk, i) => tk.k.to(0, 0.16, 0.24 + i * 0.05, E.in, at));
    seqNumRoll.roll("00", 0.3, at);
    caretBlinkFrom = at + D;
    caretMode = "blink";
  };

  /** Mirror of the gate input. */
  const type = (value: string) => {
    if (status === "verifying") return;
    const { endX } = setBig(value);
    caretAt(endX + (value ? 26 : 0));
    if (status === "denied") setStatus("idle");
  };

  const setStatus = (next: SceneStatus, detail?: { label?: string; sub?: string }) => {
    const at = now();
    const prev = status;
    status = next;
    if (next === "verifying") {
      scanFrom = at;
      chip.sweep.to(0, 0.28, 0, E.inOut, at);
      setChipInk(false, at + 0.13);
      chipRoll.roll("VERIFYING · 身份核验", 0, at);
      chip.w.to(chipW("VERIFYING · 身份核验", 22), 0.3, 0, E.inOut, at);
      seqRoll.roll("VERIFYING · 身份核验", 0, at);
      caretMode = "hidden";
    } else if (next === "denied") {
      const lab = detail?.label ?? "DENIED · 身份无效";
      chipRoll.roll(lab, 0, at);
      chip.w.to(chipW(lab, 22), 0.3, 0, E.inOut, at);
      ruleRed.to(1, 0.24, 0, E.inOut, at);
      if (detail?.sub) subRoll.roll(detail.sub, 0.06, at);
      seqRoll.roll(lab, 0, at);
      caretMode = "blink";
      caretBlinkFrom = at;
    } else if (next === "idle" && (prev === "denied" || prev === "verifying")) {
      chip.sweep.to(1, 0.28, 0, E.inOut, at);
      setChipInk(true, at + 0.13);
      chipRoll.roll("IDENTITY · 身份验证", 0, at);
      chip.w.to(chipW("IDENTITY · 身份验证", 22), 0.3, 0, E.inOut, at);
      ruleRed.to(0, 0.24, 0, E.inOut, at);
      subRoll.roll("ENTER STUDENT OR STAFF ID · 输入学号或教师号", 0.06, at);
      seqRoll.roll("AWAITING ID · 等待身份", 0, at);
      caretMode = "blink";
      caretBlinkFrom = at;
    }
  };

  /** Gate -> console: the ID resolves into the person's name, then the lockup docks top-left. */
  const confirm = (who: { role: Role; display: string; ref_id: string; dept: string | null }, reduced: boolean) => {
    const at = now() - (reduced ? 10 : 0);
    const C0 = T_CONFIRM;
    status = "confirmed";
    const role = ROLE[who.role];
    // tag turns yellow: authorised
    chip.sweep.to(1, 0.3, C0.sweep, E.inOut, at);
    setChipInk(true, at + 0.13);
    chipRoll.roll("ID CONFIRMED · 身份已确认", 0, at);
    chip.w.to(chipW("ID CONFIRMED · 身份已确认", 22), 0.3, 0, E.inOut, at);
    seqRoll.roll("ID CONFIRMED · 身份已确认", 0, at);
    // the seal presses once
    seal.press.to(0.9, 0.09, 0.02, E.in, at);
    seal.press.to(1, 0.22, 0.11, E.out, at);
    // ID -> name
    caretMode = "hidden";
    sinkAll(big, C0.idOut, 0.016, at);
    const name = who.display || who.ref_id;
    bigSize = fitSize(name);
    const { xs, width } = layout(name, bigSize);
    name.split("").forEach((ch, i) => {
      const b = newBig(ch, xs[i], false);
      b.rise.to(1, 0.36, C0.nameIn + i * 0.06, E.out, at);
      b.weight.to(900, 0.44, C0.nameIn + i * 0.06, E.out, at);
      big.push(b);
    });
    liveText = name;
    subRoll.roll(`${role.en} · ${role.zh} · ${who.ref_id}`, 0.2, at);
    creditRoll.hide(0.18, at);

    // dock
    const M = C0.move;
    const MD = C0.moveDur;
    camK.to(1, MD, M, E.inOut, at);
    lockK.to(1, MD, M, E.inOut, at);
    chip.x.to(CONSOLE.x, MD, M, E.inOut, at);
    chip.y.to(CONSOLE.ruleY - (T.ruleY - T.base) * S_CON - 0.88 * CONSOLE.nameSize - 22 - 34, MD, M, E.inOut, at);
    chip.h.to(34, MD, M, E.inOut, at);
    chip.size.to(16, MD, M, E.inOut, at);
    const roleLab = `${role.en} · ${role.zh}`;
    chipRoll.roll(roleLab, M + 0.3, at);
    chip.w.to(chipW(roleLab, 16), 0.3, M + 0.3, E.inOut, at);
    const conSubTop = CONSOLE.ruleY + T.ruleH * S_CON + 20;
    subPos.x.to(CONSOLE.x, MD, M, E.inOut, at);
    subPos.y.to(conSubTop + CAP * SUB, MD, M, E.inOut, at);
    subRoll.roll(`${who.ref_id}${who.dept ? ` · ${who.dept}` : " · 全校"}`, M + 0.34, at);
    const sealSize = 46;
    seal.x.to(CONSOLE.x + CONSOLE.colW - sealSize / 2, MD, M, E.inOut, at);
    seal.y.to(CONSOLE.ruleY + T.ruleH * S_CON + 16 + sealSize / 2, MD, M, E.inOut, at);
    seal.size.to(sealSize, MD, M, E.inOut, at);
    // caret: from the end of the name down to the command line
    const endX = T.x0 + width + 26;
    car.x.set(endX);
    car.y.set(T.top + 0.06 * T.size + (T.size - bigSize) * 0.88);
    car.h.set(T.base - car.y.get(at));
    car.w.set(CUR_W);
    const cmd = CONSOLE.cmd;
    // express the console target in lock space so the blend lands exactly there
    caretInLock.set(1);
    const lockToCon = (v: number, axis: "x" | "y") =>
      axis === "x" ? (v - (CONSOLE.x - T.x0 * S_CON)) / S_CON : (v - (CONSOLE.ruleY - T.ruleY * S_CON)) / S_CON;
    caretMode = "solid";
    car.vis.set(0);
    car.vis.to(1, 0.01, M - 0.02, E.linear, at);
    car.x.to(lockToCon(cmd.caretX, "x"), MD, M + 0.08, E.inOut, at);
    car.y.to(lockToCon(cmd.caretY, "y"), MD, M + 0.08, E.inOut, at);
    car.w.to(cmd.caretW / S_CON, MD, M + 0.08, E.inOut, at);
    car.h.to(cmd.caretH / S_CON, MD, M + 0.08, E.inOut, at);
    // ghost: the system's name gives way to the role
    ghostK.to(0, 0.26, M, E.in, at);
    setText(roleGhost, role.en);
    roleGhostK.to(1, 0.5, M + 0.5, E.out, at);
    // ticks: the session's sequence starts empty
    seqNumRoll.roll("00", 0, at);
  };

  /** The console takes the caret over (its own HTML caret sits exactly where this one landed). */
  const releaseCaret = () => {
    caretMode = "hidden";
  };

  /** Console -> gate (switch identity). */
  const toGate = (reduced: boolean) => {
    const at = now() - (reduced ? 10 : 0);
    status = "idle";
    caretMode = "hidden";
    sinkAll(big, 0, 0.03, at);
    liveText = "";
    bigSize = T.size;
    const M = 0.22;
    const MD = 0.66;
    camK.to(CAM_END, MD, M, E.inOut, at);
    lockK.to(0, MD, M, E.inOut, at);
    chip.x.to(T.x0, MD, M, E.inOut, at);
    chip.y.to(T.top - 92, MD, M, E.inOut, at);
    chip.h.to(44, MD, M, E.inOut, at);
    chip.size.to(22, MD, M, E.inOut, at);
    chipRoll.roll("IDENTITY · 身份验证", M + 0.2, at);
    chip.w.to(chipW("IDENTITY · 身份验证", 22), 0.3, M + 0.2, E.inOut, at);
    subPos.x.to(T.x0, MD, M, E.inOut, at);
    subPos.y.to(subBase, MD, M, E.inOut, at);
    subRoll.roll("ENTER STUDENT OR STAFF ID · 输入学号或教师号", M + 0.3, at);
    creditRoll.roll("PRESS ENTER · 回车确认", M + 0.5, at);
    seal.x.to(chop.x, MD, M, E.inOut, at);
    seal.y.to(chop.y, MD, M, E.inOut, at);
    seal.size.to(chop.k * sl.outer, MD, M, E.inOut, at);
    seqRoll.roll("AWAITING ID · 等待身份", 0, at);
    seqNumRoll.roll("00", 0, at);
    for (const tk of ticks) tk.k.to(0, 0.2, 0, E.in, at);
    roleGhostK.to(0, 0.24, 0, E.in, at);
    ghostRest = -70 - (140 / (DURATION - 16.2)) * 1.4; // where the decayed drift came to rest
    ghostK.to(1, 0.4, M + 0.4, E.out, at);
    caretInLock.set(0);
    car.vis.set(1);
    car.x.to(T.x0, MD, M, E.inOut, at);
    car.y.to(curTop, MD, M, E.inOut, at);
    car.w.to(CUR_W, MD, M, E.inOut, at);
    car.h.to(T.base - curTop, MD, M, E.inOut, at);
    setTimeout(() => {
      caretMode = "blink";
      caretBlinkFrom = now();
    }, (M + MD) * 1000);
    ruleRed.to(0, 0.2, 0, E.inOut, at);
    chip.sweep.to(1, 0.2, 0, E.inOut, at);
    setChipInk(true, at);
  };

  /**
   * Console -> backstage: the name sinks into the rule and the caption and role collapse; the chip and
   * the rule stay. Returns where they are (frame px): the backstage layer starts exactly there.
   */
  const toBackstage = (reduced: boolean) => {
    const at = now() - (reduced ? 10 : 0);
    caretMode = "hidden";
    sinkAll(big, 0, 0.025, at);
    liveText = "";
    subRoll.hide(0.04, at);
    roleGhostK.to(0, 0.24, 0, E.in, at);
    seal.size.to(0, 0.2, 0.1, E.in, at);
    chipRoll.roll("BACKSTAGE · 后台", 0.12, at);
    chip.w.to(chipW("BACKSTAGE · 后台", chip.size.target), 0.3, 0.12, E.inOut, at);
    seqRoll.roll("BACKSTAGE · 后台", 0, at);
    const ruleH = T.ruleH * S_CON;
    return {
      chip: { x: chip.x.target, y: chip.y.target, h: chip.h.target, size: chip.size.target, text: "BACKSTAGE · 后台" },
      rule: { x: CONSOLE.x, y: CONSOLE.ruleY, w: CONSOLE.colW, h: ruleH },
      label: "BACKSTAGE · 后台",
      tc: tcBase + (now() - tcFrom),
    };
  };

  /**
   * Backstage -> console: the backstage layer has just put the chip (with the role label) and the rule
   * back where they were, and is removed; from here the name rises again and the caption returns.
   */
  const fromBackstage = (who: { role: Role; display: string; ref_id: string; dept: string | null }, reduced: boolean) => {
    const at = now() - (reduced ? 10 : 0);
    const role = ROLE[who.role];
    const roleLab = `${role.en} · ${role.zh}`;
    chipRoll.set(roleLab);
    chip.w.set(chipW(roleLab, chip.size.target));
    seqRoll.set("CONSOLE · 主界面");
    const name = who.display || who.ref_id;
    bigSize = fitSize(name);
    const { xs } = layout(name, bigSize);
    name.split("").forEach((ch, i) => {
      const b = newBig(ch, xs[i], false);
      b.rise.to(1, 0.36, 0.08 + i * 0.06, E.out, at);
      b.weight.to(900, 0.44, 0.08 + i * 0.06, E.out, at);
      big.push(b);
    });
    liveText = name;
    subRoll.roll(`${who.ref_id}${who.dept ? ` · ${who.dept}` : " · 全校"}`, 0.2, at);
    seal.size.to(46, 0.3, 0.3, E.out, at);
    roleGhostK.to(1, 0.5, 0.3, E.out, at);
  };

  // ------------------------------------------------------------ HUD controls for the console

  /** Gate caption (what is being typed is recognised as...). Ignored outside the idle gate. */
  const caption = (str: string) => {
    if (status === "idle" && lockK.target === 0) subRoll.roll(str);
  };
  const hudLabel = (str: string) => seqRoll.roll(str);
  const hudCount = (str: string) => seqNumRoll.roll(str);
  /** Bottom-right ticks: last five questions. `fill` 0..1, colour by outcome. */
  const hudTicks = (list: { fill: number; color: string }[]) => {
    const at = now();
    ticks.forEach((tk, i) => {
      const item = list[i];
      const target = item ? item.fill : 0;
      if (Math.abs(tk.k.target - target) > 1e-3) tk.k.to(target, item && item.fill < 1 ? 1.2 : 0.3, 0, E.out, at);
      if (item) tk.color = item.color;
    });
  };

  return {
    layout: { T, L, RULE_W, S_CON, subBase, chop, CUR_W },
    render,
    handoff,
    type,
    setStatus,
    confirm,
    toGate,
    toBackstage,
    fromBackstage,
    releaseCaret,
    caption,
    hudLabel,
    hudCount,
    hudTicks,
    measureUi: mUi,
    /** Mirror the camera scale onto HTML layered in the same frame. */
    onCamera: (fn: ((k: number) => void) | null) => {
      onCam = fn;
    },
    get status() {
      return status;
    },
  };
}

export type Scene = ReturnType<typeof createScene>;
