import { isReasoningUIPart, isToolUIPart } from "ai";
import type { WebAgentUIMessage } from "@/app/types";

const FILE_MODIFYING_TOOLS = new Set(["tool-write", "tool-edit"]);
const NON_STEP_TOOLS = new Set(["tool-todo_write"]);

export interface TurnFileChanges {
  files: number;
  add: number;
  del: number;
}

export interface TurnWorkSummary {
  hasCollapsible: boolean;
  /** Tool calls counted as steps (excludes todo_write, matching Sable's `k` vs `w`). */
  stepCount: number;
  /** True when the turn only had reasoning/thinking and zero tool steps. */
  thoughtOnly: boolean;
  /** Aggregated file changes (+add / -del) from write/edit tool calls. */
  changes: TurnFileChanges;
  /** Unique changed file paths. */
  changedFiles: string[];
  /** Human-readable live activity label while streaming (e.g. "Reading app.ts", "Thinking"). */
  liveLabel: string;
}

function countLines(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

function basename(filePath: string): string {
  const clean = filePath.replace(/\/+$/, "");
  const idx = clean.lastIndexOf("/");
  return idx >= 0 ? clean.slice(idx + 1) : clean;
}

function describeToolActivity(
  type: string,
  input: Record<string, unknown> | undefined,
): string {
  const filePath =
    typeof input?.filePath === "string" ? basename(input.filePath) : null;
  switch (type) {
    case "tool-read":
      return filePath ? `Reading ${filePath}` : "Reading file";
    case "tool-edit":
      return filePath ? `Editing ${filePath}` : "Editing file";
    case "tool-write":
      return filePath ? `Writing ${filePath}` : "Writing file";
    case "tool-bash":
      return "Running command";
    case "tool-grep":
      return "Searching code";
    case "tool-glob":
      return "Finding files";
    case "tool-web_search":
      return "Searching the web";
    case "tool-web_fetch":
      return "Fetching page";
    case "tool-task":
      return "Running subagent";
    case "tool-skill":
      return "Loading skill";
    default:
      return "Working";
  }
}

/**
 * Distilled from Sable's `turns.ts` + `TurnView.tsx` (`TotalLine` / `LiveLine` / `changesOf`).
 * Summarizes an assistant message's work (tool calls + thinking) into step counts,
 * thought-only detection, file diff totals, and a live activity title.
 */
export function summarizeTurnWork(message: WebAgentUIMessage): TurnWorkSummary {
  let hasTool = false;
  let hasReasoning = false;
  let stepCount = 0;
  const changedFileSet = new Set<string>();
  let add = 0;
  let del = 0;
  let liveLabel = "Working";

  for (const part of message.parts) {
    if (isReasoningUIPart(part)) {
      hasReasoning = true;
      if (part.state === "streaming") {
        liveLabel = "Thinking";
      }
      continue;
    }

    if (!isToolUIPart(part)) continue;
    hasTool = true;

    if (!NON_STEP_TOOLS.has(part.type)) {
      stepCount += 1;
    }

    const input =
      part.input && typeof part.input === "object"
        ? (part.input as Record<string, unknown>)
        : undefined;

    if (
      part.state === "input-streaming" ||
      part.state === "input-available" ||
      part.state === "approval-requested"
    ) {
      liveLabel = describeToolActivity(part.type, input);
    }

    if (
      FILE_MODIFYING_TOOLS.has(part.type) &&
      typeof input?.filePath === "string" &&
      input.filePath.length > 0
    ) {
      changedFileSet.add(input.filePath);
      if (part.type === "tool-write" && typeof input.content === "string") {
        add += countLines(input.content);
      } else if (part.type === "tool-edit") {
        const oldStr =
          typeof input.oldString === "string" ? input.oldString : "";
        const newStr =
          typeof input.newString === "string" ? input.newString : "";
        const oldLines = countLines(oldStr);
        const newLines = countLines(newStr);
        if (newLines >= oldLines) {
          add += Math.max(1, newLines - oldLines);
        } else {
          del += oldLines - newLines;
        }
      }
    }
  }

  const changedFiles = Array.from(changedFileSet);

  return {
    hasCollapsible: hasTool || hasReasoning,
    stepCount,
    thoughtOnly: stepCount === 0 && hasReasoning,
    changes: {
      files: changedFiles.length,
      add,
      del,
    },
    changedFiles,
    liveLabel,
  };
}
