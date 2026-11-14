import { backend, body, clearSession, getSession, json, noSession, offline, readJson } from "@/lib/agent-server";

/**
 * Streams one agent turn (POST /api/chat/stream) back to the browser as text/event-stream.
 * The client parses `progress | delta | tool_start | tool_end | done`; only `done` is authoritative.
 */
export async function POST(request: Request) {
  const sessionId = await getSession();
  if (!sessionId) return noSession();
  const b = await body(request);
  const message = typeof b?.message === "string" ? b.message : "";
  if (!message.trim() || message.length > 4000) {
    return json({ ok: false, status: "ERROR", code: "INVALID", error: "问题需为 1–4000 字", text: "问题需为 1–4000 字", data: [] }, 400);
  }

  let res: Response;
  try {
    res = await backend("/api/chat/stream", {
      method: "POST",
      body: JSON.stringify({ sessionId, message }),
      signal: request.signal,
    });
  } catch (e) {
    if (request.signal.aborted) return new Response(null, { status: 499 });
    return json(offline(e instanceof Error ? e.message : undefined), 503);
  }

  const type = res.headers.get("content-type") ?? "";
  if (!res.ok || !type.includes("text/event-stream") || !res.body) {
    const reply = await readJson(res);
    if (res.status === 404 || res.status === 403) await clearSession();
    return json(reply, res.status === 200 ? 502 : res.status);
  }
  return new Response(res.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
