"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CJK_MID } from "../intro/engine/layout";
import { TOOL_LABEL } from "./abilities";
import { CSS_EASE, E, lerp, now, pad } from "./anim";
import { Facts } from "./Facts";
import type { Entry, Fact, Reply, Role, Status } from "./types";

const d = (s: number): CSSProperties => ({ ["--d" as string]: s.toFixed(3) });

export type Tone = "yellow" | "red" | "paper";
export const STATUS: Record<Status | "RUNNING", { en: string; zh: string; tone: Tone }> = {
  RUNNING: { en: "PROCESSING", zh: "处理中", tone: "red" },
  OK: { en: "OK", zh: "查询完成", tone: "yellow" },
  CHAT: { en: "REPLY", zh: "回复", tone: "paper" },
  PENDING_CONFIRM: { en: "PENDING", zh: "待确认", tone: "red" },
  WRITE_DONE: { en: "WRITTEN", zh: "已执行", tone: "yellow" },
  WRITE_CANCELLED: { en: "CANCELLED", zh: "已取消", tone: "paper" },
  DENIED: { en: "DENIED", zh: "已拒绝", tone: "red" },
  NOT_FOUND: { en: "NOT FOUND", zh: "未找到", tone: "paper" },
  ERROR: { en: "ERROR", zh: "未完成", tone: "red" },
};

/** Where an entry stands now, including the outcome of an explicit confirmation. */
export const statusOf = (e: Entry): Status | "RUNNING" => {
  if (e.phase !== "done" || !e.reply) return "RUNNING";
  if (e.confirm?.state === "done" && e.confirm.reply) return e.confirm.reply.status;
  return e.reply.status;
};

/** Element position in the 1920x1080 frame's own coordinates. */
export function frameRect(el: Element) {
  const frame = el.closest(".xj-frame") as HTMLElement | null;
  const r = el.getBoundingClientRect();
  if (!frame) return { x: r.left, y: r.top, w: r.width, h: r.height };
  const f = frame.getBoundingClientRect();
  const k = f.width / 1920;
  return { x: (r.left - f.left) / k, y: (r.top - f.top) / k, w: r.width / k, h: r.height / k };
}

export type Fly = { x: number; y: number; size: number };

// ------------------------------------------------------------------ headline

const HEAD_SIZE = 44;
/** Opening full-width punctuation hangs into the margin so the headline's edge stays optical. */
const HANG = "「『“《（【";

/** The question, set big. While the agent works, a scan passes over it and thins each glyph it crosses. */
function Headline({ text, running, fly, briefing }: { text: string; running: boolean; fly?: Fly; briefing: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const bar = useRef<HTMLSpanElement>(null);

  // arrive from the command line (FLIP), or type in when the console asked by itself
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !fly || !el.animate) return;
    const to = frameRect(el);
    const s = fly.size / HEAD_SIZE;
    el.animate(
      [{ transform: `translate(${fly.x - to.x}px, ${fly.y - to.y}px) scale(${s})` }, { transform: "none" }],
      { duration: 620, easing: CSS_EASE.inOut, fill: "backwards" },
    );
  }, [fly]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const spans = [...el.querySelectorAll<HTMLSpanElement>(".ch")];
    if (!running) {
      spans.forEach((s) => (s.style.fontWeight = ""));
      if (bar.current) bar.current.style.display = "none";
      return;
    }
    const cs = spans.map((s) => s.offsetLeft + s.offsetWidth / 2);
    const right = Math.max(...spans.map((s) => s.offsetLeft + s.offsetWidth), 0);
    const t0 = now() + (fly ? 0.62 : 0.2);
    const P = 1.1;
    let raf = 0;
    const loop = () => {
      const t = now() - t0;
      const sx = t < 0 ? -1e4 : lerp(-60, right + 60, E.soft((t % P) / P));
      spans.forEach((s, i) => (s.style.fontWeight = String(Math.round(820 - 600 * Math.exp(-(((cs[i] - sx) / 64) ** 2))))));
      if (bar.current) {
        bar.current.style.display = t < 0 ? "none" : "block";
        bar.current.style.transform = `translateX(${sx}px)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, text, fly]);

  return (
    <h2 className="xj-headline" ref={ref} aria-busy={running}>
      {[...text].map((ch, i) => (
        <span key={i} className={`ch${i === 0 && HANG.includes(ch) ? " hang" : ""}${briefing ? " xj-rise" : ""}`} style={briefing ? d(0.04 + i * 0.022) : undefined}>
          {ch}
        </span>
      ))}
      <span className="xj-scan" ref={bar} aria-hidden="true" />
    </h2>
  );
}

// ------------------------------------------------------------------ live trace

function useTicker(on: boolean, ms = 80) {
  const [, set] = useState(0);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [on, ms]);
}

/** Wall-clock milliseconds, refreshed every `ms` while `on`. */
function useWallClock(on: boolean, ms: number) {
  const [t, set] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => set(Date.now()), ms);
    return () => clearInterval(id);
  }, [on, ms]);
  return t;
}

const secs = (v: number) => `${v.toFixed(2)}s`;

function Pipeline({ e, out }: { e: Entry; out: boolean }) {
  useTicker(!out);
  const t = now();
  const rows: { k: string; label: string; sub?: string; right: string; state: "run" | "done" | "error" }[] = [
    { k: "req", label: "REQUEST RECEIVED", sub: "已接收", right: `+${secs(0)}`, state: "done" },
    {
      k: "agent",
      label: "AGENT PLANNING",
      sub: "模型规划",
      right: e.phase === "sent" ? "…" : `${secs(Math.max(0, (e.tools[0]?.t0 ?? t) - e.t0))}`,
      state: e.tools.length ? "done" : "run",
    },
    ...e.tools.map((tool) => ({
      k: tool.id,
      label: tool.name,
      sub: TOOL_LABEL[tool.name] ?? "受控能力",
      right: tool.state === "run" ? `${secs(t - tool.t0)}` : `${secs((tool.t1 ?? t) - tool.t0)}`,
      state: tool.state,
    })),
  ];
  return (
    <div className={`xj-pipe${out ? " is-out" : ""}`} aria-live="polite">
      <div className="xj-pipe-label xj-rise" style={d(0.1)}>
        TRACE · 处理过程 <span>白名单能力 · 只读查询 / 写入仅预览</span>
      </div>
      <ol>
        {rows.map((r, i) => (
          <li key={r.k} className="xj-pipe-row xj-rise" data-state={r.state} style={d(i < 2 ? 0.14 + i * 0.06 : 0)}>
            <span className="xj-idx">{pad(i + 1)}</span>
            <span className="xj-pipe-name">{r.label}</span>
            <span className="xj-pipe-sub">{r.sub}</span>
            <span className="xj-pipe-track" aria-hidden="true">
              <span />
            </span>
            <span className="xj-pipe-time">{r.state === "error" ? "ERROR" : r.right}</span>
          </li>
        ))}
      </ol>
      {e.draft && (
        <p className="xj-draft xj-rise">
          <span>DRAFT · 草稿（以最终结果为准）</span>
          {e.draft}
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ seal (the intro's mark)

export function SealMark({ size, className, style }: { size: number; className?: string; style?: CSSProperties }) {
  const chars = [
    { ch: "档", dx: 93, dy: -93 },
    { ch: "案", dx: 93, dy: 93 },
    { ch: "确", dx: -93, dy: -93 },
    { ch: "认", dx: -93, dy: 93 },
  ];
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="-210 -210 420 420" aria-hidden="true">
      <rect x={-186} y={-186} width={372} height={372} fill="var(--red)" />
      <path d="M-210 -210h420v420h-420Z M-192 -192v384h384v-384Z" fill="var(--red)" fillRule="evenodd" />
      {chars.map((c) => (
        <text key={c.ch} x={c.dx} y={c.dy + CJK_MID * 150} textAnchor="middle" fontSize={150} fontWeight={900} fill="var(--ink)">
          {c.ch}
        </text>
      ))}
    </svg>
  );
}

// ------------------------------------------------------------------ write confirmation

function Countdown({ until, stopped }: { until: number; stopped: boolean }) {
  const t = useWallClock(!stopped, 250);
  const left = Math.max(0, until - t);
  const total = 300_000;
  return (
    <span className="xj-count-down" data-off={stopped ? "" : undefined}>
      <span className="xj-count-track" aria-hidden="true">
        <span style={{ transform: `scaleX(${stopped ? 0 : left / total})` }} />
      </span>
      {stopped ? "—" : `${Math.floor(left / 60000)}:${pad((left % 60000) / 1000)}`}
    </span>
  );
}

function WriteDoc({ e, onConfirm }: { e: Entry; onConfirm: (approved: boolean) => void }) {
  const pending = e.reply?.pending;
  const preview = (pending?.preview ?? e.reply?.data.find((f) => f.kind === "write_preview")) as Fact | undefined;
  const clock = useWallClock(!!pending && !e.confirm, 500);
  const expired = pending ? pending.expiresAt <= clock : true;
  if (!preview) return null;
  const fields = (Array.isArray(preview.fields) ? preview.fields : []) as [string, string][];
  const del = preview.ability === "delete_student" || pending?.ability === "delete_student";
  const warning = typeof preview.warning === "string" ? preview.warning : "";
  const c = e.confirm;
  const outcome = c?.state === "done" ? c.reply : undefined;
  const done = outcome?.status === "WRITE_DONE";
  const cancelled = outcome?.status === "WRITE_CANCELLED";
  const failed = outcome && !outcome.ok;
  const locked = !!c || expired || !!e.superseded;
  return (
    <section className="xj-doc" data-kind={del ? "delete" : "add"} data-done={done ? "" : undefined} data-cancelled={cancelled ? "" : undefined}>
      <div className="xj-f-head">
        <span className="xj-f-label xj-rise">WRITE PREVIEW · 写入预览</span>
        <span className="xj-f-rule xj-grow" style={d(0.05)} />
        <span className="xj-f-meta xj-rise" style={d(0.1)}>
          {locked ? "凭证已结束" : "凭证有效"} <Countdown until={pending?.expiresAt ?? 0} stopped={locked} />
        </span>
      </div>
      <div className="xj-doc-title-row">
        <h3 className="xj-doc-title xj-rise" style={d(0.08)}>
          {String(preview.action ?? (del ? "删除学籍" : "新增学籍"))}
          {cancelled && <span className="xj-strike xj-grow" />}
        </h3>
        <span className="xj-doc-state xj-rise" style={d(0.16)}>
          {done ? "已执行 · WRITTEN" : cancelled ? "已取消 · CANCELLED" : e.superseded ? "已失效 · 新问题已发送" : expired ? "已过期 · EXPIRED" : "尚未执行 · NOT YET WRITTEN"}
        </span>
      </div>
      <dl className="xj-doc-fields">
        {fields.map(([k, v], i) => (
          <div key={k} className="xj-rise" style={d(0.14 + i * 0.05)}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {warning && (
        <p className="xj-doc-warn xj-rise" style={d(0.3)}>
          <i className="xj-mark" data-tone="red" />
          {warning}
        </p>
      )}
      {!c && !locked && (
        <div className="xj-doc-acts xj-rise" style={d(0.36)}>
          <button type="button" className="xj-btn" data-tone={del ? "red" : "yellow"} onClick={() => onConfirm(true)}>
            {del ? "确认删除" : "确认新增"} <span>CONFIRM</span>
          </button>
          <button type="button" className="xj-btn" data-tone="ghost" onClick={() => onConfirm(false)}>
            取消 <span>CANCEL</span>
          </button>
          <span className="xj-doc-note">写入只在你按下确认后执行；聊天里的“确认”二字不会触发写入。</span>
        </div>
      )}
      {c?.state === "sending" && <p className="xj-doc-note xj-rise">{c.approved ? "正在执行写入…" : "正在取消…"}</p>}
      {outcome && (
        <p className="xj-doc-result xj-rise" data-fail={failed ? "" : undefined}>
          {outcome.text}
        </p>
      )}
      {done && <SealMark size={150} className="xj-stamp" />}
    </section>
  );
}

const markdownPlugins = [remarkGfm];

function MarkdownBody({ text }: { text: string }) {
  return (
    <Markdown remarkPlugins={markdownPlugins} components={{
      a: ({ href, title, children }) => <a href={href} title={title} target="_blank" rel="noopener noreferrer">{children}</a>,
    }}>
      {text}
    </Markdown>
  );
}

// ------------------------------------------------------------------ refusal

function Refusal({ r, ask }: { r: Reply; ask: (q: string) => void }) {
  const kind = r.status === "NOT_FOUND" ? { en: "NOT FOUND", zh: "未找到" } : r.status === "DENIED" ? { en: "ACCESS DENIED", zh: "权限不足" } : { en: "NOT COMPLETED", zh: "未能完成" };
  return (
    <section className="xj-refuse" data-status={r.status}>
      <span className="xj-band" aria-hidden="true" />
      <h3 className="xj-refuse-en xj-rise" style={d(0.12)}>
        {kind.en}
      </h3>
      <p className="xj-refuse-zh xj-rise" style={d(0.18)}>
        {kind.zh}
      </p>
      <div className="xj-refuse-text xj-markdown xj-rise" style={d(0.26)}>
        <MarkdownBody text={r.text || r.error || ""} />
      </div>
      {!!r.alternatives?.length && (
        <div className="xj-alts">
          <span className="xj-f-label xj-rise" style={d(0.32)}>
            TRY · 可以改问
          </span>
          {r.alternatives.map((a, i) => (
            <button key={a} type="button" className="xj-act" style={d(0.36 + i * 0.05)} onClick={() => ask(a)}>
              › {a}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ text

/** Facts whose template text only enumerates what the visual already lists in full. */
const LISTS = new Set(["list_students", "list_teachers", "course_students", "failed_students", "my_course_list", "student_scores"]);

function Statement({ text, label, big, folded }: { text: string; label: string; big: boolean; folded: boolean }) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [clipped, setClipped] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const collapsedHeight = useRef(0);
  const prominent = big && text.length <= 160 && text.split("\n").length <= 4;

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      if (!open) collapsedHeight.current = parseFloat(getComputedStyle(el).maxHeight);
      setClipped(el.scrollHeight > (open ? collapsedHeight.current : el.clientHeight) + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, open, folded, revealed]);

  if (folded && !revealed)
    return (
      <section className="xj-text">
        <button type="button" className="xj-act xj-rise" style={d(0.3)} onClick={() => setRevealed(true)}>
          › 文字版陈述 TEXT VERSION
        </button>
      </section>
    );
  return (
    <section className={`xj-text${prominent ? " big" : ""}`}>
      <span className="xj-f-label xj-rise" style={d(0.3)}>
        {label}
      </span>
      <div ref={bodyRef} className={`xj-markdown xj-rise${!open ? " clamp" : ""}`} style={d(0.34)}>
        <MarkdownBody text={text} />
      </div>
      {clipped && (
        <button type="button" className="xj-act" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "收起 LESS" : "展开全文 MORE"}
        </button>
      )}
    </section>
  );
}

function Result({ e, role, ask, onConfirm }: { e: Entry; role: Role; ask: (q: string) => void; onConfirm: (approved: boolean) => void }) {
  const r = e.reply!;
  const refused = r.status === "DENIED" || r.status === "NOT_FOUND" || r.status === "ERROR";
  const facts = r.data.filter((f) => f && typeof f.kind === "string");
  const total = (e.t1 ?? now()) - e.t0;
  return (
    <div className="xj-result">
      {refused && <Refusal r={r} ask={ask} />}
      {r.status === "PENDING_CONFIRM" ? (
        <WriteDoc e={e} onConfirm={onConfirm} />
      ) : (
        <>
          <Facts facts={facts} ask={ask} role={role} />
          {!refused && r.text && (
            <Statement
              text={r.text}
              label={facts.length ? "STATEMENT · 事实陈述（确定性模板）" : "REPLY · 回复"}
              big={!facts.length}
              folded={facts.length > 0 && facts.every((f) => LISTS.has(f.kind))}
            />
          )}
        </>
      )}
      <footer className="xj-trace xj-rise" style={d(0.4)}>
        <span>TRACE</span>
        {e.tools.length ? e.tools.map((t) => <span key={t.id} data-err={t.state === "error" ? "" : undefined}>{t.name}</span>) : <span>无工具调用</span>}
        <span className="r">{secs(total)}</span>
      </footer>
    </div>
  );
}

// ------------------------------------------------------------------ scroll body

/** The result area. When content runs past its bottom edge, the edge is ruled and says so. */
function Body({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 6);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    const mo = new MutationObserver(() => {
      for (const c of el.children) ro.observe(c);
      check();
    });
    mo.observe(el, { childList: true, subtree: true });
    el.addEventListener("scroll", check, { passive: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, []);
  return (
    <div className="xj-body-wrap" data-more={more ? "" : undefined}>
      <div className="xj-body" ref={ref} tabIndex={0} aria-label="结果内容">
        {children}
      </div>
      {more && (
        <button type="button" className="xj-more" onClick={() => ref.current?.scrollBy({ top: ref.current.clientHeight * 0.7, behavior: "smooth" })}>
          MORE · 向下查看
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ stage

type StageProps = {
  entry: Entry | null;
  index: number;
  count: number;
  role: Role;
  fly?: Fly;
  onNav: (dir: -1 | 1) => void;
  ask: (q: string) => void;
  onConfirm: (approved: boolean) => void;
};

export default function Stage({ entry, index, count, role, fly, onNav, ask, onConfirm }: StageProps) {
  const done = entry?.phase === "done" && !!entry.reply;
  // the trace collapses before the result rises (never both at once)
  const [shown, setShown] = useState<"pipe" | "result">(done ? "result" : "pipe");
  const [shownFor, setShownFor] = useState(entry?.id);
  if (entry?.id !== shownFor) {
    setShownFor(entry?.id);
    setShown(done ? "result" : "pipe");
  }
  useEffect(() => {
    if (done && shown === "pipe") {
      const id = setTimeout(() => setShown("result"), 200);
      return () => clearTimeout(id);
    }
  }, [done, shown]);

  if (!entry) return null;
  const st = statusOf(entry);
  const meta = STATUS[st];
  return (
    <section className="xj-stage" aria-label="查询结果">
      <header className="xj-stage-head">
        <span className="xj-seq xj-rise">
          SEQ {pad(entry.seq)} <i>{entry.origin === "briefing" ? "BRIEFING · 开场简报" : "QUERY · 提问"}</i>
        </span>
        {count > 1 && (
          <span className="xj-nav xj-rise" style={d(0.05)}>
            <button type="button" aria-label="上一条" disabled={index === 0} onClick={() => onNav(-1)}>
              ‹
            </button>
            {pad(index + 1)} / {pad(count)}
            <button type="button" aria-label="下一条" disabled={index === count - 1} onClick={() => onNav(1)}>
              ›
            </button>
          </span>
        )}
        <span key={st} className="xj-chip xj-rise" data-tone={meta.tone} role="status">
          {meta.en} · {meta.zh}
        </span>
      </header>
      <Headline key={entry.id} text={entry.query} running={!done} fly={fly} briefing={entry.origin === "briefing"} />
      <span className="xj-stage-rule xj-grow" key={`r${entry.id}`} style={d(0.2)} />
      <Body key={`b${entry.id}`}>
        {shown === "pipe" ? <Pipeline e={entry} out={done} /> : <Result e={entry} role={role} ask={ask} onConfirm={onConfirm} />}
      </Body>
    </section>
  );
}
