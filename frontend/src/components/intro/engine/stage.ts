import { C, H, W } from "./constants";
import { h, s } from "./dom";

/**
 * Layer stack (bottom -> top), all in one 1920x1080 coordinate space that is fitted to the viewport:
 *   bg    full-bleed field + letterbox
 *   main  2D scene (inside the camera group)
 *   l3d   CSS 3D scene (seal block + floor), also under the camera
 *   hud   screen-space frame, never moves with the camera
 */
export type Stage = {
  frame: HTMLDivElement;
  bg: SVGSVGElement;
  main: SVGSVGElement;
  cam: SVGGElement;
  defs: SVGDefsElement;
  l3d: HTMLDivElement;
  cam3d: HTMLDivElement;
  hud: SVGSVGElement;
  font: string;
  /** Advance width of `str` at the given weight/size (kerning included). */
  measure: (str: string, weight: number, size: number) => number;
};

export function createStage(root: HTMLElement, font: string): Stage {
  const frame = h("div", { "data-intro-frame": "" }, root);
  Object.assign(frame.style, {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: `${W}px`,
    height: `${H}px`,
    transformOrigin: "0 0",
    fontFamily: font,
  });

  const svgLayer = (name: string) => {
    const el = s("svg", {
      viewBox: `0 0 ${W} ${H}`,
      width: W,
      height: H,
      "data-layer": name,
      "text-rendering": "geometricPrecision",
    });
    Object.assign(el.style, { position: "absolute", inset: "0", overflow: "visible", fontFamily: font });
    frame.appendChild(el);
    return el;
  };

  const bg = svgLayer("bg");
  const main = svgLayer("main");
  const defs = s("defs", {}, main);
  const cam = s("g", {}, main);

  const l3d = h("div", { "data-layer": "3d" }, frame);
  Object.assign(l3d.style, {
    position: "absolute",
    inset: "0",
    perspective: "2200px",
    perspectiveOrigin: "50% 50%",
    pointerEvents: "none",
  });
  const cam3d = h("div", {}, l3d);
  Object.assign(cam3d.style, {
    position: "absolute",
    inset: "0",
    transformStyle: "preserve-3d",
    transformOrigin: "50% 50%",
  });

  const hud = svgLayer("hud");

  const cvs = document.createElement("canvas");
  const ctx = cvs.getContext("2d")!;
  const mcache = new Map<string, number>();
  const measure = (str: string, weight: number, size: number) => {
    const key = `${weight}|${size}|${str}`;
    let v = mcache.get(key);
    if (v === undefined) {
      ctx.font = `${weight} ${size}px ${font}`;
      v = ctx.measureText(str).width;
      mcache.set(key, v);
    }
    return v;
  };

  bg.style.background = "transparent";
  root.style.background = C.void;

  return { frame, bg, main, cam, defs, l3d, cam3d, hud, font, measure };
}

/** Fit the 1920x1080 frame inside the viewport (contain); full-bleed layers draw beyond it. */
export function fitStage(stage: Stage, vw: number, vh: number) {
  const k = Math.min(vw / W, vh / H);
  stage.frame.style.transform = `scale(${k}) translate(-50%, -50%)`;
  return k;
}

/** Per-letter layout of a word: slot centres and advances, kerning preserved. */
export function layoutWord(stage: Stage, word: string, weight: number, size: number, tracking = 0) {
  const xs: number[] = [];
  const adv: number[] = [];
  let prev = 0;
  for (let i = 0; i < word.length; i++) {
    const w = stage.measure(word.slice(0, i + 1), weight, size);
    const a = w - prev;
    xs.push(prev + i * tracking * size + a / 2);
    adv.push(a);
    prev = w;
  }
  const width = prev + (word.length - 1) * tracking * size;
  return { xs, adv, width };
}
