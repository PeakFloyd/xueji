"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { timecode } from "../xueji/anim";
import { H, LB, W } from "./model";
import { Roll } from "./parts";

// The same frame as the main interface (src/components/xueji/scene.ts, HUD section), drawn at the same
// coordinates: arriving from the console, nothing in the surround moves.

const INK = "#F2F0EA";
const BLEED = 4000;
const NT = 5;

const d = (s: number): CSSProperties => ({ ["--d" as string]: s.toFixed(3) });

function Module({ mirror, build }: { mirror: boolean; build: boolean }) {
  return (
    <g transform={mirror ? `translate(${W} 0) scale(-1 1)` : undefined}>
      <g className={build ? "hud-in" : undefined} style={d(0.05)}>
        <rect x={120} y={93} width={22} height={6} fill={INK} />
        <g fill="none" stroke={INK} strokeWidth={1.6}>
          <circle cx={164} cy={96} r={8} />
          <ellipse cx={164} cy={96} rx={3.4} ry={8} />
          <line x1={156} y1={96} x2={172} y2={96} />
        </g>
        {[0, 1, 2].map((i) => (
          <polyline key={i} points={`${186 + i * 9},91 ${191 + i * 9},96 ${186 + i * 9},101`} fill="none" stroke={INK} strokeWidth={2} />
        ))}
      </g>
      <line className={build ? "hud-line" : undefined} style={d(0.15)} x1={224} y1={96} x2={380} y2={96} stroke={INK} strokeOpacity={0.5} strokeWidth={1} />
    </g>
  );
}

function Side({ mirror, build }: { mirror: boolean; build: boolean }) {
  return (
    <g transform={mirror ? `translate(${W} 0) scale(-1 1)` : undefined} className={build ? "hud-in" : undefined} style={d(0.3)}>
      <line x1={120} y1={470} x2={120} y2={610} stroke={INK} strokeOpacity={0.35} />
      <path d="M132 452 h-12 v16 M132 628 h-12 v-16" fill="none" stroke={INK} strokeWidth={1.6} />
      <rect x={124} y={532} width={8} height={8} fill={INK} />
      <rect x={132} y={540} width={8} height={8} fill={INK} />
    </g>
  );
}

/** Background strip and the outline word set vertically in the left margin (as the console's role). */
export function HudBack({ ghost }: { ghost: boolean }) {
  return (
    <svg className="xj-layer" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" textRendering="geometricPrecision">
      <rect x={-BLEED} y={LB} width={W + BLEED * 2} height={H - LB * 2} fill="#121212" />
      <g transform="translate(108 900) rotate(-90)">
        <text className="ad-ghost" data-on={ghost ? "" : undefined} x={0} y={0} fontSize={148} fontWeight={900} fill="none" stroke={INK} strokeOpacity={0.16} strokeWidth={1.5} letterSpacing="0.04em">
          SCHEMA
        </text>
      </g>
    </svg>
  );
}

type Props = {
  /** Draw the frame in (direct visit); arriving from the console it is already there. */
  build: boolean;
  label: string;
  count: string;
  /** Ticks filled, 0..5. */
  ticks: number;
  /** Timecode at mount (continues the console's clock when handed over). */
  tcFrom: number;
};

export default function Hud({ build, label, count, ticks, tcFrom }: Props) {
  const tcRef = useRef<SVGTextElement>(null);

  useEffect(() => {
    const t0 = performance.now() / 1000;
    let raf = 0;
    let last = "";
    const step = () => {
      const s = timecode(tcFrom + performance.now() / 1000 - t0);
      if (s !== last && tcRef.current) tcRef.current.textContent = last = s;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [tcFrom]);

  const label13 = { fontSize: 13, fontWeight: 600, fill: INK, fillOpacity: 0.82, letterSpacing: "0.16em" } as const;

  return (
    <svg className="xj-layer xj-hud" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" textRendering="geometricPrecision">
      <g fill="#000">
        <rect x={-BLEED} y={-BLEED} width={W + BLEED * 2} height={BLEED + LB} />
        <rect x={-BLEED} y={H - LB} width={W + BLEED * 2} height={BLEED + LB} />
      </g>
      <Module mirror={false} build={build} />
      <Module mirror build={build} />
      <text className={build ? "hud-in" : undefined} style={{ ...label13, ...d(0.2) }} x={120} y={136}>
        学籍管理系统 · XUEJI REGISTRY
      </text>
      <Roll as="svg" text={label} x={1800} y={136} anchor="end" style={label13} />
      <g className={build ? "hud-in" : undefined} style={d(0.25)}>
        <rect x={120} y={980} width={24} height={13} fill={INK} />
        <text x={132} y={990.5} textAnchor="middle" fontSize={9} fontWeight={900} fill="#0B0B0B" letterSpacing="0.05em">
          TC
        </text>
        <text ref={tcRef} x={152} y={990} {...{ fontSize: 13, fontWeight: 600, fill: INK, fillOpacity: 0.82, letterSpacing: "0.16em" }}>
          {timecode(tcFrom)}
        </text>
      </g>
      {Array.from({ length: NT }, (_, i) => {
        const x = 1800 - (NT - i) * 40 + 6;
        return (
          <g key={i}>
            <rect x={x} y={983} width={34} height={4} fill={INK} fillOpacity={0.22} />
            <rect className="hud-tick" data-on={i < ticks ? "" : undefined} style={d(0.06 * i)} x={x} y={983} width={34} height={4} fill="#FFD21F" />
          </g>
        );
      })}
      <Roll as="svg" text={count} x={1800 - NT * 40 - 6} y={990} anchor="end" style={{ ...label13, fontWeight: 700 }} />
      <Side mirror={false} build={build} />
      <Side mirror build={build} />
    </svg>
  );
}
