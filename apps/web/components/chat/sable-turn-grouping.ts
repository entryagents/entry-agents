import { isReasoningUIPart, isToolUIPart } from "ai";
import type {
  WebAgentUIMessage,
  WebAgentUIMessagePart,
  WebAgentUIToolPart,
} from "@/app/types";
import {
  isGitDataPart,
  shouldRenderGitDataPart,
} from "@/lib/chat-streaming-state";
import { isLeadIn, leadTitle } from "./lead-in";
import { plural, thinkingHeadline } from "./timeline-util";

const FILE_MODIFYING_TOOLS = new Set(["tool-write", "tool-edit"]);
const NON_STEP_TOOLS = new Set(["tool-todo_write"]);
const EXPLORE_TOOL_TYPES = new Set([
  "tool-read",
  "tool-grep",
  "tool-glob",
  "tool-web_fetch",
]);

export type ReasoningMessagePart = Extract<
  WebAgentUIMessagePart,
  { type: "reasoning" }
>;

export type TextMessagePart = Extract<WebAgentUIMessagePart, { type: "text" }>;

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

export type WorkItem =
  | {
      kind: "tool";
      key: string;
      partIndex: number;
      part: WebAgentUIToolPart;
      isTodo: boolean;
      isStreaming: boolean;
    }
  | {
      kind: "reasoning";
      key: string;
      startIndex: number;
      parts: ReasoningMessagePart[];
    }
  | {
      kind: "lead";
      key: string;
      partIndex: number;
      part: TextMessagePart;
      isStreaming: boolean;
    };

export type GroupedWorkRow =
  | {
      kind: "item";
      key: string;
      item: WorkItem;
    }
  | {
      kind: "explore-run";
      key: string;
      items: Extract<WorkItem, { kind: "tool" }>[];
    };

export interface StepsFlowChunk {
  kind: "steps";
  key: string;
  items: WorkItem[];
  rows: GroupedWorkRow[];
  stepCount: number;
  thoughtOnly: boolean;
  hasApprovalRequested: boolean;
  approvalIds: string[];
  narr: string[];
}

export interface TextFlowChunk {
  kind: "text";
  key: string;
  partIndex: number;
  part: TextMessagePart;
  isStreaming: boolean;
  isNote: boolean;
  isAnswer: boolean;
  isTail: boolean;
}

export interface ShowFlowChunk {
  kind: "show";
  key: string;
  partIndex: number;
  part: WebAgentUIMessagePart;
  isStreaming: boolean;
}

export type AssistantFlowChunk = StepsFlowChunk | TextFlowChunk | ShowFlowChunk;

export interface TurnLiveInfo {
  waiting: boolean;
  title: string;
  quiet: boolean;
  stepCount: number;
}

export interface AssistantTurnFlow {
  flow: AssistantFlowChunk[];
  hasWork: boolean;
  /** Index in `flow` where the settled TotalLine stands (-1 if no foldable work/notes). */
  headAt: number;
  /** Number of `steps` chunks in `flow`. */
  runCount: number;
  /** True when opening TotalLine should show nested checkpoint RunLines + notes instead of straight steps. */
  multi: boolean;
  totalSteps: number;
  thoughtOnly: boolean;
  changes: TurnFileChanges;
  changedFiles: string[];
  live: TurnLiveInfo;
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

export function getToolPartName(
  part: WebAgentUIMessagePart,
): string | undefined {
  if (!isToolUIPart(part)) return undefined;
  const named = (part as { toolName?: unknown }).toolName;
  if (typeof named === "string") return named;
  if (part.type.startsWith("tool-")) {
    return part.type.slice(5);
  }
  return undefined;
}

export function describeToolActivity(
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
      return typeof input?.pattern === "string" && input.pattern.trim()
        ? `Searching "${input.pattern.trim().slice(0, 40)}"`
        : "Searching code";
    case "tool-glob":
      return typeof input?.pattern === "string" && input.pattern.trim()
        ? `Finding ${input.pattern.trim().slice(0, 40)}`
        : "Finding files";
    case "tool-web_search":
      return "Searching the web";
    case "tool-web_fetch":
      return "Fetching page";
    case "tool-task":
      return typeof input?.task === "string" && input.task.trim()
        ? input.task.trim().slice(0, 64)
        : "Running subagent";
    case "tool-skill":
      return "Loading skill";
    default:
      return "Working";
  }
}

/** Short target label for an active tool inside an ExploreRun row. */
export function describeExploreTarget(part: WebAgentUIToolPart): string {
  const input =
    part.input && typeof part.input === "object"
      ? (part.input as Record<string, unknown>)
      : undefined;
  switch (part.type) {
    case "tool-read":
      return typeof input?.filePath === "string"
        ? basename(input.filePath)
        : "file";
    case "tool-grep":
      return typeof input?.pattern === "string" && input.pattern.trim()
        ? input.pattern.trim()
        : "code";
    case "tool-glob":
      return typeof input?.pattern === "string" && input.pattern.trim()
        ? input.pattern.trim()
        : "files";
    case "tool-web_fetch": {
      const url = typeof input?.url === "string" ? input.url : "";
      if (!url) return "page";
      try {
        return new URL(url).host.replace(/^www\./, "");
      } catch {
        return url.slice(0, 48);
      }
    }
    default:
      return "";
  }
}

/**
 * Whether a tool part is a look-only explore tool eligible to join an `ExploreRun`
 * (1:1 Sable `util.ts:isExplore`: read, grep, glob, fetch that did not fail/deny/await).
 */
export function isExploreToolPart(
  part: WebAgentUIToolPart,
  isStreaming: boolean,
): boolean {
  if (!EXPLORE_TOOL_TYPES.has(part.type)) return false;
  if (
    part.state === "output-error" ||
    part.state === "output-denied" ||
    part.state === "approval-requested"
  ) {
    return false;
  }
  // Check structured tool failure in output (e.g. { success: false, error: ... })
  if (
    part.state === "output-available" &&
    part.output &&
    typeof part.output === "object" &&
    "success" in part.output &&
    (part.output as { success?: unknown }).success === false
  ) {
    return false;
  }
  // Interrupted tool (not streaming and never completed) breaks out so user sees it
  if (
    !isStreaming &&
    (part.state === "input-streaming" ||
      part.state === "input-available" ||
      (part.state === "output-available" && part.preliminary === true))
  ) {
    return false;
  }
  return true;
}

/**
 * Sable 1:1 `runLabel`:
 * - only reads -> "Read 6 files"
 * - only searches (grep/glob) -> "Searched 3 times"
 * - only fetches -> "Fetched 2 pages"
 * - mixed -> "Explored 4 files, 2 searches"
 */
export function formatExploreRunLabel(
  files: number,
  searches: number,
  pages: number,
): string {
  if (!searches && !pages) return `Read ${plural(files, "file")}`;
  if (!files && !pages) {
    return `Searched ${searches === 1 ? "once" : `${searches} times`}`;
  }
  if (!files && !searches) return `Fetched ${plural(pages, "page")}`;
  return `Explored ${[
    files ? plural(files, "file") : "",
    searches ? plural(searches, "search", "searches") : "",
    pages ? plural(pages, "page") : "",
  ]
    .filter(Boolean)
    .join(", ")}`;
}

/**
 * Groups items inside a checkpoint run 1:1 with Sable `ItemList`:
 * - Consecutive look-only explore tools (read, grep, glob, web_fetch) fold into an `explore-run`
 * - Repeated `todo_write` calls keep a single row at the first occurrence, showing the latest state
 */
export function groupWorkRunItems(
  items: readonly WorkItem[],
): GroupedWorkRow[] {
  const out: GroupedWorkRow[] = [];
  let firstTodoIdx = -1;
  let lastTodoIdx = -1;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "tool" && item.isTodo) {
      if (firstTodoIdx < 0) firstTodoIdx = i;
      lastTodoIdx = i;
    }
  }

  for (let i = 0; i < items.length; ) {
    const item = items[i];
    if (item.kind === "tool" && item.isTodo) {
      if (i === firstTodoIdx && lastTodoIdx >= 0) {
        out.push({
          kind: "item",
          key: item.key,
          item: items[lastTodoIdx],
        });
      }
      i += 1;
      continue;
    }

    if (
      item.kind !== "tool" ||
      !isExploreToolPart(item.part, item.isStreaming)
    ) {
      out.push({ kind: "item", key: item.key, item });
      i += 1;
      continue;
    }

    const run: Extract<WorkItem, { kind: "tool" }>[] = [];
    let j = i;
    while (j < items.length) {
      const candidate = items[j];
      if (
        candidate.kind === "tool" &&
        !candidate.isTodo &&
        isExploreToolPart(candidate.part, candidate.isStreaming)
      ) {
        run.push(candidate);
        j += 1;
      } else {
        break;
      }
    }

    if (run.length >= 2) {
      out.push({
        kind: "explore-run",
        key: `run:${run[0].key}`,
        items: run,
      });
    } else {
      out.push({
        kind: "item",
        key: run[0].key,
        item: run[0],
      });
    }
    i = j;
  }

  return out;
}

function isAlwaysVisibleShowTool(part: WebAgentUIToolPart): boolean {
  const toolName = getToolPartName(part);
  if (part.type === "tool-visualize" || toolName === "visualize") {
    return true;
  }
  if (toolName === "show_widget") {
    const inp =
      typeof part.input === "object" && part.input !== null
        ? (part.input as Record<string, unknown>)
        : null;
    const code =
      (typeof inp?.widget_code === "string" && inp.widget_code) ||
      (typeof inp?.code === "string" && inp.code) ||
      (typeof inp?.html === "string" && inp.html) ||
      "";
    return code.length > 0;
  }
  if (toolName === "send_user_file") {
    const inp =
      typeof part.input === "object" && part.input !== null
        ? (part.input as Record<string, unknown>)
        : null;
    const out =
      typeof part.output === "object" && part.output !== null
        ? (part.output as Record<string, unknown>)
        : null;
    return Boolean(
      (Array.isArray(out?.files) && out.files.length > 0) ||
      (Array.isArray(inp?.files) && inp.files.length > 0) ||
      typeof inp?.file_path === "string" ||
      typeof inp?.path === "string",
    );
  }
  return false;
}

type RawEntry =
  | {
      shape: "w" | "k";
      key: string;
      partIndex: number;
      part: WebAgentUIToolPart;
      isStreaming: boolean;
    }
  | {
      shape: "h";
      key: string;
      startIndex: number;
      parts: ReasoningMessagePart[];
    }
  | {
      shape: "t" | "l";
      key: string;
      partIndex: number;
      part: TextMessagePart;
      isStreaming: boolean;
    }
  | {
      shape: "g";
      key: string;
      partIndex: number;
      part: WebAgentUIMessagePart;
      isStreaming: boolean;
    };

const ANSWER = new Set(["t"]);
const WORK_AFTER = new Set(["w", "h", "k", "l"]);
const QUIET_AFTER = new Set([".", "k", "h"]);

/**
 * Ported 1:1 from Sable `turns.ts:settleLeads`.
 */
function settleLeads(chars: string[], live: boolean, final: boolean): string[] {
  if (!chars.includes("l")) return chars;
  const out = chars.slice();
  for (let i = 0; i < out.length; i++) {
    if (out[i] !== "l") continue;
    let j = i + 1;
    while (j < out.length && out[j] === ".") j += 1;
    let k = j;
    while (k < out.length && QUIET_AFTER.has(out[k])) k += 1;
    if (k >= out.length) {
      if (!live) out[i] = "t";
      continue;
    }
    if (!WORK_AFTER.has(out[j])) out[i] = "t";
  }
  if (final && !out.some((c) => ANSWER.has(c))) {
    const last = out.lastIndexOf("l");
    if (last >= 0) out[last] = "t";
  }
  return out;
}

function isPartRunningTool(
  part: WebAgentUIToolPart,
  isMessageStreaming: boolean,
): boolean {
  if (!isMessageStreaming) return false;
  return (
    part.state === "input-streaming" ||
    part.state === "input-available" ||
    part.state === "approval-requested" ||
    (part.state === "output-available" && part.preliminary === true)
  );
}

/**
 * Distilled 1:1 from Sable `turns.ts` + `TurnView.tsx` + `items.tsx`.
 * Turns an assistant message's parts into Sable checkpoints (`steps`, `text`, `show`),
 * with lead-in folding, answer/note/tail classification, explore runs, todo deduplication,
 * diff summary, and live line status.
 */
export function buildAssistantTurnFlow(
  message: WebAgentUIMessage,
  isStreaming: boolean,
): AssistantTurnFlow {
  const parts = message.parts;
  const entries: RawEntry[] = [];
  const rawChars: string[] = [];
  const identityCounts = new Map<string, number>();

  const nextKey = (base: string, stableUnique = false): string => {
    if (stableUnique) return base;
    const count = identityCounts.get(base) ?? 0;
    identityCounts.set(base, count + 1);
    return `${base}:${count}`;
  };

  let pendingReasoning: ReasoningMessagePart[] = [];
  let pendingReasoningStart = 0;

  const flushReasoning = () => {
    if (pendingReasoning.length === 0) return;
    const key = nextKey("reasoning");
    entries.push({
      shape: "h",
      key,
      startIndex: pendingReasoningStart,
      parts: pendingReasoning,
    });
    rawChars.push("h");
    pendingReasoning = [];
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (isReasoningUIPart(part)) {
      if (pendingReasoning.length === 0) {
        pendingReasoningStart = i;
      }
      pendingReasoning.push(part);
      continue;
    }

    flushReasoning();

    if (part.type === "text") {
      const partStreaming = isStreaming && part.state === "streaming";
      if (!partStreaming && !part.text.trim()) {
        continue;
      }
      const shape = isLeadIn(part.text, partStreaming) ? "l" : "t";
      entries.push({
        shape,
        key: nextKey("text"),
        partIndex: i,
        part,
        isStreaming: partStreaming,
      });
      rawChars.push(shape);
      continue;
    }

    if (isToolUIPart(part)) {
      const hasLaterStepOrProse = parts
        .slice(i + 1)
        .some(
          (later) =>
            later.type === "step-start" ||
            later.type === "reasoning" ||
            (later.type === "text" && Boolean((later.text ?? "").trim())),
        );
      const toolStreaming = isStreaming && !hasLaterStepOrProse;
      const key = part.toolCallId
        ? nextKey(`tool:${part.toolCallId}`, true)
        : nextKey(`tool:${part.type}`);

      if (isAlwaysVisibleShowTool(part)) {
        entries.push({
          shape: "g",
          key,
          partIndex: i,
          part,
          isStreaming: toolStreaming,
        });
        rawChars.push("g");
        continue;
      }

      const shape = NON_STEP_TOOLS.has(part.type) ? "k" : "w";
      entries.push({
        shape,
        key,
        partIndex: i,
        part,
        isStreaming: toolStreaming,
      });
      rawChars.push(shape);
      continue;
    }

    if (isGitDataPart(part)) {
      if (!shouldRenderGitDataPart(part)) continue;
      entries.push({
        shape: "g",
        key: part.id
          ? nextKey(`data:${part.type}:${part.id}`, true)
          : nextKey(`data:${part.type}`),
        partIndex: i,
        part,
        isStreaming: false,
      });
      rawChars.push("g");
      continue;
    }

    if (part.type === "file" || part.type === "data-snippet") {
      entries.push({
        shape: "g",
        key: nextKey(part.type),
        partIndex: i,
        part,
        isStreaming: false,
      });
      rawChars.push("g");
    }
  }

  flushReasoning();

  const chars = settleLeads(rawChars, isStreaming, !isStreaming);
  const nod = (i: number) => chars[i] === "t" && rawChars[i] === "l";

  let answerAt = -1;
  if (isStreaming) {
    for (let i = chars.length - 1; i >= 0; i--) {
      if (chars[i] === "t") {
        answerAt = i;
        break;
      }
      if (chars[i] !== ".") break;
    }
  } else {
    let nodAt = -1;
    for (let i = chars.length - 1; i >= 0 && answerAt < 0; i--) {
      if (chars[i] !== "t") continue;
      if (nod(i)) {
        if (nodAt < 0) nodAt = i;
        continue;
      }
      answerAt = i;
    }
    if (answerAt < 0) answerAt = nodAt;
  }

  const tailIndexes = new Set<number>();
  if (!isStreaming && answerAt >= 0) {
    for (let i = answerAt + 1; i < chars.length; i++) {
      if (chars[i] === "t") tailIndexes.add(i);
    }
  }

  // Build flow chunks & collect work summary
  const flow: AssistantFlowChunk[] = [];
  const changedFileSet = new Set<string>();
  let add = 0;
  let del = 0;
  let totalSteps = 0;
  let hasReasoning = false;
  let hasWork = false;
  let waiting = false;

  let currentRunItems: WorkItem[] = [];
  let currentRunSteps = 0;
  let currentRunAt: string | null = null;
  let currentRunHasReasoning = false;
  let currentRunApprovalIds: string[] = [];
  let currentRunNarr: string[] = [];

  const closeRun = () => {
    if (currentRunItems.length === 0) return;
    const key = currentRunAt ?? currentRunItems[0].key;
    flow.push({
      kind: "steps",
      key,
      items: currentRunItems,
      rows: groupWorkRunItems(currentRunItems),
      stepCount: currentRunSteps,
      thoughtOnly: currentRunSteps === 0 && currentRunHasReasoning,
      hasApprovalRequested: currentRunApprovalIds.length > 0,
      approvalIds: currentRunApprovalIds,
      narr: currentRunNarr,
    });
    currentRunItems = [];
    currentRunSteps = 0;
    currentRunAt = null;
    currentRunHasReasoning = false;
    currentRunApprovalIds = [];
    currentRunNarr = [];
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const ch = chars[i];

    if (ch === "g" && entry.shape === "g") {
      closeRun();
      flow.push({
        kind: "show",
        key: entry.key,
        partIndex: entry.partIndex,
        part: entry.part,
        isStreaming: entry.isStreaming,
      });
      continue;
    }

    if (ch === "t" && (entry.shape === "t" || entry.shape === "l")) {
      closeRun();
      const isAnswer = i === answerAt;
      const isTail = tailIndexes.has(i);
      flow.push({
        kind: "text",
        key: entry.key,
        partIndex: entry.partIndex,
        part: entry.part,
        isStreaming: entry.isStreaming,
        isNote: false, // populated after we know whether the turn has work
        isAnswer,
        isTail,
      });
      continue;
    }

    // Work item (tool step, todo, reasoning, or folded lead-in)
    hasWork = true;
    if (entry.shape === "h") {
      hasReasoning = true;
      currentRunHasReasoning = true;
      if (currentRunAt === null) currentRunAt = entry.key;
      currentRunItems.push({
        kind: "reasoning",
        key: entry.key,
        startIndex: entry.startIndex,
        parts: entry.parts,
      });
      continue;
    }

    if (entry.shape === "l") {
      currentRunNarr.push(entry.part.text);
      currentRunItems.push({
        kind: "lead",
        key: entry.key,
        partIndex: entry.partIndex,
        part: entry.part,
        isStreaming: entry.isStreaming,
      });
      continue;
    }

    if (entry.shape === "w" || entry.shape === "k") {
      const part = entry.part;
      if (currentRunAt === null) currentRunAt = entry.key;
      if (entry.shape === "w") {
        totalSteps += 1;
        currentRunSteps += 1;
      }

      if (part.state === "approval-requested") {
        waiting = true;
        if (part.approval?.id) {
          currentRunApprovalIds.push(part.approval.id);
        }
      } else if (
        part.type === "tool-ask_user_question" &&
        part.state === "input-available"
      ) {
        waiting = true;
      }

      const input =
        part.input && typeof part.input === "object"
          ? (part.input as Record<string, unknown>)
          : undefined;
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

      currentRunItems.push({
        kind: "tool",
        key: entry.key,
        partIndex: entry.partIndex,
        part,
        isTodo: entry.shape === "k",
        isStreaming: entry.isStreaming,
      });
    }
  }

  closeRun();

  // Mark intermediate notes (Sable `foldNotes`: every non-answer, non-tail text folds when turn has work)
  let hasNotes = false;
  if (hasWork) {
    for (const chunk of flow) {
      if (chunk.kind === "text" && !chunk.isAnswer && !chunk.isTail) {
        chunk.isNote = true;
        hasNotes = true;
      }
    }
  }

  let runCount = 0;
  let headAt = -1;
  for (let i = 0; i < flow.length; i++) {
    const chunk = flow[i];
    if (chunk.kind === "steps") {
      runCount += 1;
      if (headAt < 0) headAt = i;
    } else if (chunk.kind === "text" && chunk.isNote && headAt < 0) {
      headAt = i;
    }
  }

  // Compute Sable-style live status for the newest checkpoint
  const lastChunk = flow[flow.length - 1];
  const liveRun = lastChunk?.kind === "steps" ? lastChunk : null;
  let liveTitle = "";
  let stepping = false;
  let activeSubagents = 0;
  let writingLead = false;

  if (liveRun) {
    const items = liveRun.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.kind === "tool") {
        const running = isPartRunningTool(item.part, isStreaming);
        if (running) {
          stepping = true;
          if (item.part.type === "tool-task") activeSubagents += 1;
          if (!liveTitle) {
            const inp =
              item.part.input && typeof item.part.input === "object"
                ? (item.part.input as Record<string, unknown>)
                : undefined;
            liveTitle = describeToolActivity(item.part.type, inp);
          }
        }
      } else if (
        item.kind === "reasoning" &&
        !liveTitle &&
        isStreaming &&
        item.parts.some((p) => p.state === "streaming")
      ) {
        const combined = item.parts.map((p) => p.text).join("\n\n");
        liveTitle = thinkingHeadline(combined) || "Thinking";
      } else if (
        i === items.length - 1 &&
        item.kind === "lead" &&
        item.isStreaming
      ) {
        writingLead = true;
      }
    }

    if (activeSubagents > 1) {
      liveTitle = `Running ${activeSubagents} sub-agents`;
    } else if (!writingLead && liveRun.narr.length > 0 && stepping) {
      const latestLead = liveRun.narr[liveRun.narr.length - 1];
      const stripped = leadTitle(latestLead);
      if (stripped) liveTitle = stripped;
    }
  }

  const speaking =
    isStreaming &&
    lastChunk?.kind === "text" &&
    (lastChunk.isStreaming || lastChunk.part.text.trim().length > 0);
  const quiet = speaking && !waiting && !stepping;

  const changedFiles = Array.from(changedFileSet);

  return {
    flow,
    hasWork,
    headAt,
    runCount,
    multi: runCount > 1 || hasNotes,
    totalSteps,
    thoughtOnly: totalSteps === 0 && hasReasoning,
    changes: {
      files: changedFiles.length,
      add,
      del,
    },
    changedFiles,
    live: {
      waiting,
      title: liveTitle || "Working",
      quiet,
      stepCount: liveRun?.stepCount ?? 0,
    },
  };
}

/**
 * Summarizes an assistant message's work (backwards-compatible wrapper over `buildAssistantTurnFlow`).
 */
export function summarizeTurnWork(message: WebAgentUIMessage): TurnWorkSummary {
  const hasStreamingPart = message.parts.some(
    (p) =>
      (isReasoningUIPart(p) && p.state === "streaming") ||
      (isToolUIPart(p) &&
        (p.state === "input-streaming" ||
          p.state === "input-available" ||
          p.state === "approval-requested")),
  );
  const flow = buildAssistantTurnFlow(message, hasStreamingPart);
  return {
    hasCollapsible: flow.hasWork,
    stepCount: flow.totalSteps,
    thoughtOnly: flow.thoughtOnly,
    changes: flow.changes,
    changedFiles: flow.changedFiles,
    liveLabel: flow.live.title,
  };
}
