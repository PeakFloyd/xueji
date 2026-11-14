"use client";

import { useEffect, useRef } from "react";
import { LOCK } from "./Lockup";
import { d } from "./parts";

// The backstage's identity check: an invisible input drives the giant line drawn by the lockup (as on
// the main gate). Only the administrator gets through; any other identity is refused here and its
// session is closed again.

export type GateStatus = "idle" | "verifying" | "denied" | "offline" | "granted";

type Props = {
  value: string;
  status: GateStatus;
  out: boolean;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  /** Over the console: go back to it (otherwise a link to the main page). */
  onBack?: () => void;
};

const G = LOCK.gate;

export default function Gate({ value, status, out, onChange, onSubmit, onBack }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const busy = status === "verifying" || status === "granted";

  useEffect(() => {
    const id = setTimeout(() => input.current?.focus({ preventScroll: true }), 300);
    const list = timers.current;
    return () => {
      clearTimeout(id);
      list.forEach(clearTimeout);
    };
  }, []);
  useEffect(() => {
    if (!busy) input.current?.focus({ preventScroll: true });
  }, [busy]);

  const demo = () => {
    if (busy) return;
    timers.current.forEach(clearTimeout);
    const id = "T001";
    onChange("");
    input.current?.focus({ preventScroll: true });
    timers.current = [...id].map((_, i) => window.setTimeout(() => onChange(id.slice(0, i + 1)), 140 + i * 70));
    timers.current.push(window.setTimeout(() => onSubmit(id), 140 + id.length * 70 + 260));
  };

  return (
    <div className={`ad-gate${out ? " is-out" : ""}`} onPointerDown={(e) => e.target === e.currentTarget && input.current?.focus()}>
      <div className="ad-gate-ghost" aria-hidden="true">
        后台
      </div>
      <label className="xj-sr" htmlFor="ad-id">
        管理员教师号
      </label>
      <input
        id="ad-id"
        ref={input}
        className="xj-gate-input"
        style={{ left: 200, top: G.ruleY - G.size * 1.1, width: G.ruleW, height: G.size * 1.1 }}
        value={value}
        disabled={busy}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={20}
        aria-describedby="ad-gate-hint"
        onChange={(e) => onChange(e.target.value.toUpperCase().replace(/\s+/g, "").slice(0, 20))}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) onSubmit(value);
        }}
      />
      <p id="ad-gate-hint" className="xj-sr" aria-live="polite">
        {status === "denied" ? "该身份没有后台权限" : status === "offline" ? "学籍服务未连接" : "输入管理员教师号后按回车确认"}
      </p>
      <div className="ad-gate-demo" style={{ left: 200, top: G.ruleY + 82 }}>
        <span className="xj-demo-label xj-rise" style={d(0.3)}>
          DEMO · 演示身份
        </span>
        <button type="button" className="xj-demo-btn xj-rise" style={d(0.37)} disabled={busy} onClick={demo}>
          <span className="xj-demo-id">T001</span>
          <span className="xj-demo-role">
            管理员 <i>ADMIN</i>
          </span>
        </button>
        {onBack ? (
          <button type="button" className="ad-gate-back xj-rise" style={d(0.44)} onClick={onBack}>
            ← 返回主界面 <i>CONSOLE</i>
          </button>
        ) : (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- full load: the console starts clean
          <a className="ad-gate-back xj-rise" style={d(0.44)} href="/?skip">
            ← 返回主界面 <i>CONSOLE</i>
          </a>
        )}
      </div>
      <button type="button" className="ad-gate-go" aria-label="确认身份（回车）" disabled={busy || !value} style={{ left: 200 + G.ruleW - 64, top: G.ruleY + 22 }} onClick={() => onSubmit(value)}>
        <span>ENTER</span>
        <i />
      </button>
    </div>
  );
}
