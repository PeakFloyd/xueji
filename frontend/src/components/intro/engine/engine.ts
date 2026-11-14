import { CX, CY, DURATION } from "./constants";
import { attr, css } from "./dom";
import { clamp } from "./ease";
import { makeLayout } from "./layout";
import { createStage, fitStage } from "./stage";
import type { Actor } from "./types";
import { block3d } from "./actors/block3d";
import { data } from "./actors/data";
import { frame } from "./actors/frame";
import { kinetic } from "./actors/kinetic";
import { seal } from "./actors/seal";
import { title } from "./actors/title";

/**
 * One camera rule for the whole piece: a constant, decelerating push-in that never cuts.
 * Transitions are carried by the shapes themselves, never by the camera.
 */
export const camera = (t: number) => {
  const x = clamp(t / DURATION);
  // eases in strongly but keeps a residual drift right up to the last frame (no dead stop)
  return 1 + 0.06 * (0.3 * x + 0.7 * (1 - (1 - x) ** 2));
};

export type Engine = {
  render: (t: number) => void;
  /** Refit to the viewport; returns the stage scale. */
  resize: () => number;
  destroy: () => void;
};

/** Build the scene inside `root`. Fonts must already be loaded (layout is measured once). */
export function createEngine(root: HTMLElement, font: string): Engine {
  const stage = createStage(root, font);
  const layout = makeLayout(stage);
  const actors: Actor[] = [frame, kinetic, seal, block3d, data, title].map((f) => f(stage, layout));

  const render = (t: number) => {
    const k = camera(t);
    attr(stage.cam, "transform", `translate(${CX} ${CY}) scale(${k}) translate(${-CX} ${-CY})`);
    css(stage.cam3d, "transform", `scale(${k.toFixed(5)})`);
    for (const a of actors) a(t);
  };
  const resize = () => fitStage(stage, root.clientWidth, root.clientHeight);
  resize();

  return {
    render,
    resize,
    destroy: () => stage.frame.remove(),
  };
}
