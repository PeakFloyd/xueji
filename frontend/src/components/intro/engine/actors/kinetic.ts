import { BEAT, C, CX, CY } from "../constants";
import { attr, s, show } from "../dom";
import { E, bump, ep, lerp, prog } from "../ease";
import { CAP } from "../layout";
import { layoutWord } from "../stage";
import type { ActorFactory } from "../types";

/**
 * Segment 1 - kinetic type.
 * Gate cursor -> red baseline. Each spoken word rises out of the baseline; a yellow scan thins the
 * letters as it passes and picks out I and D; everything else collapses back into the line while
 * I and D travel to become the "ID" of segment 2.
 */
export const kinetic: ActorFactory = (stage, L) => {
  const g = s("g", { "font-family": stage.font }, stage.cam);

  // ---------- gate ----------
  const gate = s("g", {}, g);
  const gateTitle = s(
    "text",
    { x: CX, y: 640, "text-anchor": "middle", "font-size": 20, "font-weight": 800, fill: C.paper, "letter-spacing": "0.42em" },
    gate,
    "学籍管理系统",
  );
  const gateHint = s(
    "text",
    { x: CX, y: 676, "text-anchor": "middle", "font-size": 12, "font-weight": 600, fill: C.paper, "fill-opacity": 0.55, "letter-spacing": "0.26em" },
    gate,
    "CLICK ANYWHERE TO AUTHORIZE · 点击任意位置授权进入",
  );

  // ---------- words ----------
  const TR = -0.02;
  const STACK_W = 1240;
  const GAP = 30;
  const WORDS = [
    { w: "ACCESS", zh: "访问", beat: BEAT.access, color: C.paper, stagger: 0.03 },
    { w: "PERMISSION", zh: "权限", beat: BEAT.permission, color: C.paper, stagger: 0.022 },
    { w: "REQUIRED", zh: "必需", beat: BEAT.required, color: C.red, stagger: 0.026 },
  ];
  const lays = WORDS.map((w) => layoutWord(stage, w.w, 900, 100, TR));
  const ks = lays.map((l) => STACK_W / l.width);
  const caps = ks.map((k) => CAP * 100 * k);
  const total = caps[0] + caps[1] + caps[2] + GAP * 2;
  const top = CY - total / 2;
  const base = [top + caps[0], top + caps[0] + GAP + caps[1], top + total];
  const x0 = CX - STACK_W / 2;

  const GIANT_W = 1480;
  const kG = GIANT_W / lays[0].width;
  const baseG = CY + (CAP * 100 * kG) / 2;
  const xG = CX - GIANT_W / 2;
  const LINE_GAP = 30;
  // the Q of REQUIRED has a tail below the baseline: the line sits under it
  const Q_DROP = 0.24 * 100 * ks[2] + 14;
  const LINE_H = 7;

  const letters = WORDS.flatMap((wd, wi) =>
    [...wd.w].map((ch, li) => ({
      wi,
      li,
      ch,
      el: s("text", { "text-anchor": "middle", "font-size": 100, fill: wd.color }, g, ch),
      start: wd.beat - 0.05 + li * wd.stagger,
    })),
  );
  const I_IDX = letters.findIndex((l) => l.wi === 2 && l.ch === "I");
  const D_IDX = letters.findIndex((l) => l.wi === 2 && l.ch === "D");

  // margin notes: index + meaning, hung from each line's cap height in the left gutter
  const notes = WORDS.map((wd, wi) => {
    const top = base[wi] - caps[wi];
    const gN = s("g", {}, g);
    s("text", { x: x0 - 30, y: top + 13, "text-anchor": "end", "font-size": 13, "font-weight": 800, fill: C.paper, "fill-opacity": 0.5, "letter-spacing": "0.2em" }, gN, `0${wi + 1}`);
    s("text", { x: x0 - 30, y: top + 46, "text-anchor": "end", "font-size": 24, "font-weight": 900, fill: wi === 2 ? C.red : C.paper }, gN, wd.zh);
    return { el: gN, top, at: wd.beat + 0.12 };
  });

  // ---------- baseline + scan ----------
  const line = s("rect", { fill: C.red }, g);
  const scan = s("rect", { width: 4, fill: C.yellow }, g);
  const tag = s("g", {}, g);
  s("rect", { x: 0, y: 0, width: 60, height: 20, fill: C.yellow }, tag);
  s("text", { x: 30, y: 14.5, "text-anchor": "middle", "font-size": 11, "font-weight": 900, fill: C.ink, "letter-spacing": "0.14em" }, tag, "SCAN");

  const SCAN_A = 2.4;
  const SCAN_B = 3.12;
  const scanX = (t: number) => lerp(x0 - 50, x0 + STACK_W + 50, ep(t, SCAN_A, SCAN_B, E.soft));

  // "ID" lockup (shared with the morph actor).
  const idX = (i: number) => L.id.x + L.id.k * L.id.word.xs[i];

  /** Placement of word wi at time t: origin x, baseline y, scale. */
  const place = (wi: number, t: number) => {
    if (wi === 0) {
      const k = ep(t, 0.98, 1.3, E.inOut);
      return { x: lerp(xG, x0, k), y: lerp(baseG, base[0], k), k: lerp(kG, ks[0], k) };
    }
    return { x: x0, y: base[wi], k: ks[wi] };
  };

  const lineState = (t: number) => {
    // cursor -> giant baseline -> under PERMISSION -> under REQUIRED -> retract
    const k0 = ep(t, 0.02, 0.5, E.out);
    let cx = CX;
    let y = lerp(CY, baseG + LINE_GAP, k0);
    let w = lerp(18, GIANT_W, k0);
    let hgt = lerp(30, LINE_H, k0);
    const k1 = ep(t, 0.98, 1.22, E.inOut);
    y = lerp(y, base[1] + LINE_GAP, k1);
    w = lerp(w, STACK_W, k1);
    const k2 = ep(t, 1.64, 1.88, E.inOut);
    y = lerp(y, base[2] + Q_DROP, k2);
    const k3 = ep(t, 3.2, 3.52, E.in);
    w = w * (1 - k3);
    cx = CX;
    if (t < 0) {
      y = CY;
      w = 18;
      hgt = 30;
    }
    return { cx, y, w, h: hgt };
  };

  return (t) => {
    // gate: cursor blink while waiting, prompt collapses into its baseline on start
    const waiting = t < 0;
    const blinkOn = !waiting || Math.floor(-t / 0.53) % 2 === 0;
    const gk = waiting ? 1 : 1 - ep(t, 0, 0.22, E.in);
    show(gate, gk > 0.001);
    attr(gateTitle, "transform", `translate(0 640) scale(1 ${Math.max(gk, 0.001)}) translate(0 -640)`);
    attr(gateHint, "transform", `translate(0 676) scale(1 ${Math.max(gk, 0.001)}) translate(0 -676)`);

    const ln = lineState(t);
    show(line, blinkOn && ln.w > 0.5);
    attr(line, "x", ln.cx - ln.w / 2);
    attr(line, "y", ln.y - ln.h / 2);
    attr(line, "width", ln.w);
    attr(line, "height", ln.h);

    // scan line rises out of the red baseline, sweeps, sinks back
    const scanUp = ep(t, SCAN_A - 0.14, SCAN_A + 0.02, E.out) * (1 - ep(t, SCAN_B, SCAN_B + 0.12, E.in));
    const sx = scanX(t);
    const sTop = top - 46;
    const sBot = base[2] + Q_DROP;
    const sH = (sBot - sTop) * scanUp;
    show(scan, sH > 1);
    attr(scan, "x", sx - 2);
    attr(scan, "y", sBot - sH);
    attr(scan, "height", Math.max(0, sH));
    show(tag, scanUp > 0.98);
    attr(tag, "transform", `translate(${sx + 2} ${sTop})`);

    const scanning = t >= SCAN_A - 0.1 && t <= SCAN_B + 0.1;

    for (const [i, n] of notes.entries()) {
      // notes for line 1 wait until ACCESS has settled into the stack
      const at = i === 0 ? Math.max(n.at, 1.26) : n.at;
      const k = E.out(prog(t, at, at + 0.3)) * (1 - ep(t, 3.14, 3.36, E.in));
      show(n.el, k > 0.002);
      if (k > 0.002) attr(n.el, "transform", `translate(0 ${n.top}) scale(1 ${k}) translate(0 ${-n.top})`);
    }

    for (let i = 0; i < letters.length; i++) {
      const l = letters[i];
      const p = place(l.wi, t);
      let ax = p.x + p.k * lays[l.wi].xs[l.li];
      let ay = p.y;
      let k = p.k;
      let sy = E.out(prog(t, l.start, l.start + 0.36));
      let wgt = lerp(250, 900, E.out(prog(t, l.start, l.start + 0.44)));
      if (scanning) wgt -= 660 * bump(ax - sx, 54);

      const isID = i === I_IDX || i === D_IDX;
      if (isID) {
        // identified by the scan: turns white as the line crosses it
        const crossed = t >= SCAN_A && sx >= ax;
        attr(l.el, "fill", crossed || t > SCAN_B ? C.paper : C.red);
        const [a, b] = i === I_IDX ? [3.4, BEAT.id - 0.04] : [3.56, BEAT.idD - 0.04];
        const f = ep(t, a, b, E.inOut);
        const tx = idX(i === I_IDX ? 0 : 1);
        ax = lerp(ax, tx, f);
        ay = lerp(ay, L.id.base, f);
        k = lerp(k, L.id.k, f);
        if (t >= 4.92) sy = 0; // the morph actor takes over with identical outlines
      } else {
        const c = 3.16 + i * 0.009;
        sy *= 1 - ep(t, c, c + 0.26, E.in);
      }

      const visible = sy > 0.002;
      show(l.el, visible);
      if (!visible) continue;
      attr(l.el, "font-weight", Math.round(wgt));
      attr(l.el, "transform", `translate(${ax} ${ay}) scale(${k} ${k * sy})`);
    }
  };
};
