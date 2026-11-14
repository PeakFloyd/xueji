import { backend, body, clearSession, getSession, json, offline, readJson, setSession } from "@/lib/agent-server";

const ID = /^[A-Za-z0-9_-]{1,64}$/;

async function dropBackendSession(id: string | undefined) {
  if (!id) return;
  try {
    await backend(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch {
    // backend gone: nothing to delete
  }
}

/** Create a session for a 学号/教师号. Switching identity deletes the previous session first. */
export async function POST(request: Request) {
  const b = await body(request);
  const user = typeof b?.user === "string" ? b.user.trim() : "";
  if (!ID.test(user)) {
    return json({ ok: false, status: "ERROR", code: "INVALID", error: "身份编号格式无效", text: "请输入学号或教师号（字母、数字）", data: [] }, 400);
  }
  await dropBackendSession(await getSession());
  await clearSession();

  let res: Response;
  try {
    res = await backend("/api/sessions", { method: "POST", body: JSON.stringify({ user }) });
  } catch (e) {
    return json(offline(e instanceof Error ? e.message : undefined), 503);
  }
  const reply = await readJson(res);
  if (res.ok && reply.ok && typeof reply.sessionId === "string") {
    await setSession(reply.sessionId);
    const { sessionId: _drop, ...rest } = reply;
    void _drop;
    return json(rest, 201);
  }
  return json(reply, res.status);
}

/** Sign out: delete the backend session (context + pending writes) and the cookie. */
export async function DELETE() {
  await dropBackendSession(await getSession());
  await clearSession();
  return json({ ok: true, status: "OK", text: "已退出", data: [] });
}
