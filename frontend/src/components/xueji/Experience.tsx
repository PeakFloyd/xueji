"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Intro from "../intro/Intro";
import { reducedMotion } from "./anim";
import XuejiApp from "./XuejiApp";

type Props = { introFont: string; uiFont: string };

/**
 * Intro -> interface. The interface mounts on top of the intro's last frame as an exact copy of it,
 * and only once that copy is on screen is the intro removed: the hand-over is invisible, and from
 * there every element moves on into the identity gate.
 *   ?skip   start at the gate (no intro)
 */
export default function Experience({ introFont, uiFont }: Props) {
  const [stage, setStage] = useState<"intro" | "both" | "app">("intro");
  const [handoff, setHandoff] = useState(true);
  const fontReady = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    // the interface face is large; fetch it while the intro plays
    fontReady.current = Promise.all([
      document.fonts.load(`900 100px ${uiFont}`, "学籍管理系统"),
      document.fonts.load(`500 26px ${uiFont}`, "学籍"),
    ]).catch(() => undefined);
    const params = new URLSearchParams(window.location.search);
    if (params.has("capture")) return;
    // review switches: ?handoff runs the hand-off without the intro, ?freeze holds its first frame
    if (params.has("skip") || params.has("handoff") || params.has("freeze") || reducedMotion()) {
      const withHandoff = !params.has("skip");
      void fontReady.current.then(() => {
        setHandoff(withHandoff);
        setStage("app");
      });
    }
  }, [uiFont]);

  const onFinish = useCallback(() => {
    void (fontReady.current ?? Promise.resolve()).then(() => setStage((s) => (s === "intro" ? "both" : s)));
  }, []);
  // the intro stays (covered) a moment longer so its audio can finish its fade-out
  const onReady = useCallback(() => {
    setTimeout(() => setStage("app"), 700);
  }, []);

  return (
    <>
      {stage !== "app" && <Intro fontFamily={introFont} onFinish={onFinish} />}
      {stage !== "intro" && <XuejiApp fonts={{ intro: introFont, ui: uiFont }} handoff={handoff} onReady={onReady} />}
    </>
  );
}
