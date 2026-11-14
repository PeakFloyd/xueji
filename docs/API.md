# Next.js 对接 API（学籍 Agent 后端）

> 独立 Bun/TypeScript 服务；这里只定义后端协议，不修改 `frontend/`。路径均相对于 `http://127.0.0.1:8090`。

## 启动与边界

1. 在项目根目录运行 `python db\init_db.py`（已有库可跳过）；需 Python 3 与 Bun 1.4+。
2. `cd backend && bun install`；设置 `PI_PROVIDER`、`PI_MODEL` 和该提供商的服务端密钥，例如 `PI_PROVIDER=anthropic`、`PI_MODEL=claude-sonnet-4-6`、`ANTHROPIC_API_KEY=...`；运行 `bun dev`。具体环境变量参见 `backend/.env.example`。
3. 后端默认只监听 `127.0.0.1:8090`；可用 `PORT` 覆盖端口、`CORS_ORIGIN` 覆盖唯一允许的浏览器来源（默认 `http://localhost:3000`）。Next.js 可在**服务端**代理这些接口，或在本机开发时浏览器直连；模型密钥只保存在后端。
4. 当前 `user` 是演示库中的学号/教师号（例：学生 `20230001`、教师 `T002`、管理员 `T001`），**不验证密码**。sessionId 只是随机会话句柄，**不是安全登录**；不要将 API 暴露到公网。部署前须增加可信身份认证，并从认证结果派生 `user`，而不是信任浏览器传来的学号。

> 选择云模型时，用户提问及工具返回的学籍事实可能发送给模型提供商处理。正式数据上云前必须确认学校的隐私与数据合规要求；演示环境仅使用演示库。

POST 请求使用 `Content-Type: application/json`；流式调用选择 `/api/chat/stream` 路径，响应类型为 `text/event-stream`。未知身份、越权操作由服务端拒绝。只有白名单学籍能力可供模型调用；不提供任意 SQL、shell 或文件系统工具。

## 端点

### `GET /api/health`

用于本机连通性检查；返回 HTTP 200 `{"ok":true,"status":"OK","text":"服务可用","data":[]}`，不包含密钥。此端点**不验证**模型密钥或上游服务是否可用。

### `POST /api/sessions`

建立独立对话；服务端按数据库现状解析角色及访问范围。

```json
{"user":"20230001"}
```

成功时 HTTP 201：`{"ok":true,"status":"OK","text":"会话已创建","data":[],"sessionId":"<UUID>","identity":{"role":"STUDENT","ref_id":"20230001","display":"...","address":"...","scope_text":"..."}}`，另含 `expiresAt`（Unix 毫秒）。会话空闲有效期默认 30 分钟（可配 `SESSION_TTL_MS`）；会话只在进程内保存，重启即失效。切换身份应删除旧会话并重新创建，**不要跨用户复用 sessionId**。

### `POST /api/chat`

请求示例：

```json
{"sessionId":"<创建会话返回的 sessionId>","message":"我的学分和毕业还差多少？"}
```

服务端运行一次完整 Agent 工具循环，返回结构化事实 `data`（对象数组）、最终 `text` 和 `status`。查询类回答中的数字来自 Python SQL + 确定性模板，不需要前端从回答文本解析数值。同一 sessionId 保留多轮上下文，请求按到达顺序串行执行。前端发送新问题会放弃上一笔未确认写入。

写入请求（例如管理员新增/删除学籍）**只预览，不执行**，状态为 `PENDING_CONFIRM`；响应附带 `pending: {token, expiresAt, ability, preview}`，其中 `preview` 为业务事实对象。前端应显示不可逆影响，再给用户“确认/取消”两个明确按钮，不应把“确认”作为普通聊天输入。

### `POST /api/chat/stream`

请求体与 `/api/chat` 相同；使用 `fetch()` 发出 **POST** 并逐段解析 `text/event-stream`；不可直接用原生 `EventSource`（它只支持 GET）。每段事件形如 `event: 名称\ndata: JSON\n\n`。过程中的 `delta` 是模型片段，**仅以 `done` 的完整响应为权威**（数据查询可能由确定性事实模板覆盖模型文本）。

| SSE event | `data` JSON | 用法 |
|---|---|---|
| `progress` | `{"status":"RUNNING","text":"正在处理请求"}` | 显示加载状态 |
| `delta` | `{"delta":"文字片段","draft":true}` | 仅临时展示模型草稿；事实查询以 `done.text` 为准 |
| `tool_start` | `{"toolCallId":"...","toolName":"my_credit"}` | 展示正在调用的白名单工具 |
| `tool_end` | `{"toolCallId":"...","toolName":"my_credit","isError":false}` | 更新工具状态 |
| `done` | 与 `/api/chat` 相同的完整 JSON（失败时 `ok:false`） | 覆盖草稿、结束加载并更新 `data`/`pending` |

请求体总长度上限 16 KiB，`message` 限 1–4000 字符。SSE 可能在 `done` 之前发送多次 `delta` 和工具事件；这些事件均不授权写库。

### `POST /api/confirm`

只有管理员的有效预览可产生确认 token。**提交明确的布尔值**，不要用文本内容触发写入：

```json
{"sessionId":"<sessionId>","token":"<pending.token>","confirm":true}
```

`confirm:false` 表示取消。token 绑定会话、仅限一次、有效 300 秒；服务端在执行前重新验证身份/权限与数据库约束。预览对应的数据已变化时返回新的 `PENDING_CONFIRM` 与新 token，不直接执行；过期、重复或身份撤销时拒绝。成功执行 `WRITE_DONE`，取消 `WRITE_CANCELLED`；失败时不应在 UI 标记“已完成”。

### `DELETE /api/sessions/{sessionId}`

注销当前会话，清除上下文及待确认操作。身份切换时应先调用，再创建新会话。

## 状态与错误

| status | 处理建议 |
|---|---|
| `OK` | 展示 `text`，用 `data` 渲染结构化事实 |
| `CHAT` | 普通问候或无需查询的对话 |
| `PENDING_CONFIRM` | 展示 `pending.preview`，要求显式确认/取消 |
| `WRITE_DONE` / `WRITE_CANCELLED` | 更新视图或给出取消提示 |
| `DENIED` / `NOT_FOUND` | 展示拒绝/未找到信息，不重试写入 |
| `ERROR` | 展示错误提示、记录诊断，不假装已执行 |

所有 JSON 回复共有 `ok:boolean`、`status`、`text:string`、`data:object[]`；业务错误增加 `code` 与 `error`（`INVALID` / `DENIED` / `NOT_FOUND` / `ERROR`）。HTTP 4xx 用于格式错误、无效/过期会话、权限或来源错误，模型上游失败返回 502；Agent 工具的业务拒绝也可能以 HTTP 200 + `ok:false` 返回，并且仍可能有已经查到的 `data`，**必须同时检查 `ok` 并保留可展示事实**。SSE 在响应头已发送后以 `done` 携带 `ok:false` 报告失败。身份句柄和确认 token 不应写入日志或泄漏给其他用户。

## Next.js 接入顺序

1. 在服务器组件或 Route Handler 中调用 `POST /api/sessions`，把会话标识保留在当前用户的服务端会话中；若浏览器直接请求，仅在本机开发环境使用，并遵循上述演示身份限制。
2. 聊天框调用 `/api/chat`；如需逐字体验，改为 `/api/chat/stream` 并解析 SSE，最后以 `done` 同步视图。
3. 当 `status === 'PENDING_CONFIRM'` 显示预览详情；点击按钮才向 `/api/confirm` 发送 `{confirm:true|false}`；登出或切换身份时删除会话。
4. 真实上线需先接入认证、持久会话/超时管理、HTTPS 与可信的服务端身份绑定；这些不是演示项目当前提供的能力。

最小服务端调用示意（仅文档示例，不修改 `frontend/`）：

```ts
const base = process.env.AGENT_API_URL ?? "http://127.0.0.1:8090";

async function postJson(path: string, body: unknown) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Agent 后端调用失败");
  return result;
}

const session = await postJson("/api/sessions", { user: "20230001" });
const reply = await postJson("/api/chat", {
  sessionId: session.sessionId,
  message: "我的学分和毕业还差多少？",
});
// 根据 reply.ok / reply.status 展示正常结果、局部事实或拒绝说明；不要只看 HTTP 状态。
// 登录态/会话标识应由实际的服务端会话安全保存；不要写进公开页面源码。
```
