import { connection } from "next/server";
import { backend, json, offline, readJson } from "@/lib/agent-server";

export async function GET() {
  await connection();
  try {
    const res = await backend("/api/health", { signal: AbortSignal.timeout(2500) });
    return json(await readJson(res), res.status);
  } catch (e) {
    return json(offline(e instanceof Error ? e.message : undefined), 503);
  }
}
