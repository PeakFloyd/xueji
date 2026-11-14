import type { AgentTool } from "@earendil-works/pi-agent-core";
import { obj, opt, str } from "@earendil-works/pi-schema";
import { BridgeError, type Ability, type BridgeCode, type Identity, type Invocation, type JsonObject, type PythonBridge } from "./bridge";

export interface FactEntry extends Invocation {
  ability: string;
  mode: "read" | "preview" | "execute";
}

export interface ToolFailure {
  code: BridgeCode;
  error: string;
  alternatives: string[];
}

export interface ToolObserver {
  onFact: (entry: FactEntry, args: JsonObject) => void;
  onFailure: (failure: ToolFailure) => void;
  hasPending: () => boolean;
}

export function buildTools(
  catalog: Ability[], identity: Identity, bridge: PythonBridge, observer: ToolObserver,
): AgentTool<any>[] {
  const names = new Set<string>();
  return catalog.map((ability) => {
    if (names.has(ability.name)) throw new BridgeError("ERROR", "能力目录中存在重复名称");
    names.add(ability.name);
    for (const arg of Object.keys(ability.args)) {
      if (!/^[a-z][a-z0-9_]*$/.test(arg)) throw new BridgeError("ERROR", "能力目录中的参数名无效");
    }
    const parameters = obj(Object.fromEntries(
      Object.entries(ability.args).map(([name, description]) => [name, opt(str({ description, maxLength: 256 }))]),
    ));
    return {
      name: ability.name,
      label: ability.doc,
      description: `${ability.doc}。${ability.write ? "仅预览写入，调用不会落库，须独立确认。" : "只读查询。"}许可角色：${ability.roles.join("、")}`,
      parameters,
      executionMode: "sequential",
      execute: async (_toolCallId, supplied: unknown, signal?: AbortSignal) => {
        if (ability.write && observer.hasPending()) {
          throw new BridgeError("INVALID", "已有待确认操作；一次只能预览一项写入");
        }
        if (supplied === null || typeof supplied !== "object" || Array.isArray(supplied)) {
          throw new BridgeError("INVALID", "能力参数必须是 JSON 对象");
        }
        const args = supplied as JsonObject;
        if (Object.entries(args).some(([name, value]) => !(name in ability.args) || typeof value !== "string" || value.length > 256)) {
          throw new BridgeError("INVALID", "能力参数格式无效");
        }
        const mode = ability.write ? "preview" : "read";
        try {
          const result = await bridge.invoke(identity.ref_id, ability.name, args, mode, signal);
          observer.onFact({ ...result, ability: ability.name, mode }, args);
          return {
            content: [{ type: "text" as const, text: ability.write
              ? `仅预览，尚未执行：${result.text}。等待用户通过独立确认按钮明确确认。`
              : result.text }],
            details: { ability: ability.name, mode, fact: result.fact },
          };
        } catch (error) {
          if (error instanceof BridgeError) {
            observer.onFailure({ code: error.code, error: error.message, alternatives: error.alternatives });
          }
          throw error;
        }
      },
    };
  });
}
