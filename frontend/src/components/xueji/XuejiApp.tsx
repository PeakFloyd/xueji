"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Handoff } from "../admin/api";
import { H, W } from "../intro/engine/constants";
import { deptOf } from "./abilities";
import { now, reducedMotion } from "./anim";
import { createSession, deleteSession, health } from "./api";
import Console from "./Console";
import Gate from "./Gate";
import { T_CONFIRM, createScene, type Fonts, type Scene } from "./scene";
import type { Identity } from "./types";

type Phase = "gate" | "verifying" | "entering" | "console" | "leaving";

// the backstage is only ever opened by an administrator: its code loads when one signs in
const loadBackstage = () => import("../admin/Admin");
const Backstage = dynamic(loadBackstage, { ssr: false });

declare global {
  interface Window {
    /** Review hook (?skip&review): jump straight into a role without typing. */
    __xueji?: { login: (id: string) => void; scene: () => Scene | null };
  }
}

type Props = {
  fonts: Fonts;
  /** Start as an exact copy of the intro's last frame and animate out of it. */
  handoff: boolean;
  /** Called once the first frame is on screen (the intro underneath can go). */
  onReady?: () => void;
};

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function XuejiApp({ fonts, handoff, onReady }: Props) {
  const { intro: introFont, ui: uiFont } = fonts;
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<SVGSVGElement>(null);
  const mainRef = useRef<SVGSVGElement>(null);
  const hudRef = useRef<SVGSVGElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [phase, setPhase] = useState<Phase>("gate");
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [gateKey, setGateKey] = useState(0);
  const [entered, setEntered] = useState(false);
  const [away, setAway] = useState(false);
  const [backstage, setBackstage] = useState<Handoff | null>(null);
  const readyRef = useRef(onReady);
  const reduced = useRef(false);

  useEffect(() => {
    readyRef.current = onReady;
  }, [onReady]);

  // ---------- scene + render loop + fit ----------
  useEffect(() => {
    reduced.current = reducedMotion();
    const sc = createScene({ bg: bgRef.current!, main: mainRef.current!, hud: hudRef.current! }, { intro: introFont, ui: uiFont });
    const fit = () => {
      const root = rootRef.current!;
      const k = Math.min(root.clientWidth / W, root.clientHeight / H);
      frameRef.current!.style.transform = `scale(${k}) translate(-50%, -50%)`;
      root.style.setProperty("--k", String(k));
    };
    fit();
    sc.render();
    let raf = 0;
    const tick = () => {
      sc.render(now());
      raf = requestAnimationFrame(tick);
    };
    const freeze = new URLSearchParams(window.location.search).has("freeze");
    raf = requestAnimationFrame(() => {
      readyRef.current?.();
      if (!freeze) sc.handoff(!handoff || reduced.current);
      tick();
    });
    setScene(sc);
    window.addEventListener("resize", fit);
    const layers = [bgRef.current, mainRef.current, hudRef.current];
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
      for (const el of layers) el?.replaceChildren();
    };
  }, [introFont, uiFont, handoff]);

  // ---------- service status (gate only) ----------
  useEffect(() => {
    if (!scene || (phase !== "gate" && phase !== "verifying")) return;
    let stop = false;
    let timer = 0;
    const check = async () => {
      const r = await health();
      if (stop) return;
      setOnline(r.ok);
      timer = window.setTimeout(check, r.ok ? 15000 : 4000);
    };
    void check();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [scene, phase]);

  useEffect(() => {
    if (!scene || phase !== "gate" || online === null) return;
    // after the hand-off has settled its own label; a denial keeps its own label
    const id = setTimeout(() => {
      if (scene.status === "idle") scene.hudLabel(online ? "AWAITING ID · 等待身份" : "OFFLINE · 学籍服务未连接");
    }, handoff ? 700 : 0);
    return () => clearTimeout(id);
  }, [scene, phase, online, handoff]);

  // ---------- identity ----------
  const login = useCallback(
    async (raw: string) => {
      if (!scene || phase !== "gate") return;
      const id = raw.trim();
      if (!id) return;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
        scene.setStatus("denied", { label: "INVALID · 格式无效", sub: "学号/教师号只含字母与数字" });
        return;
      }
      setPhase("verifying");
      scene.setStatus("verifying");
      const t0 = now();
      const r = await createSession(id);
      // let the scan finish at least one pass so the check reads
      await wait(Math.max(0, 0.95 - (now() - t0)) * 1000);
      if (r.ok && r.identity) {
        const who = r.identity;
        setIdentity(who);
        setOnline(true);
        scene.confirm({ role: who.role, display: who.display, ref_id: who.ref_id, dept: deptOf(who.scope_text) }, reduced.current);
        setPhase("entering");
        const R = reduced.current ? 0 : 1;
        setTimeout(() => setEntered(true), T_CONFIRM.build * 1000 * R);
        setTimeout(() => setPhase("console"), (T_CONFIRM.move + T_CONFIRM.moveDur + 0.08) * 1000 * R);
        return;
      }
      setPhase("gate");
      if (r.code === "OFFLINE" || r.http === 503) {
        setOnline(false);
        scene.setStatus("denied", { label: "OFFLINE · 服务未连接", sub: "学籍服务未启动 · 请在 backend/ 运行 bun dev" });
      } else {
        scene.setStatus("denied", { label: "DENIED · 身份无效", sub: r.text || "无法验证该身份" });
      }
    },
    [scene, phase],
  );

  const logout = useCallback(async () => {
    if (!scene || phase !== "console") return;
    setAway(false);
    setPhase("leaving");
    void deleteSession();
    await wait(reduced.current ? 0 : 260);
    setEntered(false);
    scene.toGate(reduced.current);
    setIdentity(null);
    await wait(reduced.current ? 0 : 700);
    setGateKey((k) => k + 1);
    setPhase("gate");
  }, [scene, phase]);

  /** The server dropped the session (expired / identity changed): back to the gate. */
  const expired = useCallback(async () => {
    if (!scene) return;
    setPhase("leaving");
    setEntered(false);
    scene.toGate(reduced.current);
    setIdentity(null);
    await wait(reduced.current ? 0 : 700);
    setGateKey((k) => k + 1);
    setPhase("gate");
    scene.setStatus("denied", { label: "EXPIRED · 会话已过期", sub: "会话已失效，请重新验证身份" });
  }, [scene]);

  // ---------- backstage (admin only): a layer over the console, handed the chip and the rule ----------
  useEffect(() => {
    if (identity?.role === "ADMIN") void loadBackstage();
  }, [identity]);

  const openBackstage = useCallback(() => {
    if (!scene || phase !== "console" || identity?.role !== "ADMIN") return;
    const r = reduced.current;
    (document.activeElement as HTMLElement | null)?.blur();
    const geo = scene.toBackstage(r);
    setAway(true);
    // the console collapses first; the backstage then takes over an identical frame
    void loadBackstage().then(() => setTimeout(() => setBackstage({ ...geo, at: Date.now() }), r ? 0 : 340));
  }, [scene, phase, identity]);

  const closeBackstage = useCallback(
    (how: "back" | "signout") => {
      setBackstage(null);
      if (!scene || !identity) return;
      if (how === "signout") {
        void logout();
        return;
      }
      scene.fromBackstage({ role: identity.role, display: identity.display, ref_id: identity.ref_id, dept: deptOf(identity.scope_text) }, reduced.current);
      setAway(false);
    },
    [scene, identity, logout],
  );

  useEffect(() => {
    if (!scene) return;
    window.__xueji = { login: (id) => void login(id), scene: () => scene };
    return () => {
      delete window.__xueji;
    };
  }, [scene, login]);

  const showGate = phase === "gate" || phase === "verifying" || phase === "entering";

  return (
    <div ref={rootRef} className="xj-root" data-phase={phase}>
      <div ref={frameRef} className="xj-frame">
        <svg ref={bgRef} className="xj-layer" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" />
        <svg ref={mainRef} className="xj-layer" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" textRendering="geometricPrecision" />
        <div className="xj-ui">
          {scene && showGate && (
            <Gate
              key={gateKey}
              scene={scene}
              intro={handoff && gateKey === 0}
              busy={phase !== "gate"}
              leaving={phase === "entering"}
              online={online}
              onSubmit={login}
            />
          )}
          {scene && identity && entered && (
            <Console
              scene={scene}
              identity={identity}
              leaving={phase === "leaving"}
              live={phase === "console"}
              away={away}
              onExit={logout}
              onExpired={expired}
              onBackstage={identity.role === "ADMIN" ? openBackstage : undefined}
            />
          )}
        </div>
        <svg ref={hudRef} className="xj-layer xj-hud" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" textRendering="geometricPrecision" />
      </div>
      <div className="xj-screen" aria-hidden="true" />
      {backstage && <Backstage uiFont={uiFont} handoff={backstage} onClose={closeBackstage} />}
    </div>
  );
}
