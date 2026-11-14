// Browser side of the Next.js proxy in src/app/api/xueji (which holds the backend sessionId in an
// httpOnly cookie). Every call resolves to a Reply - network failures become ok:false replies too.
import type { Reply } from "./types";

const BASE = "/api/xueji";

const failure = (text: string, code = "ERROR"): Reply => ({ ok: false, status: "ERROR", code, error: text, text, data: [] });

async function call(path: string, init?: RequestInit): Promise<Reply & { http: number }> {
  try {
    const res = await fetch(BASE + path, { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
    let body: Reply;
    try {
      body = (await res.json()) as Reply;
    } catch {
      body = failure("服务返回了无法解析的响应");
    }
    return { ...body, data: Array.isArray(body.data) ? body.data : [], http: res.status };
  } catch {
    return { ...failure("无法连接前端服务", "OFFLINE"), http: 0 };
  }
}

export const health = () => call("/health");

export const createSession = (user: string) => call("/session", { method: "POST", body: JSON.stringify({ user }) });

export const deleteSession = () => call("/session", { method: "DELETE" });

export const confirmWrite = (token: string, confirm: boolean) =>
  call("/confirm", { method: "POST", body: JSON.stringify({ token, confirm }) });

export type StreamHandlers = {
  onProgress?: () => void;
  onDelta?: (delta: string) => void;
  onToolStart?: (id: string, name: string) => void;
  onToolEnd?: (id: string, name: string, isError: boolean) => void;
};

/**
 * One agent turn over POST + text/event-stream (EventSource cannot POST). Intermediate events only
 * drive the progress display; the resolved Reply is always the authoritative `done` payload.
 */
export async function chat(message: string, h: StreamHandlers, signal?: AbortSignal): Promise<Reply & { http: number }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal,
    });
  } catch {
    return { ...failure("无法连接前端服务", "OFFLINE"), http: 0 };
  }
  const type = res.headers.get("content-type") ?? "";
  if (!type.includes("text/event-stream") || !res.body) {
    try {
      const body = (await res.json()) as Reply;
      return { ...body, data: Array.isArray(body.data) ? body.data : [], http: res.status };
    } catch {
      return { ...failure(`请求失败（HTTP ${res.status}）`), http: res.status };
    }
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  let done: Reply | null = null;
  const handle = (block: string) => {
    let event = "message";
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(data.join("\n"));
    } catch {
      return;
    }
    if (event === "progress") h.onProgress?.();
    else if (event === "delta" && typeof payload.delta === "string") h.onDelta?.(payload.delta);
    else if (event === "tool_start") h.onToolStart?.(String(payload.toolCallId), String(payload.toolName));
    else if (event === "tool_end") h.onToolEnd?.(String(payload.toolCallId), String(payload.toolName), payload.isError === true);
    else if (event === "done") done = payload as unknown as Reply;
  };
  try {
    for (;;) {
      const { value, done: end } = await reader.read();
      if (end) break;
      buf += value;
      let i: number;
      while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
        handle(buf.slice(0, i));
        buf = buf.slice(i).replace(/^\r?\n\r?\n/, "");
      }
    }
    if (buf.trim()) handle(buf);
  } catch {
    if (signal?.aborted) return { ...failure("已取消"), http: 499 };
  }
  const final = done as Reply | null;
  if (!final) return { ...failure("连接在完成前中断，结果未知；未确认的写入不会执行"), http: res.status };
  return { ...final, data: Array.isArray(final.data) ? final.data : [], http: res.status };
}
