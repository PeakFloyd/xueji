import type { Layout } from "./layout";
import type { Stage } from "./stage";

/** An actor owns its elements for the whole piece and renders them as a pure function of t. */
export type Actor = (t: number) => void;
export type ActorFactory = (stage: Stage, layout: Layout) => Actor;
