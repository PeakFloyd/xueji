import { Agent } from "@earendil-works/pi-agent-core";
import type { Models } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { BridgeError, type Ability, type Identity, type JsonObject, type PythonBridge } from "./bridge";
import { systemPrompt } from "./system-prompt";
import { buildTools, type FactEntry, type ToolFailure } from "./tools";

const MAX_MODEL_TURNS = 8;
const MAX_TOOL_CALLS = 16;

export interface PendingPreview {
  ability: string;
  args: JsonObject;
  preview: FactEntry;
}

export interface AgentTurn {
  text: string;
  facts: FactEntry[];
  failures: ToolFailure[];
  pending?: PendingPreview;
  modelError: boolean;
  budgetExceeded: boolean;
}

export type StreamUpdate =
  | { type: "delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string }
  | { type: "tool_end"; toolCallId: string; toolName: string; isError: boolean };

export interface SessionAgent {
  turn: (message: string, onUpdate?: (update: StreamUpdate) => void) => Promise<AgentTurn>;
  abort: () => void;
}

export function createSessionAgent(
  identity: Identity,
  catalog: Ability[],
  bridge: PythonBridge,
  config: { models?: Models; provider?: string; model?: string } = {},
): SessionAgent {
  const models = config.models ?? builtinModels();
  const provider = config.provider ?? process.env.PI_PROVIDER;
  const modelId = config.model ?? process.env.PI_MODEL;
  if (!provider || !modelId) throw new BridgeError("ERROR", "请在服务端设置 PI_PROVIDER 和 PI_MODEL");
  const model = models.getModel(provider, modelId);
  if (!model) throw new BridgeError("ERROR", "配置的 Pi 模型不存在于所选供应商目录中");

  let capture: AgentTurn | undefined;
  let emit: ((update: StreamUpdate) => void) | undefined;
  let modelTurns = 0;
  let toolCalls = 0;
  let budgetExceeded = false;
  const tools = buildTools(catalog, identity, bridge, {
    onFact: (entry, args) => {
      if (!capture) throw new BridgeError("ERROR", "没有正在处理的聊天请求");
      capture.facts.push(entry);
      if (entry.mode === "preview") capture.pending = { ability: entry.ability, args, preview: entry };
    },
    onFailure: (failure) => {
      capture?.failures.push(failure);
    },
    hasPending: () => capture?.pending !== undefined,
  });
  const agent = new Agent({
    initialState: { systemPrompt: systemPrompt(identity), model, tools },
    streamFn: models.streamSimple.bind(models),
    sessionId: crypto.randomUUID(),
    toolExecution: "sequential",
    beforeToolCall: async () => {
      toolCalls += 1;
      if (toolCalls <= MAX_TOOL_CALLS) return;
      budgetExceeded = true;
      return { block: true, reason: "本次请求的能力调用次数已达上限", terminate: true };
    },
    finishTurn: async ({ message, toolResults }) => {
      modelTurns += 1;
      if (message.stopReason === "error" || message.stopReason === "aborted") return;
      if (budgetExceeded || modelTurns >= MAX_MODEL_TURNS) {
        if (toolResults.length) budgetExceeded = true;
        return { action: "end" };
      }
    },
  });
  agent.subscribe((event) => {
    if (!capture) return;
    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      emit?.({ type: "delta", delta: event.assistantMessageEvent.delta });
    } else if (event.type === "tool_execution_start") {
      emit?.({ type: "tool_start", toolCallId: event.toolCallId, toolName: event.toolName });
    } else if (event.type === "tool_execution_end") {
      emit?.({ type: "tool_end", toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError });
    } else if (event.type === "message_end" && event.message.role === "assistant") {
      const message = event.message;
      capture.text = message.content.filter((block) => block.type === "text").map((block) => block.text).join("").trim();
      capture.modelError = message.stopReason === "error" || message.stopReason === "aborted";
    }
  });

  return {
    async turn(message: string, onUpdate?: (update: StreamUpdate) => void): Promise<AgentTurn> {
      capture = { text: "", facts: [], failures: [], modelError: false, budgetExceeded: false };
      emit = onUpdate;
      modelTurns = 0;
      toolCalls = 0;
      budgetExceeded = false;
      const result = capture;
      try {
        await agent.prompt(message);
      } catch {
        result.modelError = true;
      } finally {
        result.budgetExceeded = budgetExceeded;
        capture = undefined;
        emit = undefined;
      }
      return result;
    },
    abort: () => agent.abort(),
  };
}
