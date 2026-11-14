// Browser side of /api/xueji/admin/schema. The session cookie is the one the main interface uses, so an
// administrator signed in on the console arrives here already authorised.
import type { Identity } from "../xueji/types";
import type { Snapshot } from "./model";

export type SchemaReply = {
  ok: boolean;
  status: string;
  code?: string;
  text: string;
  http: number;
  identity?: Identity;
  schema?: Snapshot;
};

export async function fetchSchema(): Promise<SchemaReply> {
  try {
    const res = await fetch("/api/xueji/admin/schema", { cache: "no-store" });
    let body: Partial<SchemaReply> = {};
    try {
      body = (await res.json()) as Partial<SchemaReply>;
    } catch {
      body = { ok: false, status: "ERROR", text: "服务返回了无法解析的响应" };
    }
    const schema = body.schema;
    const valid = !!schema && Array.isArray(schema.objects) && Array.isArray(schema.pages) && !!schema.file;
    return { ok: !!body.ok && valid, status: body.status ?? "ERROR", code: body.code, text: body.text ?? "", http: res.status, identity: body.identity, schema: valid ? schema : undefined };
  } catch {
    return { ok: false, status: "ERROR", code: "OFFLINE", text: "无法连接前端服务", http: 0 };
  }
}

/** Where the console's chip and rule are when it hands over to the backstage (scene.toBackstage). */
export type Handoff = {
  chip: { x: number; y: number; h: number; size: number; text: string };
  rule: { x: number; y: number; w: number; h: number };
  label: string;
  tc: number;
  at: number;
};
