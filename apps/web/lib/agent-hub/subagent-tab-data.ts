import type { LanguageModelUsage, ModelMessage } from "ai";
import type { TaskPendingToolCall } from "@entry-agents/agent";
import type { WebAgentUIToolPart } from "@/app/types";

export type SubagentStatus =
  | "starting"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "denied";

export interface SubagentTabData {
  id: string; // toolCallId
  subagentType: string;
  title: string;
  instructions: string;
  startedAt: number | null;
  status: SubagentStatus;
  modelId: string | null;
  toolCallCount: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  pending: TaskPendingToolCall | null;
  completedParts: WebAgentUIToolPart[];
  finalText: string | null;
  errorText: string | null;
  sessionId: string | null;
  depth: number;
}

interface RawToolPart {
  type: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  preliminary?: boolean;
  errorText?: string;
}

interface RawMessage {
  id?: string;
  role?: string;
  parts?: unknown[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function statusOf(part: RawToolPart): SubagentStatus {
  switch (part.state) {
    case "input-streaming":
      return "starting";
    case "input-available":
      return "running";
    case "approval-requested":
      return "awaiting-approval";
    case "output-denied":
      return "denied";
    case "output-error":
      return "failed";
    case "output-available":
      return part.preliminary === true ? "running" : "completed";
    default:
      return "starting";
  }
}

/** Unwrap AI SDK tool output envelope: { type: "json", value: { ... } } */
function unwrapToolOutput(output: unknown): unknown {
  if (!output || typeof output !== "object") return output;
  const o = output as Record<string, unknown>;
  if (o.type === "json" && o.value && typeof o.value === "object") {
    return o.value;
  }
  return output;
}

/**
 * Extract completed tool calls from subagent's final ModelMessage array.
 * Mirrors the extraction in task-renderer.tsx so all tool renderers work identically.
 */
export function extractSubagentToolParts(
  finalMessages: unknown,
): WebAgentUIToolPart[] {
  if (!Array.isArray(finalMessages)) return [];

  const toolCalls: { toolCallId: string; toolName: string; input: unknown }[] =
    [];
  const toolOutputs = new Map<string, unknown>();

  for (const rawMsg of finalMessages as ModelMessage[]) {
    if (!rawMsg || typeof rawMsg !== "object") continue;

    if (rawMsg.role === "assistant" && Array.isArray(rawMsg.content)) {
      for (const part of rawMsg.content) {
        if (
          part &&
          typeof part === "object" &&
          (part as { type?: string }).type === "tool-call"
        ) {
          const tc = part as {
            toolCallId?: string;
            toolName?: string;
            input?: unknown;
          };
          if (tc.toolCallId && tc.toolName) {
            toolCalls.push({
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: tc.input,
            });
          }
        }
      }
    }

    if (rawMsg.role === "tool" && Array.isArray(rawMsg.content)) {
      for (const part of rawMsg.content) {
        if (
          part &&
          typeof part === "object" &&
          (part as { type?: string }).type === "tool-result"
        ) {
          const tr = part as { toolCallId?: string; output?: unknown };
          if (tr.toolCallId) {
            toolOutputs.set(tr.toolCallId, unwrapToolOutput(tr.output));
          }
        }
      }
    }
  }

  return toolCalls.map((call) => {
    const output = toolOutputs.get(call.toolCallId);
    return {
      type: `tool-${call.toolName}`,
      toolCallId: call.toolCallId,
      state: "output-available",
      input: call.input,
      output,
    } as unknown as WebAgentUIToolPart;
  });
}

function extractFinalAssistantText(finalMessages: unknown): string | null {
  if (!Array.isArray(finalMessages)) return null;
  const texts: string[] = [];

  for (const rawMsg of finalMessages as ModelMessage[]) {
    if (!rawMsg || typeof rawMsg !== "object") continue;
    if (rawMsg.role === "assistant") {
      if (typeof rawMsg.content === "string") {
        texts.push(rawMsg.content);
      } else if (Array.isArray(rawMsg.content)) {
        for (const part of rawMsg.content) {
          if (
            part &&
            typeof part === "object" &&
            (part as { type?: string }).type === "text" &&
            typeof (part as { text?: unknown }).text === "string"
          ) {
            texts.push((part as { text: string }).text);
          }
        }
      }
    }
  }

  return texts.length > 0 ? texts.join("\n\n") : null;
}

/**
 * Extracts full details for a subagent by its toolCallId from persisted chat messages.
 */
export function deriveSubagentTabData(
  messages: unknown,
  subagentId: string,
): SubagentTabData | null {
  if (!Array.isArray(messages)) return null;

  for (const raw of messages as RawMessage[]) {
    if (!raw || raw.role !== "assistant" || !Array.isArray(raw.parts)) continue;

    for (const part of raw.parts) {
      if (!part || typeof part !== "object") continue;
      const rawPart = part as RawToolPart & {
        toolName?: string;
        name?: string;
      };
      const isTask =
        rawPart.type === "tool-task" ||
        ((rawPart.type === "dynamic-tool" || rawPart.type === "tool-call") &&
          (rawPart.toolName === "task" || rawPart.name === "task"));
      if (!isTask || rawPart.toolCallId !== subagentId) {
        continue;
      }

      const taskPart = part as RawToolPart;
      const input = asRecord(taskPart.input);
      const output = asRecord(taskPart.output);
      const usage = asRecord(
        output?.usage,
      ) as Partial<LanguageModelUsage> | null;
      const pendingRecord = asRecord(output?.pending);
      const pending: TaskPendingToolCall | null =
        pendingRecord && typeof pendingRecord.name === "string"
          ? { name: pendingRecord.name, input: pendingRecord.input }
          : null;

      const finalMessages = output?.final;
      const partsFromFinal = extractSubagentToolParts(finalMessages);

      // Support live streaming executedTools directly from task tool updates
      const executedToolsRaw = Array.isArray(output?.executedTools)
        ? (output.executedTools as Array<Record<string, unknown>>)
        : [];
      const partsFromExecuted = executedToolsRaw.map(
        (call) =>
          ({
            type: `tool-${String(call.name ?? "tool")}`,
            toolCallId: String(call.toolCallId ?? crypto.randomUUID()),
            state:
              call.state === "running" ? "input-available" : "output-available",
            input: call.input,
            output: call.output,
          }) as unknown as WebAgentUIToolPart,
      );

      const completedParts =
        partsFromFinal.length > 0 ? partsFromFinal : partsFromExecuted;

      const finalText =
        extractFinalAssistantText(finalMessages) ??
        (typeof output?.streamedText === "string" &&
        output.streamedText.length > 0
          ? output.streamedText
          : null);

      return {
        id: subagentId,
        subagentType:
          typeof input?.subagent_type === "string"
            ? input.subagent_type
            : typeof input?.subagentType === "string"
              ? input.subagentType
              : "agent",
        title:
          typeof input?.task === "string" && input.task.length > 0
            ? input.task
            : "Subagent Task",
        instructions:
          typeof input?.instructions === "string" ? input.instructions : "",
        startedAt: numberOrNull(output?.startedAt),
        status: statusOf(taskPart),
        modelId: typeof output?.modelId === "string" ? output.modelId : null,
        toolCallCount:
          numberOrNull(output?.toolCallCount) ?? completedParts.length,
        inputTokens: numberOrNull(usage?.inputTokens),
        outputTokens: numberOrNull(usage?.outputTokens),
        pending,
        completedParts,
        finalText,
        errorText:
          typeof taskPart.errorText === "string" ? taskPart.errorText : null,
        sessionId:
          typeof output?.sessionId === "string" ? output.sessionId : null,
        depth: numberOrNull(output?.depth) ?? 0,
      };
    }
  }

  return null;
}
