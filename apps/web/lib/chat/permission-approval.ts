import { isToolUIPart } from "ai";
import type { WebAgentUIMessage } from "@/app/types";
import type { PermissionMode } from "@/components/permission-mode-selector";

function isAutoAcceptCoveredTool(toolName: string): boolean {
  return toolName === "web_fetch" || toolName.startsWith("mcp__");
}

/**
 * Returns pending tool approval IDs from `messages` that are automatically
 * satisfied once the user upgrades the session to `nextMode`.
 *
 * - `fullAccess`: approves every pending tool approval request.
 * - `autoAccept`: approves pending `web_fetch` and MCP (`mcp__*`) requests,
 *   leaving dangerous bash / `.env` gates for manual review.
 * - `ask`: never auto-approves anything.
 */
export function collectAutoApprovableIds(
  messages: readonly WebAgentUIMessage[],
  nextMode: PermissionMode,
): string[] {
  if (nextMode === "ask") return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const msg of messages) {
    if (msg.role !== "assistant" || !Array.isArray(msg.parts)) continue;
    for (const part of msg.parts) {
      if (!isToolUIPart(part) || part.state !== "approval-requested") continue;
      const raw = part as Record<string, unknown>;
      const toolName =
        part.type === "dynamic-tool" && typeof raw.toolName === "string"
          ? raw.toolName
          : part.type.replace(/^tool-/, "");
      if (nextMode === "autoAccept" && !isAutoAcceptCoveredTool(toolName)) {
        continue;
      }
      const approval = raw.approval as { id?: string } | undefined;
      const toolCallId =
        typeof raw.toolCallId === "string" ? raw.toolCallId : "";
      const approvalId =
        typeof approval?.id === "string" ? approval.id : toolCallId;
      if (approvalId && !seen.has(approvalId)) {
        seen.add(approvalId);
        ids.push(approvalId);
      }
    }
  }
  return ids;
}
