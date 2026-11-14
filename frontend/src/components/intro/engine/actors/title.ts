import { C, CX, DURATION } from "../constants";
import { attr, s, show } from "../dom";
import { E, bump, ep, lerp, prog } from "../ease";
import { CAP } from "../layout";
import type { ActorFactory } from "../types";

/** Segment 5 - end title. Rises out of the rule (the same verb that opened the piece). */
export const title: ActorFactory = (stage, L) => {
  const T = L.end;
  const g = s("g", { "font-family": stage.font }, stage.cam);

  // outline echo behind the title (the reference frames' ghost type), rises from the rule and drifts
  const GHOST = 500;
  const ghostBase = T.base - 0.38 * T.size + (CAP * GHOST) / 2;
  const ghost = s(
    "text",
    {
      x: CX,
      y: ghostBase,
      "text-anchor": "middle",
      "font-size": GHOST,
      "font-weight": 900,
      fill: "none",
      stroke: C.paper,
      "stroke-opacity": 0.13,
      "stroke-width": 1.5,
      "letter-spacing": "0.02em",
    },
    g,
    "XUEJI",
  );

  const chars = [..."学籍管理系统"].map((ch, i) => ({
    el: s("text", { "text-anchor": "middle", "font-size": T.size, fill: C.paper }, g, ch),
    x: T.x0 + T.word.xs[i],
    at: 16.12 + i * 0.07,
  }));

  const SUB = 15;
  const subTop = T.ruleY + T.ruleH + 22;
  const subBase = subTop + CAP * SUB;
  const sub = s(
    "text",
    { x: T.x0, y: subBase, "font-size": SUB, "font-weight": 700, fill: C.paper, "fill-opacity": 0.7, "letter-spacing": "0.46em" },
    g,
    "STUDENT REGISTRY MANAGEMENT SYSTEM",
  );
  const credit = s(
    "text",
    { x: T.x1 - 76, y: subBase, "text-anchor": "end", "font-size": SUB, "font-weight": 600, fill: C.paper, "fill-opacity": 0.88, "letter-spacing": "0.1em" },
    g,
    "presented by TianMeng",
  );

  // the scan that closes the piece, and the cursor it leaves behind
  const scan = s("rect", { width: 4, fill: C.yellow }, g);
  const cursor = s("rect", { fill: C.yellow }, g);
  const SA = 17.95;
  const SB = 18.65;
  const CUR_W = 18;
  const curX = T.x1 + 26;
  const curTop = T.top + 0.06 * T.size;

  const hang = (el: SVGElement, y: number, k: number) => {
    show(el, k > 0.002);
    if (k > 0.002) attr(el, "transform", `translate(0 ${y}) scale(1 ${k}) translate(0 ${-y})`);
  };

  return (t) => {
    const on = t >= 15.9;
    show(g, on);
    if (!on) return;

    const sx = lerp(T.x0 - 30, curX + CUR_W / 2, ep(t, SA, SB, E.soft));
    const scanning = t > SA - 0.1 && t < SB + 0.1;

    for (const c of chars) {
      const k = E.out(prog(t, c.at, c.at + 0.46));
      show(c.el, k > 0.002);
      if (k <= 0.002) continue;
      let w = lerp(300, 900, E.out(prog(t, c.at, c.at + 0.52)));
      if (scanning) w -= 560 * bump(c.x - sx, 70);
      attr(c.el, "font-weight", Math.round(w));
      // grows out of the rule, not out of its own baseline
      attr(c.el, "transform", `translate(${c.x} ${T.ruleY}) scale(1 ${k}) translate(0 ${T.base - T.ruleY})`);
    }

    const gk = E.out(prog(t, 16.2, 16.8));
    show(ghost, gk > 0.002);
    if (gk > 0.002) {
      const drift = lerp(70, -70, prog(t, 16.2, DURATION));
      attr(ghost, "transform", `translate(${drift} ${T.ruleY}) scale(1 ${gk}) translate(0 ${-T.ruleY})`);
    }

    hang(sub, subTop, E.out(prog(t, 16.6, 16.96)));
    hang(credit, subTop, E.out(prog(t, 16.98, 17.34)));

    // scan rises from the rule, sweeps, and lands as the input cursor
    const up = ep(t, SA - 0.12, SA + 0.02, E.out);
    const land = ep(t, SB - 0.02, SB + 0.22, E.inOut);
    const sTop = T.top - 34;
    const h = (T.ruleY - sTop) * up;
    show(scan, up > 0.001 && land < 1);
    attr(scan, "x", lerp(sx - 2, curX, land));
    attr(scan, "width", lerp(4, CUR_W, land));
    attr(scan, "y", lerp(T.ruleY - h, curTop, land));
    attr(scan, "height", lerp(h, T.base - curTop, land));

    // blinks from the moment it lands (on/off every 0.48s, so the frame never holds)
    const landed = SB + 0.22;
    const blink = t < landed + 0.48 ? true : Math.floor((t - landed - 0.48) / 0.48) % 2 === 1;
    show(cursor, land >= 1 && blink);
    attr(cursor, "x", curX);
    attr(cursor, "y", curTop);
    attr(cursor, "width", CUR_W);
    attr(cursor, "height", T.base - curTop);
  };
};
