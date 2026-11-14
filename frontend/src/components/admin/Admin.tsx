"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ROLE } from "../xueji/abilities";
import { createSession, deleteSession } from "../xueji/api";
import type { Identity } from "../xueji/types";
import Atlas, { buildTimes, type CardMode, type Motion } from "./Atlas";
import Dossier from "./Dossier";
import Gate, { type GateStatus } from "./Gate";
import Hud, { HudBack } from "./Hud";
import Lockup, { LOCK, type LockupState } from "./Lockup";
import { H, W, itemsOf, kib, pad2, type Cell, type Item, type Snapshot } from "./model";
import { Swap, d, reduced } from "./parts";
import type { Focus } from "./Rows";
import Stage, { type Tab } from "./Stage";
import { fetchSchema, type Handoff } from "./api";

// /admin: the backstage. Gate (administrator only) -> schema map -> any object's file card, rows and
// picture -> back. One continuous drawing: the yellow rule, the chip and every table card persist and
// travel between states; nothing is cut or cross-faded.

type Phase = "boot" | "gate" | "map" | "detail" | "leave";

declare global {
  interface Window {
    /** Review hook: drive the backstage without pointing. */
    __admin?: { open: (key: string, tab?: Tab) => void; map: () => void; state: () => { phase: Phase; sel: string | null; tab: Tab } };
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));
const KIND = { table: { en: "TABLE", zh: "表" }, view: { en: "VIEW", zh: "视图" }, file: { en: "FILE", zh: "文件" } } as const;

type Props = {
  uiFont: string;
  /** Opened over the console: start from its chip and rule (otherwise: the /admin page builds its own frame). */
  handoff?: Handoff | null;
  /** Opened over the console: hand back to it (after the leave choreography). */
  onClose?: (how: "back" | "signout") => void;
};

export default function Admin({ uiFont, handoff = null, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [hand] = useState<Handoff | null>(handoff);
  const [phase, setPhase] = useState<Phase>("boot");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [who, setWho] = useState<Identity | null>(null);
  const [cards, setCards] = useState<CardMode>("pre");
  const [motion, setMotion] = useState<Motion>("none");
  const [sel, setSel] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("shape");
  const [focus, setFocus] = useState<Focus>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [gate, setGate] = useState<{ value: string; status: GateStatus; msg: string }>({ value: "", status: "idle", msg: "" });
  const [ticks, setTicks] = useState(0);
  const [from, setFrom] = useState<Phase>("boot");
  const [ghost, setGhost] = useState(false);
  const timers = useRef<number[]>([]);
  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, reduced() ? 0 : ms));
  const clearLater = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // fit the 1920 x 1080 frame into the window
  useLayoutEffect(() => {
    const fit = () => {
      const r = rootRef.current;
      const f = frameRef.current;
      if (!r || !f) return;
      const k = Math.min(r.clientWidth / W, r.clientHeight / H);
      f.style.transform = `scale(${k}) translate(-50%, -50%)`;
      r.style.setProperty("--k", String(k));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => () => clearLater(), []);

  const items = useMemo(() => (snap ? itemsOf(snap) : []), [snap]);
  const item = useMemo(() => items.find((i) => i.key === sel) ?? null, [items, sel]);

  // ---------- transitions ----------
  const phaseRef = useRef<Phase>("boot");
  const go = useCallback((next: Phase) => {
    setFrom(phaseRef.current);
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const enterMap = useCallback(
    (s: Snapshot) => {
      clearLater();
      setSnap(s);
      go("map");
      setMotion("build");
      setCards("pre");
      setTicks(1);
      setGhost(true);
      // next frame: every card starts building on its own schedule
      requestAnimationFrame(() => requestAnimationFrame(() => setCards("map")));
      const { done } = buildTimes(s, itemsOf(s));
      [0.3, 0.55, 0.8, 1].forEach((f, i) => later(done * f * 1000, () => setTicks(2 + i)));
    },
    [go],
  );

  const toGate = useCallback(
    (status: GateStatus, msg = "") => {
      clearLater();
      setCards("pre");
      setMotion("none");
      setSel(null);
      setGhost(false);
      setTicks(0);
      setGate({ value: "", status, msg });
      go("gate");
    },
    [go],
  );

  const load = useCallback(async () => {
    const r = await fetchSchema();
    if (r.ok && r.schema) {
      setWho(r.identity ?? null);
      return { ok: true as const, schema: r.schema };
    }
    const status: GateStatus = r.code === "OFFLINE" || r.http === 503 || r.http === 0 ? "offline" : r.http === 401 || r.http === 404 ? "idle" : "denied";
    const msg =
      status === "offline"
        ? "学籍服务未启动 · 请在 backend/ 运行 bun dev"
        : status === "denied"
          ? r.http === 403
            ? "当前会话不是管理员 · 请用管理员教师号验证"
            : r.text || "无法读取库表结构"
          : "";
    return { ok: false as const, status, msg };
  }, []);

  // ---------- boot ----------
  useEffect(() => {
    let stop = false;
    void (async () => {
      const fonts = Promise.all([document.fonts.load(`900 88px ${uiFont}`, "库表结构"), document.fonts.load(`600 13px ${uiFont}`, "学籍")]).catch(() => undefined);
      const [r] = await Promise.all([load(), fonts, wait(hand ? 260 : 700)]);
      if (stop) return;
      if (r.ok) enterMap(r.schema);
      else toGate(r.status, r.msg);
    })();
    return () => {
      stop = true;
    };
  }, [uiFont, hand, load, enterMap, toGate]);

  // ---------- gate ----------
  const submit = useCallback(
    async (raw: string) => {
      const id = raw.trim().toUpperCase();
      if (!id || gate.status === "verifying" || gate.status === "granted") return;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
        setGate((g) => ({ ...g, status: "denied", msg: "学号 / 教师号只含字母与数字" }));
        return;
      }
      setGate((g) => ({ ...g, value: id, status: "verifying", msg: "" }));
      const t0 = performance.now();
      const r = await createSession(id);
      await wait(Math.max(0, 950 - (performance.now() - t0)));
      if (!r.ok || !r.identity) {
        const offline = r.code === "OFFLINE" || r.http === 503;
        setGate((g) => ({ ...g, status: offline ? "offline" : "denied", msg: offline ? "学籍服务未启动 · 请在 backend/ 运行 bun dev" : r.text || "无法验证该身份" }));
        return;
      }
      if (r.identity.role !== "ADMIN") {
        void deleteSession();
        setGate((g) => ({ ...g, status: "denied", msg: `${r.identity!.display} 是${ROLE[r.identity!.role].zh} · 后台仅限管理员` }));
        return;
      }
      const s = await load();
      if (!s.ok) {
        setGate((g) => ({ ...g, status: s.status === "offline" ? "offline" : "denied", msg: s.msg }));
        return;
      }
      setGate((g) => ({ ...g, status: "granted", msg: "" }));
      await wait(380);
      enterMap(s.schema);
    },
    [gate.status, load, enterMap],
  );

  // ---------- navigation ----------
  const open = useCallback(
    (key: string, nextTab?: Tab) => {
      if (!snap || (phase !== "map" && phase !== "detail")) return;
      if (!itemsOf(snap).some((i) => i.key === key)) return;
      clearLater();
      setHover(null);
      setFocus(null);
      if (nextTab) setTab(nextTab);
      if (phase === "map") {
        setMotion("fold");
        setCards("strip");
        if (!nextTab) setTab("shape");
        go("detail");
      } else {
        setMotion("none");
      }
      setSel(key);
    },
    [snap, phase, go],
  );

  const toMap = useCallback(() => {
    if (phase !== "detail") return;
    clearLater();
    setMotion("unfold");
    setCards("map");
    setFocus(null);
    go("map");
  }, [phase, go]);

  const jump = useCallback(
    (table: string, col: string, value: Cell) => {
      open(table, "rows");
      setFocus({ col, value });
    },
    [open],
  );

  const refresh = useCallback(async () => {
    const r = await load();
    if (r.ok) setSnap(r.schema);
    else toGate(r.status, r.msg);
  }, [load, toGate]);

  /** Over the console: everything folds away and the chip and rule go back to where the console had them. */
  const leave = useCallback(
    (how: "back" | "signout") => {
      if (!hand || !onClose || phaseRef.current === "leave") return;
      clearLater();
      setHover(null);
      setFocus(null);
      setMotion("none");
      setCards("pre");
      setGhost(false);
      setTicks(0);
      go("leave");
      later(560, () => onClose(how));
    },
    [hand, onClose, go],
  );

  const signOut = useCallback(async () => {
    if (hand && onClose) {
      leave("signout"); // the console signs out itself
      return;
    }
    await deleteSession();
    setWho(null);
    toGate("idle");
  }, [hand, onClose, leave, toGate]);

  // keyboard: Esc -> map, ←/→ -> previous / next object
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "Escape" && phase === "detail") toMap();
      else if (e.key === "Escape" && phase === "map" && onClose) leave("back");
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && phase === "detail" && sel) {
        const i = items.findIndex((x) => x.key === sel);
        const next = items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
        if (next) open(next.key);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, sel, items, open, toMap, onClose, leave]);

  useEffect(() => {
    window.__admin = { open: (k, t) => open(k, t), map: toMap, state: () => ({ phase, sel, tab }) };
    return () => {
      delete window.__admin;
    };
  }, [open, toMap, phase, sel, tab]);

  // ---------- lockup ----------
  const lock = useMemo<LockupState>(() => {
    const hidden = { text: "", tone: "yellow" as const, x: 200, y: LOCK.map.chipY, h: 34, size: 16, hidden: true };
    if (phase === "leave" && hand) {
      // exactly what the console shows when it takes over again: its role chip and its rule
      return {
        chip: { ...hand.chip, text: "ADMIN · 管理员", tone: "yellow" },
        big: { id: "leave", text: "", size: LOCK.detail.size },
        rule: { ...hand.rule, tone: "yellow" },
        caption: { text: "", y: hand.rule.y + 30 },
      };
    }
    if (phase === "boot") {
      if (hand)
        return {
          chip: { ...hand.chip, tone: "yellow" },
          big: { id: "boot", text: "", size: LOCK.detail.size },
          rule: { ...hand.rule, tone: "yellow" },
          caption: { text: "", y: hand.rule.y + 30 },
        };
      return {
        chip: hidden,
        big: { id: "boot", text: "", size: LOCK.map.size },
        rule: { x: 200, y: LOCK.map.ruleY, w: LOCK.map.ruleW, h: LOCK.map.ruleH, tone: "yellow", hidden: true },
        caption: { text: "", y: LOCK.map.ruleY + 26 },
      };
    }
    if (phase === "gate") {
      const G = LOCK.gate;
      const st = gate.status;
      const bad = st === "denied" || st === "offline";
      const chipText =
        st === "verifying" ? "VERIFYING · 验证中" : st === "granted" ? "ACCESS GRANTED · 已授权" : st === "denied" ? "DENIED · 无后台权限" : st === "offline" ? "OFFLINE · 服务未连接" : "RESTRICTED · 后台 · 仅限管理员";
      return {
        chip: { text: chipText, tone: st === "granted" ? "yellow" : "red", x: 200, y: G.chipY, h: 44, size: 22 },
        // shrink to keep the whole ID (plus caret) on the rule, like the console's fitSize
        big: { id: "gate", text: gate.value, size: Math.min(G.size, (G.ruleW - 70) / Math.max(1, gate.value.length * 0.7)), live: true, caret: st === "idle" || bad, scanning: st === "verifying" },
        rule: { x: 200, y: G.ruleY, w: G.ruleW, h: G.ruleH, tone: bad ? "red" : "yellow" },
        caption: { text: gate.msg || (st === "verifying" ? "正在核对身份 · VERIFYING IDENTITY" : "ENTER ADMIN ID · 输入管理员教师号"), y: G.ruleY + 40 },
      };
    }
    const s = snap!;
    if (phase === "map") {
      const M = LOCK.map;
      const tables = s.objects.filter((o) => o.type === "table").length;
      return {
        chip: { text: `BACKSTAGE · 后台${who ? ` · ${who.display}` : ""}`, tone: "yellow", x: 200, y: M.chipY, h: 34, size: 16 },
        big: { id: "map", text: "库表结构", size: M.size, delay: from === "detail" ? 0.38 : from === "gate" ? 0.42 : 0.12 },
        rule: { x: 200, y: M.ruleY, w: M.ruleW, h: M.ruleH, tone: "yellow" },
        caption: { text: `${s.file.name} · SQLite ${s.file.sqlite} · ${tables} 表 ${s.objects.length - tables} 视图 · ${kib(s.file.bytes)} KiB`, y: M.ruleY + 26 },
      };
    }
    const it = item!;
    const D = LOCK.detail;
    const k = KIND[it.kind];
    const size = Math.min(D.size, (D.ruleW - 20) / Math.max(1, [...it.zh].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 1 : 0.6), 0)));
    return {
      chip: { text: `${k.en} ${pad2(it.idx)} / ${pad2(items.length)} · ${k.zh}`, tone: it.kind === "table" ? "yellow" : "paper", x: 200, y: D.chipY, h: 34, size: 16 },
      big: { id: `d:${it.key}`, text: it.zh, size, delay: from === "map" ? 0.32 : 0 },
      rule: { x: 200, y: D.ruleY, w: D.ruleW, h: D.ruleH, tone: "yellow" },
      caption: { text: `${it.en}${it.long !== it.zh ? ` · ${it.long}` : ""} · ${it.count} ${it.kind === "file" ? "页" : "行"}${it.obj ? ` · ${it.obj.columns.length} 列` : ""}`, y: D.ruleY + 28 },
      seal: it.kind === "table" ? "第三范式" : null,
    };
  }, [phase, hand, gate, snap, who, item, items, from]);

  // ---------- HUD ----------
  const hudLabel =
    phase === "leave"
      ? "CONSOLE · 主界面"
      : phase === "gate"
      ? gate.status === "denied"
        ? "DENIED · 无后台权限"
        : "RESTRICTED · 仅限管理员"
      : phase === "map"
        ? "SCHEMA · 结构总图"
        : phase === "detail" && item
          ? `${KIND[item.kind].en} · ${item.en}`
          : hand?.label ?? "BACKSTAGE · 后台";
  const hudCount = phase === "detail" && item ? pad2(item.idx) : phase === "map" ? pad2(items.length) : "00";

  const showAtlas = !!snap && (phase === "map" || phase === "detail" || phase === "leave" || cards !== "pre");

  return (
    <div ref={rootRef} className="xj-root ad-root" data-phase={phase}>
      {(
        <div ref={frameRef} className="xj-frame" data-embedded={hand ? "" : undefined}>
          <HudBack ghost={ghost} />
          <div className="xj-ui">

            <Swap value={phase === "gate" ? gate : null} id={phase === "gate" ? "gate" : "none"} outMs={260}>
              {(g, out) => (
                <Gate
                  value={g.value}
                  status={g.status}
                  out={out}
                  onBack={hand && onClose ? () => leave("back") : undefined}
                  onChange={(v) => setGate((x) => ({ ...x, value: v, status: x.status === "verifying" || x.status === "granted" ? x.status : "idle", msg: "" }))}
                  onSubmit={submit}
                />
              )}
            </Swap>

            {showAtlas && snap && (
              <Atlas s={snap} items={items} mode={phase === "gate" ? "pre" : cards} motion={motion} sel={sel} hover={hover} onHover={setHover} onOpen={open} onMap={toMap} />
            )}

            <Lockup s={lock} />

            {snap && (
              <>
                <div className="ad-divider" data-on={phase === "detail" ? "" : undefined} />
                <Swap value={phase === "detail" ? item : null} id={phase === "detail" && item ? item.key : "none"} outMs={260}>
                  {(it: Item, out, dl) => (
                    <>
                      <Dossier s={snap} item={it} out={out} delay={(from === "map" ? 0.62 : 0.18) + dl} onOpen={open} />
                      <Stage
                        s={snap}
                        item={it}
                        tab={tab}
                        out={out}
                        delay={(from === "map" ? 0.7 : 0.22) + dl}
                        focus={focus}
                        onTab={(t) => {
                          setFocus(null);
                          setTab(t);
                        }}
                        onJump={jump}
                        onOpen={open}
                      />
                    </>
                  )}
                </Swap>
              </>
            )}

            {(phase === "map" || phase === "detail") && (
              <nav className="ad-actions" aria-label="后台操作">
                {hand && onClose ? (
                  <button type="button" className="xj-rise" style={d(0.9)} onClick={() => leave("back")}>
                    ← 主界面 <i>CONSOLE</i>
                  </button>
                ) : (
                  // a full load on purpose: the console's scene starts from a clean page
                  // eslint-disable-next-line @next/next/no-html-link-for-pages
                  <a className="xj-rise" style={d(0.9)} href="/?skip">
                    ← 主界面 <i>CONSOLE</i>
                  </a>
                )}
                <button type="button" className="xj-rise" style={d(0.95)} onClick={() => void refresh()}>
                  刷新 <i>REFRESH</i>
                </button>
                <button type="button" className="xj-rise" style={d(1)} onClick={() => void signOut()}>
                  退出 <i>SIGN OUT</i>
                </button>
                {phase === "detail" && (
                  <span className="ad-keys xj-rise" style={d(0.2)}>
                    ESC 总图 · ← → 切换
                  </span>
                )}
                {phase === "map" && hand && onClose && (
                  <span className="ad-keys xj-rise" style={d(1.05)}>
                    ESC 返回主界面
                  </span>
                )}
              </nav>
            )}
          </div>
          <Hud build={!hand} label={hudLabel} count={hudCount} ticks={ticks} tcFrom={hand?.tc ?? 0} />
        </div>
      )}
      <div className="xj-screen" aria-hidden="true" />
    </div>
  );
}
