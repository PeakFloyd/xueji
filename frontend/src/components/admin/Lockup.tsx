"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Roll, Swap, d, v } from "./parts";

// The backstage's protagonist, persistent from the gate to the last object: tag chip, big line, yellow
// rule, caption and stamp. Every state places the same elements somewhere else; the big line changes by
// sinking into the rule and rising again once the rule has arrived.

export type Tone = "yellow" | "red" | "paper";

export type LockupState = {
  chip: { text: string; tone: Tone; x: number; y: number; h: number; size: number; hidden?: boolean };
  big: { id: string; text: string; size: number; live?: boolean; caret?: boolean; scanning?: boolean; delay?: number };
  rule: { x: number; y: number; w: number; h: number; tone: "yellow" | "red"; busy?: boolean; hidden?: boolean };
  caption: { text: string; y: number };
  seal?: string | null;
};

/** Positions shared with the rest of the page. */
export const LOCK = {
  gate: { ruleY: 624, ruleW: 900, ruleH: 6, size: 168, chipY: 408 },
  map: { ruleY: 280, ruleW: 520, ruleH: 4, size: 64, chipY: 172 },
  detail: { ruleY: 330, ruleW: 560, ruleH: 4, size: 88, chipY: 172 },
};

const ASCII = /^[\x20-\x7e]*$/;

function Big({ text, size, ruleY, x, live, caret, scanning, out, delay }: {
  text: string; size: number; ruleY: number; x: number; live?: boolean; caret?: boolean; scanning?: boolean; out: boolean; delay: number;
}) {
  // ink bottom ~0.15 em above the rule; Latin sits on its baseline, a little lower than CJK ink
  const top = ruleY - (ASCII.test(text) ? 1.07 : 1.14) * size;
  const n = [...text].length;
  return (
    <div
      className={`ad-big${out ? " is-out" : ""}${scanning ? " is-scan" : ""}`}
      style={v({ n: Math.max(1, n) }, { left: x, top, fontSize: size, height: size * 1.2 })}
      aria-hidden="true"
    >
      {[...text].map((ch, i) => (
        <span
          key={live ? i : `${i}${ch}`}
          className="ch"
          style={d(out ? (n - 1 - i) * 0.018 : live ? 0 : delay + i * 0.05, { ["--i" as string]: i })}
        >
          {ch}
        </span>
      ))}
      {caret && !out && <span className="ad-caret" style={{ height: size * 0.74, width: Math.max(10, size * 0.1) }} />}
    </div>
  );
}

export default function Lockup({ s }: { s: LockupState }) {
  const { chip, big, rule, caption } = s;
  const measure = useRef<HTMLSpanElement>(null);
  const [chipW, setChipW] = useState(0);
  const [settled, setSettled] = useState(false);
  // the big line keeps the rule it was set on (an outgoing line sinks where it stood)
  const bigV = useMemo(() => ({ ...big, ruleY: rule.y, x: rule.x }), [big, rule.y, rule.x]);
  useLayoutEffect(() => {
    if (measure.current) setChipW(measure.current.offsetWidth);
  }, [chip.text, chip.size]);
  // transitions only from the second frame on: the first placement is where the chip already is
  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setSettled(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="ad-lockup">
      {/* chip */}
      <div
        className="ad-chip"
        data-tone={chip.tone}
        data-hidden={chip.hidden ? "" : undefined}
        data-settled={settled ? "" : undefined}
        style={{ transform: `translate(${chip.x}px, ${chip.y}px)`, height: chip.h, fontSize: chip.size, width: chipW }}
      >
        <Roll text={chip.text} className="ad-chip-text" />
      </div>
      <span ref={measure} className="ad-chip-measure" style={{ fontSize: chip.size }} aria-hidden="true">
        {chip.text}
      </span>

      {/* big line */}
      <Swap value={bigV} id={big.id} outMs={300}>
        {(b, out, delay) => (
          <Big
            text={b.text}
            size={b.size}
            ruleY={b.ruleY}
            x={b.x}
            live={b.live}
            caret={b.caret}
            scanning={b.scanning}
            out={out}
            delay={delay + (b.delay ?? 0)}
          />
        )}
      </Swap>

      {/* rule */}
      <div
        className="ad-rule"
        data-tone={rule.tone}
        data-busy={rule.busy ? "" : undefined}
        data-hidden={rule.hidden ? "" : undefined}
        style={{ transform: `translate(${rule.x}px, ${rule.y}px)`, width: rule.w, height: rule.h }}
      />

      {/* caption */}
      <div className="ad-caption" style={{ transform: `translate(${rule.x}px, ${caption.y}px)` }}>
        <Roll text={caption.text} />
      </div>

      {/* stamp */}
      <Swap value={s.seal ?? null} id={s.seal ?? ""} outMs={200}>
        {(text, out, delay) => (
          <div
            className={`ad-seal${out ? " is-out" : ""}`}
            style={d(delay + 0.55, { left: rule.x + rule.w - 52, top: rule.y + rule.h + 14 })}
            aria-hidden="true"
          >
            {[...text].slice(0, 4).map((ch, i) => (
              <span key={i}>{ch}</span>
            ))}
          </div>
        )}
      </Swap>
    </div>
  );
}
