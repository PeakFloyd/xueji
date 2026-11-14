import type { Models } from "@earendil-works/pi-ai";
import { createSessionAgent, type AgentTurn, type PendingPreview, type SessionAgent, type StreamUpdate } from "./agent";
import { BridgeError, PythonBridge, type Ability, type BridgeCode, type Identity, type JsonObject } from "./bridge";

type Status = "OK" | "CHAT" | "PENDING_CONFIRM" | "WRITE_DONE" | "WRITE_CANCELLED" | "DENIED" | "NOT_FOUND" | "ERROR";

interface PendingWrite extends PendingPreview {
  token: string;
  expiresAt: number;
}

interface Session {
  id: string;
  user: string;
  identity: Identity;
  catalog: Ability[];
  agent: SessionAgent;
  expiresAt: number;
  pending?: PendingWrite;
  queue: Promise<unknown>;
}

export interface ApiReply {
  ok: boolean;
  status: Status;
  text: string;
  data: JsonObject[];
  sessionId?: string;
  identity?: Identity;
  expiresAt?: number;
  pending?: { token: string; expiresAt: number; ability: string; preview: JsonObject };
  code?: BridgeCode;
  error?: string;
  alternatives?: string[];
}

export class HttpError extends Error {
  constructor(public readonly httpStatus: number, public readonly code: BridgeCode, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

const MAX_BODY_BYTES = 16 * 1024;
const MAX_MESSAGE_LENGTH = 4000;
const CONFIRM_TTL_MS = 300_000;
const DEFAULT_SESSION_TTL_MS = 1_800_000;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function jsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertFields(value: JsonObject, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, "INVALID", "请求包含不允许的字段");
  }
}

async function readBody(request: Request): Promise<JsonObject> {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") ?? "")) {
    throw new HttpError(415, "INVALID", "Content-Type 必须为 application/json");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_BODY_BYTES)) {
    throw new HttpError(413, "INVALID", "请求体超过 16 KiB");
  }
  if (!request.body) throw new HttpError(400, "INVALID", "缺少 JSON 请求体");
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let content = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, "INVALID", "请求体超过 16 KiB");
      content += decoder.decode(value, { stream: true });
    }
    content += decoder.decode();
    const parsed: unknown = JSON.parse(content);
    if (!jsonObject(parsed)) throw new HttpError(400, "INVALID", "JSON 请求体必须是对象");
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "INVALID", "JSON 请求体格式无效");
  } finally {
    reader.releaseLock();
  }
}

function validatedId(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID.test(value)) {
    throw new HttpError(400, "INVALID", `${field} 必须是有效 UUID`);
  }
  return value;
}

function toError(error: unknown): { httpStatus: number; reply: ApiReply } {
  const known = error instanceof HttpError || error instanceof BridgeError;
  const code = known ? error.code : "ERROR";
  const text = known ? error.message : "服务暂时不可用，请稍后重试";
  const httpStatus = error instanceof HttpError ? error.httpStatus : code === "DENIED" ? 403 : code === "NOT_FOUND" ? 404 : code === "INVALID" ? 400 : 502;
  return {
    httpStatus,
    reply: {
      ok: false,
      status: code === "DENIED" ? "DENIED" : code === "NOT_FOUND" ? "NOT_FOUND" : "ERROR",
      code,
      error: text,
      text,
      data: [],
      ...(error instanceof BridgeError && error.alternatives.length ? { alternatives: error.alternatives } : {}),
    },
  };
}

export interface BackendOptions {
  bridge?: PythonBridge;
  models?: Models;
  provider?: string;
  model?: string;
  origin?: string;
  sessionTtlMs?: number;
  now?: () => number;
}

export class BackendService {
  private readonly sessions = new Map<string, Session>();
  private readonly bridge: PythonBridge;
  private readonly origin: string;
  private readonly now: () => number;
  private readonly sessionTtlMs: number;
  private readonly modelConfig: Pick<BackendOptions, "models" | "provider" | "model">;

  constructor(options: BackendOptions = {}) {
    this.bridge = options.bridge ?? new PythonBridge();
    this.origin = options.origin ?? process.env.CORS_ORIGIN ?? "http://localhost:3000";
    this.now = options.now ?? Date.now;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    if (this.sessionTtlMs <= 0) throw new Error("SESSION_TTL_MS 必须为正数");
    this.modelConfig = { models: options.models, provider: options.provider, model: options.model };
    setInterval(() => this.expireSessions(), 60_000).unref();
  }

  private expireSessions(): void {
    const now = this.now();
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        session.agent.abort();
        this.sessions.delete(id);
      }
    }
  }

  private headers(request: Request, contentType: string): Headers {
    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Vary": "Origin",
    });
    if (request.headers.get("origin") === this.origin) headers.set("Access-Control-Allow-Origin", this.origin);
    return headers;
  }

  private response(request: Request, reply: ApiReply, status = 200): Response {
    return new Response(JSON.stringify(reply), { status, headers: this.headers(request, "application/json; charset=utf-8") });
  }

  private requireOrigin(request: Request): void {
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== this.origin) throw new HttpError(403, "DENIED", "请求来源不被允许");
  }

  private async sessionTask<T>(id: string, operation: (session: Session) => Promise<T>): Promise<T> {
    const session = this.sessions.get(id);
    if (!session) throw new HttpError(404, "NOT_FOUND", "会话不存在或已过期");
    const run = async () => {
      if (this.sessions.get(id) !== session || session.expiresAt <= this.now()) {
        this.sessions.delete(id);
        throw new HttpError(404, "NOT_FOUND", "会话不存在或已过期");
      }
      let identity: Identity;
      try {
        identity = await this.bridge.identity(session.user);
      } catch (error) {
        if (error instanceof BridgeError && (error.code === "NOT_FOUND" || error.code === "DENIED")) {
          session.agent.abort();
          this.sessions.delete(id);
        }
        throw error;
      }
      if (JSON.stringify(identity) !== JSON.stringify(session.identity)) {
        session.agent.abort();
        this.sessions.delete(id);
        throw new HttpError(403, "DENIED", "身份或权限发生变化，请重新创建会话");
      }
      session.expiresAt = this.now() + this.sessionTtlMs;
      return operation(session);
    };
    const result = session.queue.then(run, run);
    session.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private chatReply(turn: AgentTurn, session: Session): ApiReply {
    const failures = turn.failures;
    const data = turn.facts.map((item) => item.fact);
    const refusal = failures.map((failure) => failure.error).join("\n");
    const factText = turn.facts.map((item) => item.text).filter(Boolean).join("\n\n");
    const modelDenial = !data.length && refusal && /无法|不能|权限|无权|仅|不允许|sorry|cannot|access/i.test(turn.text) && !/\d/.test(turn.text)
      ? turn.text : "";
    const text = factText ? [factText, refusal].filter(Boolean).join("\n\n")
      : refusal ? [refusal, modelDenial].filter(Boolean).join("\n")
      : turn.text;
    const alternatives = [...new Set(failures.flatMap((failure) => failure.alternatives))];
    if (turn.budgetExceeded) {
      const verified = turn.facts.filter((item) => item.mode === "read");
      const warning = "模型已达到本次请求的处理上限，请缩小问题范围后重试；没有执行任何写入";
      return { ok: false, status: "ERROR", code: "ERROR", error: warning,
        text: [verified.map((item) => item.text).filter(Boolean).join("\n\n"), warning].filter(Boolean).join("\n\n"),
        data: verified.map((item) => item.fact), sessionId: session.id };
    }
    if (turn.pending) {
      const { ability, args, preview } = turn.pending;
      const token = crypto.randomUUID();
      const expiresAt = this.now() + CONFIRM_TTL_MS;
      session.pending = { token, expiresAt, ability, args, preview };
      return { ok: true, status: "PENDING_CONFIRM", text, data, sessionId: session.id,
        pending: { token, expiresAt, ability, preview: preview.fact }, ...(alternatives.length ? { alternatives } : {}) };
    }
    if (turn.modelError && !data.length && !failures.length) {
      throw new HttpError(502, "ERROR", "模型服务未能完成响应，请稍后重试");
    }
    const modelRefusal = !data.length && !failures.length && /没有.{0,8}权限|无权.{0,8}查询|不能.{0,8}查询|无法.{0,8}查询|仅管理员/.test(turn.text);
    const status: Status = failures.some((failure) => failure.code === "DENIED") ? "DENIED"
      : failures.some((failure) => failure.code === "NOT_FOUND") ? "NOT_FOUND"
      : failures.some((failure) => failure.code === "INVALID" || failure.code === "ERROR") ? "ERROR"
      : data.length ? "OK" : modelRefusal ? "DENIED" : "CHAT";
    return { ok: status === "OK" || status === "CHAT", status, text, data, sessionId: session.id,
      ...(alternatives.length ? { alternatives } : {}),
      ...(status !== "CHAT" && status !== "OK" ? { code: status === "DENIED" ? "DENIED" : status === "NOT_FOUND" ? "NOT_FOUND" : "ERROR", error: refusal || text } : {}) };
  }

  private async chat(id: string, message: string, onUpdate?: (update: StreamUpdate) => void): Promise<ApiReply> {
    return this.sessionTask(id, async (session) => {
      session.pending = undefined; // Every new message cancels the previous confirmation token.
      const turn = await session.agent.turn(message, onUpdate);
      return this.chatReply(turn, session);
    });
  }

  private async confirm(id: string, token: string, approved: boolean): Promise<ApiReply> {
    return this.sessionTask(id, async (session) => {
      const pending = session.pending;
      if (!pending || pending.token !== token) throw new HttpError(403, "DENIED", "确认凭证无效或已取消");
      session.pending = undefined; // One-use token, even when execution fails.
      if (pending.expiresAt <= this.now()) throw new HttpError(410, "INVALID", "确认凭证已过期，请重新发起预览");
      if (!approved) return { ok: true, status: "WRITE_CANCELLED", text: "操作已取消，未修改学籍", data: [], sessionId: session.id };
      const ability = session.catalog.find((item) => item.name === pending.ability);
      if (!ability?.write || !ability.roles.includes(session.identity.role)) {
        throw new HttpError(403, "DENIED", "当前身份没有该写入权限");
      }
      const preview = await this.bridge.invoke(session.user, pending.ability, pending.args, "preview");
      if (JSON.stringify(preview.fact) !== JSON.stringify(pending.preview.fact)) {
        const nextToken = crypto.randomUUID();
        const expiresAt = this.now() + CONFIRM_TTL_MS;
        session.pending = { ...pending, token: nextToken, expiresAt,
          preview: { ...pending.preview, fact: preview.fact, text: preview.text } };
        return { ok: true, status: "PENDING_CONFIRM", text: preview.text, data: [preview.fact], sessionId: id,
          pending: { token: nextToken, expiresAt, ability: pending.ability, preview: preview.fact } };
      }
      const done = await this.bridge.invoke(session.user, pending.ability, pending.args, "execute");
      return { ok: true, status: "WRITE_DONE", text: done.text, data: [done.fact], sessionId: id };
    });
  }

  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (request.method === "OPTIONS") {
        this.requireOrigin(request);
        const headers = this.headers(request, "text/plain; charset=utf-8");
        headers.set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        headers.set("Access-Control-Allow-Headers", "Content-Type");
        return new Response(null, { status: 204, headers });
      }
      if (request.method !== "GET") this.requireOrigin(request);
      this.expireSessions();
      if (request.method === "GET" && path === "/api/health") {
        return this.response(request, { ok: true, status: "OK", text: "服务可用", data: [] });
      }
      if (request.method === "POST" && path === "/api/sessions") {
        const body = await readBody(request);
        assertFields(body, ["user"]);
        if (typeof body.user !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(body.user)) {
          throw new HttpError(400, "INVALID", "user 必须是有效身份编号");
        }
        const identity = await this.bridge.identity(body.user);
        const catalog = await this.bridge.catalog(body.user);
        const agent = createSessionAgent(identity, catalog, this.bridge, this.modelConfig);
        const id = crypto.randomUUID();
        const expiresAt = this.now() + this.sessionTtlMs;
        this.sessions.set(id, { id, user: body.user, identity, catalog, agent, expiresAt, queue: Promise.resolve() });
        return this.response(request, { ok: true, status: "OK", text: "会话已创建", data: [], sessionId: id, identity, expiresAt }, 201);
      }
      if (request.method === "POST" && (path === "/api/chat" || path === "/api/chat/stream")) {
        const body = await readBody(request);
        assertFields(body, ["sessionId", "message"]);
        const id = validatedId(body.sessionId, "sessionId");
        if (typeof body.message !== "string" || !body.message.trim() || body.message.length > MAX_MESSAGE_LENGTH) {
          throw new HttpError(400, "INVALID", "message 必须为 1–4000 字符的非空文本");
        }
        const message = body.message;
        if (path === "/api/chat") return this.response(request, await this.chat(id, message));
        if (!this.sessions.has(id)) throw new HttpError(404, "NOT_FOUND", "会话不存在或已过期");
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start: (controller) => {
            const send = (event: string, payload: object) => {
              try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)); }
              catch { /* Client disconnected; the authoritative reply remains on the final done event when connected. */ }
            };
            send("progress", { status: "RUNNING", text: "正在处理请求" });
            void this.chat(id, message, (update) => {
              if (update.type === "delta") send("delta", { delta: update.delta, draft: true });
              else if (update.type === "tool_start") {
                send("tool_start", { toolCallId: update.toolCallId, toolName: update.toolName });
              } else {
                send("tool_end", { toolCallId: update.toolCallId, toolName: update.toolName, isError: update.isError });
              }
            }).then((reply) => send("done", reply),
              (error) => send("done", toError(error).reply)).finally(() => {
                try { controller.close(); } catch { /* The client already closed the stream. */ }
              });
          },
        });
        return new Response(stream, { status: 200, headers: this.headers(request, "text/event-stream; charset=utf-8") });
      }
      if (request.method === "POST" && path === "/api/confirm") {
        const body = await readBody(request);
        assertFields(body, ["sessionId", "token", "confirm"]);
        const id = validatedId(body.sessionId, "sessionId");
        const token = validatedId(body.token, "token");
        if (typeof body.confirm !== "boolean") throw new HttpError(400, "INVALID", "confirm 必须是布尔值");
        return this.response(request, await this.confirm(id, token, body.confirm));
      }
      if (request.method === "DELETE" && path.startsWith("/api/sessions/")) {
        const id = validatedId(path.slice("/api/sessions/".length), "sessionId");
        return this.response(request, await this.sessionTask(id, async (session) => {
          session.pending = undefined;
          this.sessions.delete(id);
          return { ok: true, status: "OK", text: "会话已结束", data: [], sessionId: id };
        }));
      }
      throw new HttpError(404, "NOT_FOUND", "接口不存在");
    } catch (error) {
      const { httpStatus, reply } = toError(error);
      return this.response(request, reply, httpStatus);
    }
  }
}

if (import.meta.main) {
  const port = Number(process.env.PORT ?? "8090");
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须为 1–65535");
  const ttl = Number(process.env.SESSION_TTL_MS ?? String(DEFAULT_SESSION_TTL_MS));
  if (!Number.isInteger(ttl) || ttl <= 0) throw new Error("SESSION_TTL_MS 必须为正整数");
  const service = new BackendService({ sessionTtlMs: ttl });
  Bun.serve({ hostname: process.env.HOST ?? "127.0.0.1", port, fetch: (request) => service.fetch(request) });
  console.info(`Backend listening on ${process.env.HOST ?? "127.0.0.1"}:${port}`);
}
