// Server-side bridge to the 学籍 Agent backend (docs/API.md).
// Server-only (imported by Route Handlers). The browser never sees the backend sessionId: it lives in an httpOnly cookie scoped to /api/xueji.
import { cookies } from "next/headers";

export const AGENT_URL = process.env.AGENT_API_URL ?? "http://127.0.0.1:8090";
const COOKIE = "xueji_sid";
const SESSION_TTL_S = 30 * 60;

export type AgentJson = {
  ok: boolean;
  status: string;
  text: string;
  data: unknown[];
  code?: string;
  error?: string;
  [key: string]: unknown;
};

/** Reply used when the backend cannot be reached at all. */
export const offline = (detail?: string): AgentJson => ({
  ok: false,
  status: "ERROR",
  code: "OFFLINE",
  error: "无法连接学籍服务",
  text: `无法连接学籍服务（${AGENT_URL}）。请先在 backend/ 目录运行 bun dev。${detail ? `（${detail}）` : ""}`,
  data: [],
});

export const json = (body: AgentJson, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function backend(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${AGENT_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
}

export async function readJson(res: Response): Promise<AgentJson> {
  try {
    return (await res.json()) as AgentJson;
  } catch {
    return { ok: false, status: "ERROR", code: "ERROR", error: "后端返回了无法解析的响应", text: "后端返回了无法解析的响应", data: [] };
  }
}

export async function getSession(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

export async function setSession(id: string) {
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "strict",
    path: "/api/xueji",
    maxAge: SESSION_TTL_S,
  });
}

export async function clearSession() {
  (await cookies()).delete({ name: COOKIE, path: "/api/xueji" });
}

/** Reply for requests that arrive without a live session cookie. */
export const noSession = () =>
  json({ ok: false, status: "ERROR", code: "NO_SESSION", error: "会话不存在或已过期", text: "会话不存在或已过期，请重新验证身份", data: [] }, 401);

/** Parse a small JSON body; returns null when it is not an object. */
export async function body(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const v: unknown = await request.json();
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
