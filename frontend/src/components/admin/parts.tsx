"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { E } from "../xueji/anim";

// Small motion parts shared by the backstage. Same verbs as the rest of the system: a label changes
// by collapsing onto its line and rising again; content leaves by sinking into its rule.

export const d = (s: number, extra?: CSSProperties): CSSProperties => ({ ["--d" as string]: s.toFixed(3), ...extra });
export const v = (vars: Record<string, string | number>, extra?: CSSProperties): CSSProperties => {
  const out: Record<string, string | number> = { ...extra };
  for (const [k, val] of Object.entries(vars)) out[`--${k}`] = typeof val === "number" ? +val.toFixed(3) : val;
  return out as CSSProperties;
};

export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A label that changes by collapsing (0.13 s) and rising with the new text (0.26 s). */
export function Roll({
  text,
  as = "span",
  x = 0,
  y = 0,
  anchor = "start",
  style,
  className,
}: {
  text: string;
  as?: "span" | "svg";
  x?: number;
  y?: number;
  anchor?: "start" | "end" | "middle";
  style?: CSSProperties;
  className?: string;
}) {
  const [shown, setShown] = useState(text);
  // a new text first collapses the old one, then replaces it
  const phase = text === shown ? "in" : "out";
  useEffect(() => {
    if (text === shown) return;
    const id = setTimeout(() => setShown(text), reduced() ? 0 : 130);
    return () => clearTimeout(id);
  }, [text, shown]);
  const cls = `roll${className ? ` ${className}` : ""}`;
  if (as === "svg") {
    return (
      <text className={cls} data-p={phase} x={x} y={y} textAnchor={anchor} style={style}>
        {shown}
      </text>
    );
  }
  return (
    <span className={cls} data-p={phase} style={style}>
      {shown}
    </span>
  );
}

/**
 * Keeps the previous value on screen with `out` set while it collapses, then shows the next one.
 * Only a change of `id` swaps; the live layer always renders the current `value`.
 * `children(value, out, delay)`: delay (s) before the incoming content may start building.
 */
export function Swap<T>({
  value,
  id,
  outMs = 260,
  overlap = 0,
  children,
}: {
  value: T | null;
  id: string;
  outMs?: number;
  /** Start the incoming layer this many ms before the outgoing one is gone. */
  overlap?: number;
  children: (value: T, out: boolean, delay: number) => ReactNode;
}) {
  // Every layer gets a serial number at birth and keeps it (as its key) until it is removed, so the
  // outgoing layer is the same React child that was live: its DOM, counters and finished animations
  // survive the exit. Derived during render (React's "previous render" pattern): no commit ever shows
  // the old layer unmounted. Callers pass a stable `value` (memoised) - it is compared by identity.
  type St = { id: string; n: number; delay: number; last: T | null; gone: { n: number; value: T }[] };
  const [st, setSt] = useState<St>(() => ({ id, n: 0, delay: 0, last: value, gone: [] }));
  let cur = st;
  if (st.id !== id) {
    const r = reduced();
    cur = {
      id,
      n: st.n + 1,
      delay: r || st.last == null ? 0 : Math.max(0, outMs - overlap) / 1000,
      last: value,
      gone: st.last != null ? [...st.gone, { n: st.n, value: st.last }] : st.gone,
    };
    setSt(cur);
  } else if (st.last !== value) {
    cur = { ...st, last: value };
    setSt(cur);
  }
  // outgoing layers are dropped once they have collapsed
  useEffect(() => {
    if (!st.gone.length) return;
    const ns = st.gone.map((g) => g.n);
    const t = window.setTimeout(() => setSt((s) => ({ ...s, gone: s.gone.filter((g) => !ns.includes(g.n)) })), reduced() ? 0 : outMs + 30);
    return () => clearTimeout(t);
  }, [st.gone, outMs]);
  const layers = cur.gone.map((g) => <FragmentKey key={g.n}>{children(g.value, true, 0)}</FragmentKey>);
  if (value != null) layers.push(<FragmentKey key={cur.n}>{children(value, false, cur.delay)}</FragmentKey>);
  return <>{layers}</>;
}

function FragmentKey({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** A number that counts to its value (from 0 the first time, then from the last value). */
export function Count({ value, dur = 0.8, delay = 0, decimals }: { value: number; dur?: number; delay?: number; decimals?: number }) {
  const places = decimals ?? (String(value).split(".")[1] ?? "").length;
  const still = reduced();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (still) return;
    const start = from.current;
    const t0 = performance.now() / 1000 + delay;
    let raf = 0;
    const step = () => {
      const k = Math.min(1, Math.max(0, (performance.now() / 1000 - t0) / dur));
      const cur = start + (value - start) * E.out(k);
      from.current = cur;
      setShown(cur);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, dur, delay, still]);
  if (still) return <>{value.toFixed(places)}</>;
  return <>{shown.toFixed(places)}</>;
}

/** Characters that each rise out of the line below them. */
export function Chars({ text, delay = 0, stagger = 0.04, className = "ch" }: { text: string; delay?: number; stagger?: number; className?: string }) {
  return (
    <>
      {[...text].map((ch, i) => (
        <span key={i} className={className} style={d(delay + i * stagger)}>
          {ch === " " ? " " : ch}
        </span>
      ))}
    </>
  );
}

export function Head({ en, zh, right, delay = 0 }: { en: string; zh: string; right?: ReactNode; delay?: number }) {
  return (
    <div className="ad-head">
      <span className="xj-f-label xj-rise" style={d(delay)}>
        {en} · {zh}
      </span>
      <span className="xj-f-rule xj-grow" style={d(delay + 0.05)} />
      {right != null && (
        <span className="xj-f-meta xj-rise" style={d(delay + 0.1)}>
          {right}
        </span>
      )}
    </div>
  );
}
