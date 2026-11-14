// Timing primitives. Everything in the intro is a pure function of time t (seconds).
// No overshoot / bounce / elastic curves by design.

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Normalised progress of t through [a, b], clamped to 0..1. */
export const prog = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

/** CSS-style cubic-bezier easing (x1, x2 in 0..1). Solved with Newton + bisection fallback. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 6; i++) {
      const err = sx(u) - x;
      const d = dx(u);
      if (Math.abs(err) < 1e-5) return sy(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    let lo = 0;
    let hi = 1;
    u = x;
    for (let i = 0; i < 24; i++) {
      const v = sx(u);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return sy(u);
  };
}

// The house curves. One family, used everywhere, so the piece moves with one accent.
export const E = {
  /** Arrivals: fast out of the gate, long precise settle. */
  out: bezier(0.16, 1, 0.3, 1),
  /** Departures: gather, then leave quickly. */
  in: bezier(0.7, 0, 0.84, 0),
  /** Moves between two rest states. */
  inOut: bezier(0.76, 0, 0.24, 1),
  /** Gentler in-out for long camera-ish moves. */
  soft: bezier(0.45, 0, 0.25, 1),
  /** Hard snap: used for morph and impacts. */
  snap: bezier(0.85, 0, 0.12, 1),
  linear: (x: number) => x,
};

/** Eased progress through [a, b]. */
export const ep = (t: number, a: number, b: number, f: (x: number) => number = E.inOut) => f(prog(t, a, b));

/** Gaussian bump centred at 0, width w. */
export const bump = (d: number, w: number) => Math.exp(-(d * d) / (w * w));

/** Deterministic PRNG (mulberry32) so every render of frame t is identical. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let r = Math.imul(a ^ (a >>> 15), 1 | a);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// --- colour (OKLab interpolation keeps light-to-light transitions clean) ---

type RGB = [number, number, number];
const hex2rgb = (h: string): RGB => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toLin = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLin = (c: number) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(clamp(v) * 255);
};
function rgb2lab([r, g, b]: RGB): RGB {
  const R = toLin(r);
  const G = toLin(g);
  const B = toLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function lab2rgb([L, a, b]: RGB): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}
export function mixColor(a: string, b: string, k: number) {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const A = rgb2lab(hex2rgb(a));
  const B = rgb2lab(hex2rgb(b));
  const [r, g, bl] = lab2rgb([lerp(A[0], B[0], k), lerp(A[1], B[1], k), lerp(A[2], B[2], k)]);
  return `rgb(${r},${g},${bl})`;
}
/** Darken a hex colour toward black by factor k (0 = unchanged, 1 = black). Used for 3D face lighting. */
export function shade(h: string, k: number) {
  const [r, g, b] = hex2rgb(h);
  const f = 1 - clamp(k);
  return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
}
