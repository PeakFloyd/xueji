import { describe, expect, test } from "bun:test";
import { createModels, fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import { PythonBridge, type BridgeRequest } from "../src/bridge";
import { BackendService, type ApiReply } from "../src/server";

const STUDENT = { role: "STUDENT", ref_id: "S001", display: "小明", address: "小明同学", scope_text: "本人" };
const ADMIN = { role: "ADMIN", ref_id: "T001", display: "老师", address: "老师", scope_text: "全校数据" };
const CREDIT = { name: "my_credit", roles: ["STUDENT"], args: {}, doc: "查询本人学分", write: false };
const OTHER_CREDIT = { name: "student_credit_of", roles: ["ADMIN"], args: { stu_id: "学号" }, doc: "查询其他学生学分", write: false };
const ADD_STUDENT = { name: "add_student", roles: ["ADMIN"],
  args: { stu_id: "学号", stu_name: "姓名", gender: "性别", class_id: "班号" }, doc: "新增学生", write: true };
const SNAPSHOT = { file: { name: "xueji.db", page_count: 32 }, objects: [{ name: "student", type: "table", row_count: 50 }], pages: [] };
const NEW_STUDENT = { stu_id: "20240012", stu_name: "小王", gender: "男", class_id: "CS2301" };

function harness(user = "S001") {
  let now = 100_000;
  let identity = user === "T001" ? ADMIN : STUDENT;
  let previewRevision = 1;
  const requests: BridgeRequest[] = [];
  const bridge = new PythonBridge(async (request) => {
    requests.push(request);
    if (request.action === "identity") return { ok: true, identity };
    if (request.action === "catalog") return { ok: true, catalog: [CREDIT, OTHER_CREDIT, ADD_STUDENT] };
    if (request.action === "schema") {
      return identity.role === "ADMIN" ? { ok: true, schema: SNAPSHOT } : { ok: false, code: "DENIED", error: "仅管理员可以查看后台库表结构" };
    }
    if (request.ability === "my_credit" && request.mode === "read") {
      return { ok: true, fact: { kind: "credit", earned: 32 }, text: "已修32学分" };
    }
    if (request.ability === "student_credit_of" && request.mode === "read") {
      return { ok: false, code: "DENIED", error: "不能查询其他同学的成绩", alternatives: ["查询自己的学分"] };
    }
    if (request.ability === "add_student" && request.mode === "preview") {
      return { ok: true, fact: { kind: "write_preview", action: "新增学籍", fields: request.args, revision: previewRevision }, text: "预览新增小王" };
    }
    if (request.ability === "add_student" && request.mode === "execute") {
      return { ok: true, fact: { kind: "write_done", action: "新增学籍" }, text: "已新增小王" };
    }
    return { ok: false, code: "INVALID", error: "调用方式不正确" };
  });
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel();
  const service = new BackendService({ bridge, models, provider: model.provider, model: model.id, now: () => now });
  const post = async (path: string, body: object, origin = "http://localhost:3000") => {
    const response = await service.fetch(new Request(`http://localhost:8090${path}`, {
      method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body),
    }));
    return { httpStatus: response.status, body: await response.json() as ApiReply };
  };
  return { user, service, post, requests, faux, setIdentity: (next: typeof STUDENT | typeof ADMIN) => { identity = next; },
    advance: (ms: number) => { now += ms; }, setPreviewRevision: (revision: number) => { previewRevision = revision; } };
}

interface SessionRequester {
  user: string;
  post: (path: string, body: object) => Promise<{ httpStatus: number; body: ApiReply }>;
}

async function session(h: SessionRequester): Promise<string> {
  const created = await h.post("/api/sessions", { user: h.user });
  expect(created.httpStatus).toBe(201);
  expect(created.body.identity?.ref_id).toBe(h.user);
  return created.body.sessionId!;
}

describe("Pi-backed HTTP API and Python bridge boundary", () => {
  test("real Agent tool calls return deterministic fact text, never fabricated model numbers", async () => {
    const h = harness();
    h.faux.setResponses([
      fauxAssistantMessage([fauxToolCall("my_credit", {})], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("你已修999学分")]),
    ]);
    const sessionId = await session(h);
    const result = await h.post("/api/chat", { sessionId, message: "我有多少学分？" });
    expect(result.body.status).toBe("OK");
    expect(result.body.text).toBe("已修32学分");
    expect(result.body.data).toEqual([{ kind: "credit", earned: 32 }]);
    expect(h.requests.filter((request) => request.action === "identity")).toHaveLength(2);
    expect(h.requests.filter((request) => request.action === "invoke").map((request) => request.mode)).toEqual(["read"]);
  });

  test("keeps successful facts alongside an explicit bridge denial", async () => {
    const h = harness();
    h.faux.setResponses([
      fauxAssistantMessage([
        fauxToolCall("my_credit", {}),
        fauxToolCall("student_credit_of", { stu_id: "OTHER" }),
      ], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("抱歉，无法查询其他同学")]),
    ]);
    const sessionId = await session(h);
    const result = await h.post("/api/chat", { sessionId, message: "我的学分和另一同学的呢？" });
    expect(result.body.status).toBe("DENIED");
    expect(result.body.text).toContain("已修32学分");
    expect(result.body.text).toContain("不能查询其他同学的成绩");
    expect(result.body.data).toEqual([{ kind: "credit", earned: 32 }]);
    expect(result.body.alternatives).toEqual(["查询自己的学分"]);
  });

  test("write tool previews only; token confirmation alone performs execute", async () => {
    const h = harness("T001");
    h.faux.setResponses([
      fauxAssistantMessage([fauxToolCall("add_student", NEW_STUDENT)], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("已创建学籍")]),
    ]);
    const sessionId = await session(h);
    const preview = await h.post("/api/chat", { sessionId, message: "新增小王学籍" });
    expect(preview.body.status).toBe("PENDING_CONFIRM");
    expect(preview.body.text).toBe("预览新增小王");
    expect(preview.body.pending?.token).toMatch(/^[a-f0-9-]{36}$/);
    expect(h.requests.filter((request) => request.action === "invoke" && request.mode === "execute")).toHaveLength(0);
    const wrong = await h.post("/api/confirm", { sessionId, token: crypto.randomUUID(), confirm: true });
    expect(wrong.httpStatus).toBe(403);
    const done = await h.post("/api/confirm", { sessionId, token: preview.body.pending!.token, confirm: true });
    expect(done.body.status).toBe("WRITE_DONE");
    expect(done.body.data).toEqual([{ kind: "write_done", action: "新增学籍" }]);
    expect(h.requests.filter((request) => request.action === "invoke").map((request) => request.mode))
      .toEqual(["preview", "preview", "execute"]);
    const replay = await h.post("/api/confirm", { sessionId, token: preview.body.pending!.token, confirm: true });
    expect(replay.httpStatus).toBe(403);
  });

  test("changed write preview rotates confirmation token before execution", async () => {
    const h = harness("T001");
    h.faux.setResponses([
      fauxAssistantMessage([fauxToolCall("add_student", NEW_STUDENT)], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("预览")]),
    ]);
    const sessionId = await session(h);
    const first = await h.post("/api/chat", { sessionId, message: "新增学籍" });
    h.setPreviewRevision(2);
    const refreshed = await h.post("/api/confirm", { sessionId, token: first.body.pending!.token, confirm: true });
    expect(refreshed.body.status).toBe("PENDING_CONFIRM");
    expect(refreshed.body.pending?.token).not.toBe(first.body.pending!.token);
    expect(refreshed.body.pending?.preview.revision).toBe(2);
    expect(h.requests.filter((request) => request.action === "invoke" && request.mode === "execute")).toHaveLength(0);
    const done = await h.post("/api/confirm", { sessionId, token: refreshed.body.pending!.token, confirm: true });
    expect(done.body.status).toBe("WRITE_DONE");
  });

  test("cancel, new messages, and token expiry cannot execute writes", async () => {
    const h = harness("T001");
    h.faux.setResponses([
      fauxAssistantMessage([fauxToolCall("add_student", NEW_STUDENT)], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("预览")]),
      fauxAssistantMessage([fauxToolCall("add_student", NEW_STUDENT)], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("预览")]),
      fauxAssistantMessage([fauxText("你好")]),
      fauxAssistantMessage([fauxToolCall("add_student", NEW_STUDENT)], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("预览")]),
    ]);
    const sessionId = await session(h);
    const first = await h.post("/api/chat", { sessionId, message: "预览新增" });
    const cancelled = await h.post("/api/confirm", { sessionId, token: first.body.pending!.token, confirm: false });
    expect(cancelled.body.status).toBe("WRITE_CANCELLED");
    const second = await h.post("/api/chat", { sessionId, message: "预览再次新增" });
    await h.post("/api/chat", { sessionId, message: "你好" });
    const stale = await h.post("/api/confirm", { sessionId, token: second.body.pending!.token, confirm: true });
    expect(stale.httpStatus).toBe(403);
    const third = await h.post("/api/chat", { sessionId, message: "预览第三次新增" });
    h.advance(300_001);
    const expired = await h.post("/api/confirm", { sessionId, token: third.body.pending!.token, confirm: true });
    expect(expired.httpStatus).toBe(410);
    expect(h.requests.filter((request) => request.action === "invoke" && request.mode === "execute")).toHaveLength(0);
  });

  test("conceptual explanations do not require a database tool", async () => {
    const h = harness();
    h.faux.setResponses([fauxAssistantMessage([fauxText("学分是衡量课程学习量的单位。")])]);
    const sessionId = await session(h);
    const reply = await h.post("/api/chat", { sessionId, message: "什么是学分？" });
    expect(reply.body.status).toBe("CHAT");
    expect(reply.body.text).toContain("衡量课程学习量");
    expect(h.requests.some((request) => request.action === "invoke")).toBe(false);
  });

  test("model explanations mentioning restrictions remain replies without a failed ability", async () => {
    const h = harness();
    const answer = "您好！我可以查询您的学分和课程，不能查询其他同学成绩。";
    h.faux.setResponses([fauxAssistantMessage([fauxText(answer)])]);
    const sessionId = await session(h);
    const reply = await h.post("/api/chat", { sessionId, message: "你可以帮我查询哪些内容？" });
    expect(reply.body.status).toBe("CHAT");
    expect(reply.body.ok).toBe(true);
    expect(reply.body.text).toBe(answer);
    expect(reply.body.data).toEqual([]);
    expect(h.requests.some((request) => request.action === "invoke")).toBe(false);
  });

  test("repeated model tool calls stop at the turn budget without creating a write token", async () => {
    const h = harness("T001");
    h.faux.setResponses(Array.from({ length: 20 }, () =>
      fauxAssistantMessage([fauxToolCall("add_student", NEW_STUDENT)], { stopReason: "toolUse" })));
    const sessionId = await session(h);
    const result = await h.post("/api/chat", { sessionId, message: "不断新增小王" });
    expect(result.body.status).toBe("ERROR");
    expect(result.body.pending).toBeUndefined();
    expect(result.body.text).toContain("上限");
    expect(h.faux.state.callCount).toBe(8);
    expect(h.requests.filter((request) => request.action === "invoke" && request.mode === "preview")).toHaveLength(1);
    expect(h.requests.filter((request) => request.action === "invoke" && request.mode === "execute")).toHaveLength(0);
  });

  test("health, session deletion, and request shape protect the session identity", async () => {
    const h = harness();
    const health = await h.service.fetch(new Request("http://localhost:8090/api/health"));
    expect((await health.json() as ApiReply).status).toBe("OK");
    const sessionId = await session(h);
    const switched = await h.post("/api/chat", { sessionId, message: "你好", user: "T001" });
    expect(switched.httpStatus).toBe(400);
    const deleted = await h.service.fetch(new Request(`http://localhost:8090/api/sessions/${sessionId}`, {
      method: "DELETE", headers: { origin: "http://localhost:3000" },
    }));
    expect((await deleted.json() as ApiReply).status).toBe("OK");
    expect(h.requests.filter((request) => request.action === "identity")).toHaveLength(2);
    expect((await h.post("/api/chat", { sessionId, message: "你好" })).httpStatus).toBe(404);
  });

  test("SSE ends with authoritative done event and validates origin and identity", async () => {
    const h = harness();
    h.faux.setResponses([
      fauxAssistantMessage([fauxToolCall("my_credit", {})], { stopReason: "toolUse" }),
      fauxAssistantMessage([fauxText("999学分")]),
    ]);
    const sessionId = await session(h);
    const invalidOrigin = await h.post("/api/chat", { sessionId, message: "您好" }, "https://example.com");
    expect(invalidOrigin.httpStatus).toBe(403);
    const stream = await h.service.fetch(new Request("http://localhost:8090/api/chat/stream", {
      method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ sessionId, message: "我的学分？" }),
    }));
    const events = (await stream.text()).split("\n\n").filter(Boolean);
    expect(events.some((event) => event.startsWith("event: delta\n"))).toBe(true);
    expect(events.some((event) => event.startsWith("event: tool_start\n"))).toBe(true);
    expect(events.some((event) => event.startsWith("event: tool_end\n"))).toBe(true);
    expect(events.at(-1)).toContain("event: done\n");
    const done = JSON.parse(events.at(-1)!.split("data: ")[1]) as ApiReply;
    expect(done.status).toBe("OK");
    expect(done.data).toEqual([{ kind: "credit", earned: 32 }]);
    expect(done.text).toBe("已修32学分");
    h.setIdentity(ADMIN);
    const changed = await h.post("/api/chat", { sessionId, message: "你好" });
    expect(changed.httpStatus).toBe(403);
    const removed = await h.post("/api/chat", { sessionId, message: "你好" });
    expect(removed.httpStatus).toBe(404);
  });

  test("backstage schema snapshot is admin-only and re-verifies the session identity", async () => {
    const get = (h: ReturnType<typeof harness>, id: string) =>
      h.service.fetch(new Request(`http://localhost:8090/api/sessions/${id}/schema`));
    const student = harness();
    const studentSession = await session(student);
    const denied = await get(student, studentSession);
    expect(denied.status).toBe(403);
    expect((await denied.json() as ApiReply).status).toBe("DENIED");
    expect(student.requests.some((request) => request.action === "schema")).toBe(false);

    const admin = harness("T001");
    const adminSession = await session(admin);
    const ok = await get(admin, adminSession);
    expect(ok.status).toBe(200);
    const reply = await ok.json() as ApiReply;
    expect(reply.status).toBe("OK");
    expect(reply.schema).toEqual(SNAPSHOT);
    expect(reply.sessionId).toBeUndefined();
    expect(admin.requests.filter((request) => request.action === "schema")).toHaveLength(1);

    expect((await get(admin, "not-a-uuid")).status).toBe(400);
    admin.setIdentity(STUDENT);
    expect((await get(admin, adminSession)).status).toBe(403);
    expect((await get(admin, adminSession)).status).toBe(404);
  });
});
