"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IntroAudio, renderMixWav } from "./engine/audio";
import { DURATION } from "./engine/constants";
import { createEngine, type Engine } from "./engine/engine";

type Phase = "boot" | "gate" | "play" | "done";

declare global {
  interface Window {
    /** Deterministic frame access for rendering/review: open the page with ?capture. */
    __intro?: { seek: (t: number) => void; duration: number; mix: (parts?: { voice?: boolean; sfx?: boolean }) => Promise<string> };
  }
}

type Props = {
  /** Resolved font-family of the intro typeface (from next/font). */
  fontFamily: string;
  /** Called once when the sequence ends or is skipped. */
  onFinish?: () => void;
};

/**
 * Full-screen opening sequence for 学籍管理系统.
 * The first click authorises playback (browsers only allow sound after a gesture),
 * after which picture and sound run on one audio clock.
 */
export default function Intro({ fontFamily, onFinish }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const audioRef = useRef<IntroAudio | null>(null);
  const clockRef = useRef<() => number>(() => 0);
  const phaseRef = useRef<Phase>("boot");
  const doneAtRef = useRef(0);
  const finishRef = useRef(onFinish);
  const [phase, setPhase] = useState<Phase>("boot");
  const [capture, setCapture] = useState(false);

  useEffect(() => {
    finishRef.current = onFinish;
  }, [onFinish]);

  const go = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
    if (p === "done") doneAtRef.current = performance.now();
  }, []);

  const finish = useCallback(() => {
    audioRef.current?.stop(0.6);
    go("done");
    finishRef.current?.();
  }, [go]);

  const start = useCallback(() => {
    const p = phaseRef.current;
    if (p !== "gate" && p !== "done") return;
    const audio = audioRef.current;
    audio?.unlock();
    const run = () => {
      if (audio?.start()) {
        clockRef.current = () => audio.now();
      } else {
        const t0 = performance.now();
        clockRef.current = () => (performance.now() - t0) / 1000;
      }
      go("play");
    };
    const ctx = audio?.ctx;
    if (ctx && ctx.state !== "running") ctx.resume().then(run, run);
    else run();
  }, [go]);

  useEffect(() => {
    const root = rootRef.current!;
    const host = stageRef.current!;
    const params = new URLSearchParams(window.location.search);
    const isCapture = params.has("capture");
    let raf = 0;
    let disposed = false;

    const audio = isCapture ? null : new IntroAudio();
    audioRef.current = audio;

    const onResize = () => {
      const k = engineRef.current?.resize() ?? 1;
      root.style.setProperty("--k", String(k));
    };

    const boot = async () => {
      await Promise.all([
        document.fonts.load(`900 100px ${fontFamily}`, "学籍ACCESS"),
        document.fonts.load(`100 100px ${fontFamily}`, "学籍ACCESS"),
        audio?.ready,
      ]);
      await document.fonts.ready;
      if (disposed) return;

      const engine = createEngine(host, fontFamily);
      engineRef.current = engine;
      onResize();

      if (isCapture) {
        setCapture(true);
        engine.render(Number(params.get("t") ?? 0));
        window.__intro = { seek: (t) => engine.render(t), duration: DURATION, mix: (parts) => renderMixWav(48000, parts) };
        return;
      }

      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      go(reduced ? "done" : "gate");
      const gateAt = performance.now();

      const tick = () => {
        const p = phaseRef.current;
        if (p === "gate") {
          engine.render(-(performance.now() - gateAt) / 1000 - 1e-4);
        } else if (p === "play") {
          const t = clockRef.current();
          if (t >= DURATION) finish();
          else engine.render(Math.max(0, t));
        } else if (p === "done") {
          engine.render(DURATION + (performance.now() - doneAtRef.current) / 1000);
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    void boot();

    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current === "gate" && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        start();
      } else if (phaseRef.current === "play" && e.key === "Escape") {
        finish();
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      audio?.dispose();
      engineRef.current?.destroy();
      engineRef.current = null;
      delete window.__intro;
    };
  }, [fontFamily, go, start, finish]);

  return (
    <div
      ref={rootRef}
      className="intro-root"
      data-phase={phase}
      role={phase === "gate" ? "button" : undefined}
      tabIndex={phase === "gate" ? 0 : -1}
      aria-label="学籍管理系统 — 点击开始开场动画"
      onClick={phase === "gate" ? start : undefined}
    >
      <div ref={stageRef} className="intro-stage" aria-hidden="true" />
      <div className="intro-screen" aria-hidden="true" />
      {!capture && (phase === "play" || phase === "done") && (
        <div className="intro-controls">
          {phase === "play" ? (
            <button type="button" className="intro-btn" onClick={finish}>
              跳过 SKIP
            </button>
          ) : (
            <button type="button" className="intro-btn" onClick={start}>
              重播 REPLAY
            </button>
          )}
        </div>
      )}
      <p className="intro-sr" aria-live="polite">
        {phase === "play" ? "开场动画播放中，按 Esc 跳过" : phase === "done" ? "学籍管理系统，presented by TianMeng" : ""}
      </p>
    </div>
  );
}
