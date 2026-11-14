import { backend, clearSession, getSession, json, noSession, offline, readJson } from "@/lib/agent-server";

/**
 * Backstage snapshot (GET /api/sessions/:id/schema): every table and view, its rows and the file's
 * page map. The backend re-verifies the session's identity and only answers an administrator.
 */
export async function GET() {
  const sessionId = await getSession();
  if (!sessionId) return noSession();
  let res: Response;
  try {
    res = await backend(`/api/sessions/${encodeURIComponent(sessionId)}/schema`, { signal: AbortSignal.timeout(20_000) });
  } catch (e) {
    return json(offline(e instanceof Error ? e.message : undefined), 503);
  }
  const reply = await readJson(res);
  // the backend dropped this session (expired, or the identity no longer exists)
  if (res.status === 404) await clearSession();
  const { sessionId: _drop, ...rest } = reply;
  void _drop;
  return json(rest, res.status);
}
