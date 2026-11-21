import { formatTokens } from "@entry-agents/shared/lib/tool-state";

export interface AgentLineSummary {
  state: string;
  tone?: "error";
  parts: string[];
}

/**
 * Formats a subagent's settled/live status line 1:1 with Sable's `agent-line.ts`:
 * "Done · 14 steps · 41k tokens".
 */
export function formatAgentLine(params: {
  status?: string;
  isRunning: boolean;
  isFailed: boolean;
  toolCallCount?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
}): AgentLineSummary {
  const parts: string[] = [];
  if (typeof params.toolCallCount === "number" && params.toolCallCount > 0) {
    parts.push(
      params.toolCallCount === 1 ? "1 step" : `${params.toolCallCount} steps`,
    );
  }
  const totalTokens =
    (typeof params.inputTokens === "number" ? params.inputTokens : 0) +
    (typeof params.outputTokens === "number" ? params.outputTokens : 0);
  if (totalTokens > 0) {
    parts.push(`${formatTokens(totalTokens)} tokens`);
  }

  if (params.isFailed) {
    return { state: "Failed", tone: "error", parts };
  }
  if (params.isRunning) {
    return { state: "Working", parts };
  }
  if (params.status === "denied") {
    return { state: "Denied", parts: [] };
  }
  return { state: "Done", parts };
}
