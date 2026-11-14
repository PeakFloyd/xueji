import { backend, body, clearSession, getSession, json, noSession, offline, readJson } from "@/lib/agent-server";

/** Explicit boolean confirmation of a previewed write. Never triggered by chat text. */
export async function POST(request: Request) {
  const sessionId = await getSession();
  if (!sessionId) return noSession();
  const b = await body(request);
  if (typeof b?.token !== "string" || typeof b?.confirm !== "boolean") {
    return json({ ok: false, status: "ERROR", code: "INVALID", error: "确认请求格式无效", text: "确认请求格式无效", data: [] }, 400);
  }
  let res: Response;
  try {
    res = await backend("/api/confirm", {
      method: "POST",
      body: JSON.stringify({ sessionId, token: b.token, confirm: b.confirm }),
    });
  } catch (e) {
    return json(offline(e instanceof Error ? e.message : undefined), 503);
  }
  const reply = await readJson(res);
  if (res.status === 404) await clearSession();
  return json(reply, res.status);
}
