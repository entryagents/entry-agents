import {
  generateText,
  type LanguageModel,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import { enrichUsageWithProviderCache } from "../usage";
import {
  compactSubagentHistoryFallback,
  sanitizeDanglingSubagentToolCalls,
} from "./prepare-step";

export interface SubagentExecutedToolRecord {
  toolCallId?: string;
  name: string;
  input: unknown;
  output?: unknown;
  state?: "running" | "completed" | "failed";
}

export function extractAssistantText(messages: ModelMessage[]): string {
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    const content = assistantMessages[i]?.content;
    if (typeof content === "string" && content.trim().length > 0) {
      return content.trim();
    }
    if (Array.isArray(content)) {
      const parts = content
        .filter(
          (p): p is { type: "text"; text: string } =>
            Boolean(p) &&
            typeof p === "object" &&
            (p as { type?: string }).type === "text" &&
            typeof (p as { text?: unknown }).text === "string",
        )
        .map((p) => p.text.trim())
        .filter(Boolean);
      if (parts.length > 0) {
        return parts.join("\n\n");
      }
    }
  }
  return "";
}

export function hasStructuredSubagentSummary(
  messages: ModelMessage[],
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg || msg.role !== "assistant") continue;
    const text =
      typeof msg.content === "string"
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content
              .filter(
                (p): p is { type: "text"; text: string } =>
                  Boolean(p) &&
                  typeof p === "object" &&
                  (p as { type?: string }).type === "text" &&
                  typeof (p as { text?: unknown }).text === "string",
              )
              .map((p) => p.text)
              .join("\n")
          : "";
    if (text.includes("**Summary**") && text.includes("**Answer**")) {
      return true;
    }
  }
  return false;
}

export function isTransientSubagentError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();
  if (!message) return false;
  if (
    message.includes("abort") ||
    message.includes("budget") ||
    message.includes("credit") ||
    message.includes("repetitive tool call loop") ||
    message.includes("unauthorized") ||
    message.includes("forbidden")
  ) {
    return false;
  }
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("bad gateway") ||
    message.includes("service unavailable") ||
    message.includes("gateway timeout") ||
    message.includes("econnreset") ||
    message.includes("etimedout") ||
    message.includes("econnrefused") ||
    message.includes("socket hang up") ||
    message.includes("fetch failed") ||
    message.includes("network error") ||
    message.includes("stream terminated") ||
    message.includes("terminated early") ||
    message.includes("overloaded") ||
    message.includes("temporarily unavailable")
  );
}

export function isContextOverflowSubagentError(error: unknown): boolean {
  const message = (
    error instanceof Error ? error.message : String(error ?? "")
  ).toLowerCase();
  if (!message) return false;
  return (
    message.includes("context_length_exceeded") ||
    message.includes("maximum context length") ||
    message.includes("context window") ||
    message.includes("prompt is too long") ||
    message.includes("input tokens exceed") ||
    message.includes("too many tokens") ||
    message.includes("exceeds the context")
  );
}

export function compactMessagesForOverflowRecovery(
  messages: ModelMessage[],
): ModelMessage[] {
  const sanitized = sanitizeDanglingSubagentToolCalls(messages);
  const compacted = compactSubagentHistoryFallback(sanitized);
  if (compacted.length < sanitized.length) {
    return compacted;
  }
  if (sanitized.length > 6) {
    return [sanitized[0]!, ...sanitized.slice(-4)];
  }
  return sanitized;
}

function collectToolArtifacts(executedTools: SubagentExecutedToolRecord[]): {
  modifiedFiles: string[];
  inspectedFiles: string[];
  commands: string[];
  recentActions: string[];
} {
  const modified = new Set<string>();
  const inspected = new Set<string>();
  const commands: string[] = [];
  const recentActions: string[] = [];

  for (const tool of executedTools) {
    const input =
      tool.input && typeof tool.input === "object"
        ? (tool.input as Record<string, unknown>)
        : undefined;
    const filePath =
      (typeof input?.filePath === "string" && input.filePath) ||
      (typeof input?.path === "string" && input.path) ||
      undefined;
    if (filePath) {
      if (tool.name === "write" || tool.name === "edit") {
        modified.add(filePath);
      } else if (tool.name === "read") {
        inspected.add(filePath);
      }
    }
    if (tool.name === "bash" && typeof input?.command === "string") {
      commands.push(input.command.replace(/\s+/g, " ").trim().slice(0, 120));
    }
    const target =
      filePath ??
      (typeof input?.command === "string" ? input.command : undefined) ??
      (typeof input?.pattern === "string" ? input.pattern : undefined) ??
      (typeof input?.query === "string" ? input.query : undefined);
    recentActions.push(
      `- \`${tool.name}\`${target ? `: \`${String(target).replace(/\s+/g, " ").trim().slice(0, 80)}\`` : ""}`,
    );
  }

  return {
    modifiedFiles: [...modified].slice(0, 15),
    inspectedFiles: [...inspected].slice(0, 15),
    commands: commands.slice(-8),
    recentActions: recentActions.slice(-12),
  };
}

export function buildFallbackSubagentSummary(params: {
  task: string;
  subagentType: string;
  outcome: "completed" | "failed" | "budget_stopped";
  error?: string;
  budgetReason?: "window" | "credit";
  toolCallCount: number;
  executedTools: SubagentExecutedToolRecord[];
  streamedText?: string;
}): string {
  const artifacts = collectToolArtifacts(params.executedTools);
  const trimmedStreamed = params.streamedText?.trim() ?? "";

  const header =
    params.outcome === "failed"
      ? `**Subagent execution halted**: ${(params.error ?? "Execution stopped").replace(/^Error:\s*/, "")}`
      : params.outcome === "budget_stopped"
        ? `**Subagent limit reached**: Stopped by ${
            params.budgetReason === "window"
              ? "usage window"
              : params.budgetReason === "credit"
                ? "credit balance"
                : "usage limit"
          }. Partial progress preserved across ${params.toolCallCount} steps.`
        : "";

  const summaryStatus =
    params.outcome === "completed"
      ? `Completed \`${params.subagentType}\` subagent execution for "${params.task}" across ${params.toolCallCount} tool call(s).`
      : params.outcome === "budget_stopped"
        ? `The \`${params.subagentType}\` subagent paused for "${params.task}" after ${params.toolCallCount} tool call(s) due to usage limits.`
        : `The \`${params.subagentType}\` subagent stopped during "${params.task}" after ${params.toolCallCount} tool call(s) (${(params.error ?? "execution interrupted").replace(/^Error:\s*/, "")}).`;

  const answerSections: string[] = [];
  if (trimmedStreamed) {
    const excerpt =
      trimmedStreamed.length > 2_500
        ? `${trimmedStreamed.slice(0, 1_500)}\n...\n${trimmedStreamed.slice(-900)}`
        : trimmedStreamed;
    answerSections.push(`Latest partial output:\n${excerpt}`);
  }
  if (artifacts.modifiedFiles.length > 0) {
    answerSections.push(
      `Files modified:\n${artifacts.modifiedFiles.map((f) => `- \`${f}\``).join("\n")}`,
    );
  }
  if (artifacts.inspectedFiles.length > 0) {
    answerSections.push(
      `Files inspected:\n${artifacts.inspectedFiles.map((f) => `- \`${f}\``).join("\n")}`,
    );
  }
  if (artifacts.commands.length > 0) {
    answerSections.push(
      `Commands run:\n${artifacts.commands.map((c) => `- \`${c}\``).join("\n")}`,
    );
  }
  if (
    artifacts.modifiedFiles.length === 0 &&
    artifacts.inspectedFiles.length === 0 &&
    artifacts.recentActions.length > 0
  ) {
    answerSections.push(
      `Recent actions:\n${artifacts.recentActions.join("\n")}`,
    );
  }
  if (answerSections.length === 0) {
    answerSections.push(
      params.outcome === "completed"
        ? "Execution finished without additional tool artifacts."
        : "No partial tool outputs were recorded before stopping.",
    );
  }

  const structuredBody = `**Summary**: ${summaryStatus}\n\n**Answer**:\n${answerSections.join("\n\n")}`;
  return header ? `${header}\n\n${structuredBody}` : structuredBody;
}

export async function synthesizeSubagentFinalSummary(params: {
  model: LanguageModel;
  task: string;
  subagentType: string;
  messages: ModelMessage[];
  executedTools: SubagentExecutedToolRecord[];
  streamedText?: string;
  abortSignal?: AbortSignal;
}): Promise<{ text: string; usage?: LanguageModelUsage } | null> {
  // Unit tests frequently pass string mock model IDs ("test-model") without
  // gateway env vars. Only call generateText when given an object LanguageModel.
  if (typeof params.model !== "object" || params.model === null) {
    return null;
  }
  if (params.abortSignal?.aborted) {
    return null;
  }

  try {
    const compactedHistory = compactMessagesForOverflowRecovery(
      params.messages,
    );
    const artifacts = collectToolArtifacts(params.executedTools);
    const promptLines = [
      `Synthesize the final structured report for task: "${params.task}" (role: ${params.subagentType}).`,
      "Do NOT request or run any tools.",
      artifacts.modifiedFiles.length > 0
        ? `Files modified: ${artifacts.modifiedFiles.join(", ")}`
        : undefined,
      artifacts.commands.length > 0
        ? `Commands run: ${artifacts.commands.join(" | ")}`
        : undefined,
      params.streamedText?.trim()
        ? `Partial output excerpt:\n${params.streamedText.trim().slice(-2_000)}`
        : undefined,
      "Return ONLY two markdown sections:\n**Summary**: <2-4 sentences>\n\n**Answer**: <concrete findings, files changed, verification results, and remaining gaps if any>",
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await generateText({
      model: params.model,
      messages: [
        ...compactedHistory.slice(-12),
        { role: "user", content: promptLines },
      ],
      maxOutputTokens: 1_200,
      abortSignal: params.abortSignal,
    });

    const text = response.text.trim();
    if (!text) return null;
    const enrichedUsage =
      enrichUsageWithProviderCache(
        response.usage,
        (response as { providerMetadata?: unknown }).providerMetadata,
      ) ?? response.usage;
    const formatted =
      text.includes("**Summary**") && text.includes("**Answer**")
        ? text
        : `**Summary**: Completed synthesis for "${params.task}".\n\n**Answer**:\n${text}`;
    return { text: formatted, usage: enrichedUsage };
  } catch {
    return null;
  }
}
