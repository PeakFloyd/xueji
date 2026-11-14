// Shapes of the 学籍 Agent API (docs/API.md) as the interface consumes them.

export type Role = "STUDENT" | "TEACHER" | "ADMIN";

export type Identity = {
  role: Role;
  ref_id: string;
  display: string;
  address: string;
  scope_text: string;
};

export type Status =
  | "OK"
  | "CHAT"
  | "PENDING_CONFIRM"
  | "WRITE_DONE"
  | "WRITE_CANCELLED"
  | "DENIED"
  | "NOT_FOUND"
  | "ERROR";

export type Fact = { kind: string; [key: string]: unknown };

export type Pending = { token: string; expiresAt: number; ability: string; preview: Fact };

export type Reply = {
  ok: boolean;
  status: Status;
  text: string;
  data: Fact[];
  code?: string;
  error?: string;
  alternatives?: string[];
  pending?: Pending;
  identity?: Identity;
  expiresAt?: number;
};

export type ToolRun = { id: string; name: string; state: "run" | "done" | "error"; t0: number; t1?: number };

/** One question and everything that happened to it. */
export type Entry = {
  id: number;
  seq: number;
  query: string;
  /** Who asked: the user, or the console's opening briefing. */
  origin: "user" | "briefing";
  phase: "sent" | "running" | "done";
  t0: number;
  t1?: number;
  tools: ToolRun[];
  draft: string;
  reply?: Reply;
  /** Result of an explicit confirm/cancel of this entry's pending write. */
  confirm?: { state: "sending" | "done"; reply?: Reply; approved: boolean };
  /** A newer question was sent, so the server discarded this entry's pending write. */
  superseded?: boolean;
};
