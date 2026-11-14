"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { C } from "../intro/engine/constants";
import { COMMANDS, ROLE, briefing, type Command } from "./abilities";
import { now, pad } from "./anim";
import { chat, confirmWrite } from "./api";
import { CONSOLE, T_CONFIRM, type Scene } from "./scene";
import Stage, { STATUS, frameRect, statusOf, type Fly } from "./Stage";
import type { Entry, Identity } from "./types";

const d = (s: number): CSSProperties => ({ ["--d" as string]: s.toFixed(3) });

type Props = {
  scene: Scene;
  identity: Identity;
  /** Still docking: the scene owns the caret until this turns true. */
  live: boolean;
  leaving: boolean;
  onExit: () => void;
  onExpired: () => void;
  /** Admin only: open the backstage over the console. */
  onBackstage?: () => void;
  /** The backstage is open (or opening): everything collapses, keys are ignored. */
  away?: boolean;
};

const TONE_COLOR = { yellow: C.yellow, red: C.red, paper: C.paper } as const;
const CMD_FONT = 26;

export default function Console({ scene, identity, live, leaving, onExit, onExpired, onBackstage, away = false }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [view, setView] = useState(-1);
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [caretX, setCaretX] = useState(0);
  const [typedAt, setTypedAt] = useState(0);
  const [fly, setFly] = useState<{ id: number; fly: Fly } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const idRef = useRef(0);
  const entriesRef = useRef<Entry[]>([]);
  const expiredRef = useRef(onExpired);
  const role = identity.role;
  const commands = COMMANDS[role];
  const cmd = CONSOLE.cmd;

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  useEffect(() => {
    expiredRef.current = onExpired;
  }, [onExpired]);

  const patch = useCallback((id: number, fn: (e: Entry) => Entry) => {
    setEntries((list) => list.map((e) => (e.id === id ? fn(e) : e)));
  }, []);

  // ---------- asking ----------
  const send = useCallback(
    async (query: string, origin: Entry["origin"] = "user", from?: Fly) => {
      const q = query.trim();
      if (!q) return;
      const id = ++idRef.current;
      const entry: Entry = { id, seq: id, query: q, origin, phase: "sent", t0: now(), tools: [], draft: "" };
      // a new question makes the server drop any earlier pending write
      setEntries((list) => [...list.map((e) => (e.reply?.status === "PENDING_CONFIRM" && !e.confirm ? { ...e, superseded: true } : e)), entry]);
      setView(id - 1);
      if (from) setFly({ id, fly: from });
      const r = await chat(q, {
        onProgress: () => patch(id, (e) => ({ ...e, phase: "running" })),
        onDelta: (delta) => patch(id, (e) => ({ ...e, phase: "running", draft: (e.draft + delta).slice(-600) })),
        onToolStart: (tid, name) => patch(id, (e) => ({ ...e, phase: "running", tools: [...e.tools, { id: tid, name, state: "run", t0: now() }] })),
        onToolEnd: (tid, _name, err) =>
          patch(id, (e) => ({ ...e, tools: e.tools.map((t) => (t.id === tid ? { ...t, state: err ? "error" : "done", t1: now() } : t)) })),
      });
      patch(id, (e) => ({ ...e, phase: "done", t1: now(), reply: r, tools: e.tools.map((t) => (t.state === "run" ? { ...t, state: "done", t1: now() } : t)) }));
      if (r.code === "NO_SESSION" || ((r.http === 404 || r.http === 403) && /会话/.test(r.text))) expiredRef.current();
    },
    [patch],
  );

  const confirm = useCallback(
    async (entryId: number, approved: boolean) => {
      const e = entriesRef.current.find((x) => x.id === entryId);
      const token = e?.reply?.pending?.token;
      if (!e || !token || e.confirm) return;
      patch(entryId, (x) => ({ ...x, confirm: { state: "sending", approved } }));
      const r = await confirmWrite(token, approved);
      if (r.status === "PENDING_CONFIRM" && r.pending) {
        // the data changed since the preview: show the fresh preview, ask again
        patch(entryId, (x) => ({ ...x, confirm: undefined, reply: { ...x.reply!, ...r } }));
        return;
      }
      patch(entryId, (x) => ({ ...x, confirm: { state: "done", approved, reply: r } }));
      if (r.code === "NO_SESSION") expiredRef.current();
    },
    [patch],
  );

  // the console asks its opening question by itself once it has docked
  useEffect(() => {
    const id = setTimeout(() => void send(briefing(role), "briefing"), Math.max(0, T_CONFIRM.briefing - T_CONFIRM.build) * 1000);
    return () => clearTimeout(id);
  }, [role, send]);

  // ---------- caret hand-over ----------
  useEffect(() => {
    if (!live) return;
    scene.releaseCaret();
    inputRef.current?.focus({ preventScroll: true });
  }, [live, scene]);

  // ---------- HUD: label, sequence number, last five as ticks ----------
  const current = view >= 0 ? entries[view] ?? null : null;
  const hudKey = entries.map((e) => `${e.id}:${statusOf(e)}`).join("|") + `#${view}`;
  useEffect(() => {
    if (leaving) return;
    if (!current) {
      scene.hudLabel(`SESSION · ${identity.address}`);
      return;
    }
    const st = STATUS[statusOf(current)];
    scene.hudLabel(`SEQ ${pad(current.seq)} · ${st.en} · ${st.zh}`);
    scene.hudCount(pad(entries.length));
    const last = entries.slice(-5);
    scene.hudTicks(
      last.map((e) => {
        const s = statusOf(e);
        return { fill: s === "RUNNING" ? 0.7 : 1, color: TONE_COLOR[STATUS[s].tone] };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hudKey, leaving, scene]);

  // ---------- command line ----------
  const measureCaret = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? el.value.length;
    const w = scene.measureUi(el.value.slice(0, pos), 500, CMD_FONT);
    setCaretX(Math.min(w - el.scrollLeft, el.clientWidth));
  }, [scene]);

  useLayoutEffect(measureCaret, [value, measureCaret]);

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    const r = frameRect(inputRef.current!);
    send(q, "user", { x: r.x, y: r.y + (r.h - CMD_FONT * 1.2) / 2, size: CMD_FONT });
    setValue("");
  };

  const pick = (c: Command) => {
    const m = c.ask.match(/\{([^}]*)\}/);
    if (!m) {
      send(c.ask, "user");
      return;
    }
    // put it in the line with the example selected, ready to be typed over
    const start = m.index!;
    const text = c.ask.replace(/\{([^}]*)\}/, "$1");
    setValue(text);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(start, start + m[1].length);
      measureCaret();
    });
  };

  // Alt+1..n runs a command; "/" focuses the line from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (leaving || away) return;
      if (e.altKey && /^[1-9]$/.test(e.key)) {
        const c = commands[Number(e.key) - 1];
        if (c) {
          e.preventDefault();
          pick(c);
        }
      } else if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const nav = (dir: -1 | 1) => setView((v) => Math.max(0, Math.min(entries.length - 1, v + dir)));
  const out = leaving || away ? " is-out" : "";
  const dept = identity.scope_text;

  return (
    <div className={`xj-console${out}`} data-role={role}>
      <h1 className="xj-sr">学籍管理系统 · {identity.address}</h1>

      {/* identity: the lockup itself is drawn by the scene; this is what sits under it */}
      <p className="xj-scope xj-rise" style={{ top: CONSOLE.ruleY + 62, left: CONSOLE.x, width: CONSOLE.colW - 70, ...d(0.1) }}>
        <span>SCOPE · 可见范围</span>
        {dept}
      </p>

      <nav className="xj-cmds" aria-label="快捷指令" style={{ left: CONSOLE.x, top: CONSOLE.ruleY + 132, width: CONSOLE.colW }}>
        <div className="xj-cmds-head">
          <span className="xj-f-label xj-rise" style={d(0.12)}>
            COMMANDS · 快捷指令
          </span>
          <span className="xj-f-rule xj-grow" style={d(0.16)} />
          <span className="xj-f-meta xj-rise" style={d(0.2)}>
            ALT + 1–{commands.length}
          </span>
        </div>
        <ol>
          {commands.map((c, i) => (
            <li key={c.en} className="xj-rise" style={d(0.16 + i * 0.05)}>
              <button type="button" className="xj-cmd" onClick={() => pick(c)} data-template={/\{/.test(c.ask) ? "" : undefined}>
                <span className="xj-idx">{pad(i + 1)}</span>
                <span className="xj-cmd-zh">{c.zh}</span>
                <span className="xj-cmd-en">{c.en}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <button type="button" className="xj-exit xj-rise" style={{ left: CONSOLE.x, top: 846, ...d(0.4) }} onClick={onExit}>
        <span aria-hidden="true">←</span> 切换身份 <i>SWITCH ID · {ROLE[role].zh}</i>
      </button>
      {role === "ADMIN" && onBackstage && (
        <button
          type="button"
          className="xj-exit xj-backstage xj-rise"
          style={{ left: CONSOLE.x + CONSOLE.colW, top: 846, ...d(0.46) }}
          disabled={!live || away}
          onClick={onBackstage}
        >
          后台 <i>BACKSTAGE · 库表结构</i> <span aria-hidden="true">→</span>
        </button>
      )}

      <span className="xj-divider xj-drop" style={d(0.05)} aria-hidden="true" />

      <div className="xj-stage-wrap">
        <Stage
          entry={current}
          index={view}
          count={entries.length}
          role={role}
          fly={fly && current && fly.id === current.id ? fly.fly : undefined}
          onNav={nav}
          ask={(q) => send(q, "user")}
          onConfirm={(ok) => current && confirm(current.id, ok)}
        />
      </div>

      <form
        className="xj-cmdline"
        style={{ left: cmd.x, width: cmd.x1 - cmd.x, top: cmd.caretY - 8 }}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="xj-prompt xj-rise" style={d(0.2)} aria-hidden="true">
          ›
        </span>
        <label htmlFor="xj-ask" className="xj-sr">
          向学籍助手提问
        </label>
        <span className="xj-cmd-field" style={{ left: cmd.caretX - cmd.x }}>
          <input
            id="xj-ask"
            ref={inputRef}
            value={value}
            maxLength={4000}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setValue(e.target.value);
              setTypedAt(now());
            }}
            onSelect={measureCaret}
            onKeyUp={measureCaret}
            onScroll={measureCaret}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
          />
          {live && !value && (
            <span className="xj-cmd-ph" aria-hidden="true">
              输入问题，或选择左侧指令<i>ASK THE REGISTRY</i>
            </span>
          )}
          {live && focused && (
            <span key={typedAt} className="xj-caret" style={{ transform: `translateX(${caretX}px)` }} aria-hidden="true" />
          )}
        </span>
        <span className="xj-cmd-hint xj-rise" style={d(0.3)}>
          {entries.some((e) => e.phase !== "done") ? "PROCESSING · 可继续输入" : "ENTER · 发送"}
        </span>
        <span className="xj-cmd-rule xj-grow" style={{ top: cmd.ruleY - (cmd.caretY - 8), ...d(0.1) }} aria-hidden="true">
          <span data-on={focused ? "" : undefined} />
        </span>
      </form>
    </div>
  );
}
