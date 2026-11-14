// Motion primitives for the interface. Same rules as the intro: one family of curves, no overshoot,
// nothing ever cross-fades - things rise out of a line, collapse back into it, or travel.
import { E, clamp, lerp, mixColor } from "../intro/engine/ease";

export { E, clamp, lerp, mixColor };
export type Ease = (x: number) => number;

/** The same curves as CSS strings, for CSS/WAAPI animations of HTML parts. */
export const CSS_EASE = {
  out: "cubic-bezier(0.16, 1, 0.3, 1)",
  in: "cubic-bezier(0.7, 0, 0.84, 0)",
  inOut: "cubic-bezier(0.76, 0, 0.24, 1)",
  soft: "cubic-bezier(0.45, 0, 0.25, 1)",
  snap: "cubic-bezier(0.85, 0, 0.12, 1)",
};

/** Seconds since page load, the single clock every animated value reads. */
export const now = () => performance.now() / 1000;

type Seg = { t0: number; dur: number; to: number; ease: Ease; from?: number };

/**
 * A number animated over time. `to()` queues a move that starts at `now + delay` from whatever the value
 * is at that moment, so retargeting mid-flight is always continuous.
 */
export class Value {
  private segs: Seg[] = [];
  constructor(private base: number) {}

  set(v: number) {
    this.base = v;
    this.segs = [];
    return this;
  }

  to(v: number, dur: number, delay = 0, ease: Ease = E.inOut, at = now()) {
    const t0 = at + delay;
    // drop moves scheduled after this one: the newest instruction wins from t0 on
    this.segs = this.segs.filter((s) => s.t0 < t0);
    this.segs.push({ t0, dur: Math.max(1e-4, dur), to: v, ease });
    return this;
  }

  /** Value at time t (defaults to now). */
  get(t = now()): number {
    let v = this.base;
    // a later move supersedes earlier ones from its own start time
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      if (t < s.t0) break;
      if (s.from === undefined) s.from = this.at(s.t0, i);
      v = lerp(s.from, s.to, s.ease(clamp((t - s.t0) / s.dur)));
    }
    // fold a fully finished list into the base so it stays short
    const last = this.segs[this.segs.length - 1];
    if (last && t >= last.t0 + last.dur) {
      this.base = last.to;
      this.segs = [];
    }
    return v;
  }

  /** Final value once every queued move has finished. */
  get target() {
    return this.segs.length ? this.segs[this.segs.length - 1].to : this.base;
  }

  get busy() {
    return this.segs.length > 0;
  }

  // value at time t evaluating only the first n segments
  private at(t: number, n: number) {
    let v = this.base;
    for (let i = 0; i < n; i++) {
      const s = this.segs[i];
      if (t < s.t0) break;
      const from = s.from ?? v;
      v = lerp(from, s.to, s.ease(clamp((t - s.t0) / s.dur)));
    }
    return v;
  }
}

/** Respect the system's reduced-motion setting: every duration collapses to (almost) zero. */
export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const pad = (n: number, l = 2) => String(Math.floor(n)).padStart(l, "0");

/** Broadcast timecode HH:MM:SS:FF at 25 fps. */
export const timecode = (sec: number) => {
  const s = Math.max(0, sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(s % 60)}:${pad((s % 1) * 25)}`;
};
