import { fileURLToPath } from "node:url";

export type Role = "STUDENT" | "TEACHER" | "ADMIN";
export type BridgeCode = "DENIED" | "NOT_FOUND" | "INVALID" | "ERROR";
export type JsonObject = Record<string, unknown>;

export interface Identity {
  role: Role;
  ref_id: string;
  display: string;
  address: string;
  scope_text: string;
}

export interface Ability {
  name: string;
  roles: Role[];
  args: Record<string, string>;
  doc: string;
  write: boolean;
}

export interface Invocation {
  fact: JsonObject;
  text: string;
}

export class BridgeError extends Error {
  constructor(
    public readonly code: BridgeCode,
    message: string,
    public readonly alternatives: string[] = [],
  ) {
    super(message);
    this.name = "BridgeError";
  }
}

const PROJECT_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const BRIDGE_PATH = fileURLToPath(new URL("../../ai/tool_bridge.py", import.meta.url));
const MAX_OUTPUT_BYTES = 1024 * 1024;
const BRIDGE_TIMEOUT_MS = 15_000;

function record(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function limitedText(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new BridgeError("ERROR", "Python 桥接响应超过大小限制");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export type BridgeRequest =
  | { action: "identity"; user: string }
  | { action: "catalog"; user: string }
  | { action: "schema"; user: string }
  | { action: "invoke"; user: string; ability: string; args: JsonObject; mode: "read" | "preview" | "execute" };

export type BridgeTransport = (request: BridgeRequest, signal?: AbortSignal) => Promise<unknown>;

export const pythonTransport: BridgeTransport = async (request, signal) => {
  if (signal?.aborted) throw new BridgeError("ERROR", "请求已取消");
  const child = Bun.spawn([process.env.PYTHON || "python", BRIDGE_PATH], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, BRIDGE_TIMEOUT_MS);
  const abort = () => child.kill();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    child.stdin.write(`${JSON.stringify(request)}\n`);
    await child.stdin.end();
    const [stdout, , exitCode] = await Promise.all([
      limitedText(child.stdout, MAX_OUTPUT_BYTES),
      limitedText(child.stderr, 8192),
      child.exited,
    ]);
    if (timedOut) throw new BridgeError("ERROR", "Python 桥接调用超时");
    if (signal?.aborted) throw new BridgeError("ERROR", "请求已取消");
    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      throw new BridgeError("ERROR", "Python 桥接返回了无效 JSON");
    }
    if (exitCode !== 0 && (!record(parsed) || parsed.ok !== false)) {
      throw new BridgeError("ERROR", "Python 桥接执行失败");
    }
    return parsed;
  } catch (error) {
    child.kill();
    if (error instanceof BridgeError) throw error;
    throw new BridgeError("ERROR", "Python 桥接不可用");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
};

export class PythonBridge {
  constructor(private readonly transport: BridgeTransport = pythonTransport) {}

  private async request<T>(payload: BridgeRequest, parse: (value: JsonObject) => T, signal?: AbortSignal): Promise<T> {
    const result = await this.transport(payload, signal);
    if (!record(result) || typeof result.ok !== "boolean") {
      throw new BridgeError("ERROR", "Python 桥接响应格式无效");
    }
    if (!result.ok) {
      const code: BridgeCode = ["DENIED", "NOT_FOUND", "INVALID", "ERROR"].includes(String(result.code))
        ? result.code as BridgeCode : "ERROR";
      throw new BridgeError(code, typeof result.error === "string" ? result.error : "Python 桥接调用失败",
        Array.isArray(result.alternatives) ? result.alternatives.filter((item): item is string => typeof item === "string") : []);
    }
    return parse(result);
  }

  identity(user: string): Promise<Identity> {
    return this.request({ action: "identity", user }, (value) => {
      const identity = value.identity;
      if (!record(identity) || !["STUDENT", "TEACHER", "ADMIN"].includes(String(identity.role)) ||
          ![identity.ref_id, identity.display, identity.address, identity.scope_text].every((field) => typeof field === "string")) {
        throw new BridgeError("ERROR", "Python 身份响应格式无效");
      }
      return identity as unknown as Identity;
    });
  }

  catalog(user: string): Promise<Ability[]> {
    return this.request({ action: "catalog", user }, (value) => {
      if (!Array.isArray(value.catalog)) throw new BridgeError("ERROR", "Python 能力目录响应格式无效");
      return value.catalog.map((item: unknown) => {
        if (!record(item) || typeof item.name !== "string" || !/^[a-z][a-z0-9_]*$/.test(item.name) ||
            !Array.isArray(item.roles) || !item.roles.every((role) => ["STUDENT", "TEACHER", "ADMIN"].includes(role)) ||
            !record(item.args) || !Object.values(item.args).every((description) => typeof description === "string") ||
            typeof item.doc !== "string" || typeof item.write !== "boolean") {
          throw new BridgeError("ERROR", "Python 能力目录项格式无效");
        }
        return item as unknown as Ability;
      });
    });
  }

  /** Read-only snapshot of the whole database for the backstage page. The bridge refuses non-admins. */
  schema(user: string): Promise<JsonObject> {
    return this.request({ action: "schema", user }, (value) => {
      const schema = value.schema;
      if (!record(schema) || !Array.isArray(schema.objects) || !record(schema.file)) {
        throw new BridgeError("ERROR", "Python 结构快照响应格式无效");
      }
      return schema;
    });
  }

  invoke(user: string, ability: string, args: JsonObject, mode: "read" | "preview" | "execute", signal?: AbortSignal): Promise<Invocation> {
    return this.request({ action: "invoke", user, ability, args, mode }, (value) => {
      if (!record(value.fact) || typeof value.text !== "string") {
        throw new BridgeError("ERROR", "Python 能力执行响应格式无效");
      }
      return { fact: value.fact, text: value.text };
    }, signal);
  }
}
