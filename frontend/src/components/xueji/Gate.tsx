"use client";

import { useEffect, useRef, useState } from "react";
import { CX, CY } from "../intro/engine/constants";
import { DEMO, idKind } from "./abilities";
import { T_HANDOFF, type Scene } from "./scene";

type Props = {
  scene: Scene;
  /** Arriving from the intro (elements wait for the hand-off choreography). */
  intro: boolean;
  busy: boolean;
  leaving: boolean;
  online: boolean | null;
  onSubmit: (id: string) => void;
};

const IDLE_CAPTION = "ENTER STUDENT OR STAFF ID · 输入学号或教师号";

/**
 * The identity gate's HTML: an invisible input that drives the giant type drawn by the scene,
 * and the demo identities. Lives inside the scene's camera so it stays registered with the SVG.
 */
export default function Gate({ scene, intro, busy, leaving, online, onSubmit }: Props) {
  const camRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const typing = useRef<number[]>([]);
  const wasBusy = useRef(busy);
  const { T, subBase } = scene.layout;
  const base = intro ? T_HANDOFF.demo : 0.2;

  useEffect(() => {
    const cam = camRef.current!;
    scene.onCamera((k) => {
      cam.style.transform = `translate(${CX}px, ${CY}px) scale(${k}) translate(${-CX}px, ${-CY}px)`;
    });
    const focus = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), (intro ? T_HANDOFF.ready : 0.1) * 1000);
    const timers = typing.current;
    return () => {
      scene.onCamera(null);
      clearTimeout(focus);
      timers.forEach(clearTimeout);
    };
  }, [scene, intro]);

  useEffect(() => {
    if (wasBusy.current && !busy) inputRef.current?.focus({ preventScroll: true });
    wasBusy.current = busy;
  }, [busy]);

  const update = (raw: string) => {
    const v = raw.toUpperCase().replace(/\s+/g, "").slice(0, 20);
    setValue(v);
    scene.type(v);
    const kind = idKind(v);
    scene.caption(kind ? `识别为${kind.zh} · ${kind.en}` : IDLE_CAPTION);
  };

  const demo = (id: string) => {
    if (busy) return;
    typing.current.forEach(clearTimeout);
    update("");
    inputRef.current?.focus({ preventScroll: true });
    // the ID types itself into the line, then is submitted
    typing.current = [...id].map((_, i) => window.setTimeout(() => update(id.slice(0, i + 1)), 140 + i * 62));
    typing.current.push(window.setTimeout(() => onSubmit(id), 140 + id.length * 62 + 260));
  };

  return (
    <div className="xj-cam" ref={camRef} onPointerDown={(e) => e.target === e.currentTarget && inputRef.current?.focus()}>
      <label className="xj-sr" htmlFor="xj-id">
        学号或教师号
      </label>
      <input
        id="xj-id"
        ref={inputRef}
        className="xj-gate-input"
        style={{ left: T.x0, top: T.top - 30, width: T.x1 - T.x0, height: T.ruleY - T.top + 30 }}
        value={value}
        disabled={busy}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        inputMode="text"
        maxLength={20}
        aria-describedby="xj-gate-hint"
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) onSubmit(value);
        }}
      />
      <p id="xj-gate-hint" className="xj-sr" aria-live="polite">
        {online === false ? "学籍服务未连接" : "输入学号或教师号后按回车确认，或选择演示身份"}
      </p>

      <div className={`xj-demo${leaving ? " is-out" : ""}`} style={{ left: T.x0, top: subBase + 34 }}>
        <span className="xj-demo-label xj-rise" style={{ ["--d" as string]: base }}>
          DEMO · 演示身份
        </span>
        {DEMO.map((d, i) => (
          <button
            key={d.id}
            type="button"
            className="xj-demo-btn xj-rise"
            style={{ ["--d" as string]: base + 0.07 * (i + 1) }}
            disabled={busy}
            onClick={() => demo(d.id)}
          >
            <span className="xj-demo-id">{d.id}</span>
            <span className="xj-demo-role">
              {d.zh} <i>{d.en}</i>
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="xj-seal-hit"
        aria-label="确认身份（回车）"
        disabled={busy || !value}
        style={{ left: scene.layout.chop.x - 32, top: scene.layout.chop.y - 32 }}
        onClick={() => onSubmit(value)}
      />
    </div>
  );
}
