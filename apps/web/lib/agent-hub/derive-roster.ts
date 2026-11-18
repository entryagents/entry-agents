import type { LanguageModelUsage } from "ai";
import {
  extractCachedInputTokens,
  extractCacheWriteTokens,
} from "@/lib/chat/usage-extract";

// Pure derivation of the Agent Hub roster from persisted chat messages.
//
// Nothing here talks to the network: the durable workflow already
// persists every `task` tool part (including streamed preliminary
// outputs) into the chat's messages, so the roster is reconstructable
// after a refresh or reconnect with no extra state. Missing metrics stay
// `null` and are rendered as "—" -- never estimated (oh-my-pi's rule).

export type AgentHubStatus =
  | "starting"
  | "running"
  | "awaiting-approval"
  | "completed"
  | "failed"
  | "denied";

export interface AgentHubPendingCall {
  name: string;
  input: unknown;
}

export interface AgentHubEntry {
  /** toolCallId of the `task` call; stable across reloads. */
  id: string;
  /** Position among sibling subagents, 1-based, for display ("#2"). */
  index: number;
  messageId: string;
  subagentType: string;
  title: string;
  instructions: string;
  status: AgentHubStatus;
  modelId: string | null;
  startedAt: number | null;
  toolCallCount: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  cacheWriteTokens: number | null;
  pending: AgentHubPendingCall | null;
  streamedText: string | null;
  /** Subagent session id (resumable follow-ups), when reported. */
  sessionId: string | null;
  /** Isolated git worktree branch (e.g. team/executor-ab12cd34), when active. */
  worktreeBranch: string | null;
  /** Lineage depth: 0 = spawned by the main agent. */
  depth: number;
  /** id of the parent entry, null when spawned by the main agent. */
  parentId: string | null;
  errorText: string | null;
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

function isTaskPart(part: unknown): part is RawToolPart {
  if (typeof part !== "object" || part === null) return false;
  const p = part as {
    type?: unknown;
    toolCallId?: unknown;
    toolName?: unknown;
    name?: unknown;
  };
  if (typeof p.toolCallId !== "string") return false;
  return (
    p.type === "tool-task" ||
    ((p.type === "dynamic-tool" || p.type === "tool-call") &&
      (p.toolName === "task" || p.name === "task"))
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function statusOf(part: RawToolPart): AgentHubStatus {
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

export interface DeriveAgentHubRosterOptions {
  /** Whether the parent chat run is currently streaming. When false, incomplete task parts reconcile to failed instead of staying stuck as running. */
  isParentStreaming?: boolean;
}

export function deriveAgentHubRoster(
  messages: unknown,
  options?: DeriveAgentHubRosterOptions,
): AgentHubEntry[] {
  if (!Array.isArray(messages)) return [];
  const entries: AgentHubEntry[] = [];
  const rawMessages = messages as RawMessage[];
  let lastAssistantIndex = -1;
  for (let i = rawMessages.length - 1; i >= 0; i -= 1) {
    if (rawMessages[i]?.role === "assistant") {
      lastAssistantIndex = i;
      break;
    }
  }
  const isParentStreaming = options?.isParentStreaming ?? true;

  for (let msgIdx = 0; msgIdx < rawMessages.length; msgIdx += 1) {
    const raw = rawMessages[msgIdx];
    if (!raw || raw.role !== "assistant" || !Array.isArray(raw.parts)) continue;
    const isTurnActive = isParentStreaming && msgIdx === lastAssistantIndex;
    for (const part of raw.parts) {
      if (!isTaskPart(part)) continue;
      const input = asRecord(part.input);
      const output = asRecord(part.output);
      const usage = asRecord(
        output?.usage,
      ) as Partial<LanguageModelUsage> | null;
      const pending = asRecord(output?.pending);
      const depth = numberOrNull(output?.depth) ?? 0;
      const cacheRead = extractCachedInputTokens(
        usage as LanguageModelUsage | undefined,
      );
      const cacheWrite = extractCacheWriteTokens(
        usage as LanguageModelUsage | undefined,
      );
      const rawStatus = statusOf(part);
      const resolvedStatus: AgentHubStatus =
        !isTurnActive && (rawStatus === "starting" || rawStatus === "running")
          ? "failed"
          : rawStatus;

      entries.push({
        id: part.toolCallId as string,
        index: entries.length + 1,
        messageId: raw.id ?? "",
        subagentType:
          typeof input?.subagent_type === "string"
            ? input.subagent_type
            : typeof input?.subagentType === "string"
              ? input.subagentType
              : "agent",
        title:
          typeof input?.task === "string" && input.task.length > 0
            ? input.task
            : "Spawning subagent",
        instructions:
          typeof input?.instructions === "string" ? input.instructions : "",
        status: resolvedStatus,
        modelId: typeof output?.modelId === "string" ? output.modelId : null,
        startedAt: numberOrNull(output?.startedAt),
        toolCallCount: numberOrNull(output?.toolCallCount),
        inputTokens: numberOrNull(usage?.inputTokens),
        outputTokens: numberOrNull(usage?.outputTokens),
        cachedInputTokens: cacheRead > 0 ? cacheRead : null,
        cacheWriteTokens: cacheWrite > 0 ? cacheWrite : null,
        pending:
          pending && typeof pending.name === "string"
            ? { name: pending.name, input: pending.input }
            : null,
        streamedText:
          typeof output?.streamedText === "string" ? output.streamedText : null,
        sessionId:
          typeof output?.sessionId === "string" ? output.sessionId : null,
        worktreeBranch:
          typeof output?.worktreeBranch === "string"
            ? output.worktreeBranch
            : null,
        depth,
        parentId: null,
        errorText: typeof part.errorText === "string" ? part.errorText : null,
      });
    }
  }

  // Lineage: a depth-N entry's parent is the nearest preceding entry at
  // depth N-1 (subagents report depth; today the cap is 1).
  const lastAtDepth = new Map<number, string>();
  for (const entry of entries) {
    entry.parentId =
      entry.depth > 0 ? (lastAtDepth.get(entry.depth - 1) ?? null) : null;
    lastAtDepth.set(entry.depth, entry.id);
  }
  return entries;
}

export function isLiveStatus(status: AgentHubStatus): boolean {
  return (
    status === "starting" ||
    status === "running" ||
    status === "awaiting-approval"
  );
}

export interface AgentHubTotals {
  total: number;
  live: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
}

export function summarizeAgentHub(entries: AgentHubEntry[]): AgentHubTotals {
  return entries.reduce<AgentHubTotals>(
    (acc, entry) => ({
      total: acc.total + 1,
      live: acc.live + (isLiveStatus(entry.status) ? 1 : 0),
      inputTokens: acc.inputTokens + (entry.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (entry.outputTokens ?? 0),
      cachedInputTokens: acc.cachedInputTokens + (entry.cachedInputTokens ?? 0),
      cacheWriteTokens: acc.cacheWriteTokens + (entry.cacheWriteTokens ?? 0),
    }),
    {
      total: 0,
      live: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
    },
  );
}

export interface TeamFeedEntry {
  id: string;
  kind:
    | "finding"
    | "decision"
    | "contract"
    | "artifact"
    | "handoff"
    | "blocker"
    | "question"
    | "debate"
    | "challenge"
    | "verification";
  authorRole: string;
  targetRole?: string;
  title: string;
  content: string;
  files?: string[];
  mentions?: string[];
  createdAt: number;
}

export interface TeamFeedTask {
  id: string;
  title: string;
  assignedRole: string;
  status: "open" | "in_progress" | "completed" | "blocked" | "parked";
  dependsOn?: string[];
  files?: string[];
  notes?: string;
  verification?: string;
  worktreeBranch?: string;
  updatedBy: string;
  updatedAt: number;
}

export interface TeamFeedFileConflict {
  file: string;
  roles: string[];
  taskIds: string[];
}

export interface TeamFeedWave {
  wave: number;
  taskIds: string[];
  status: "completed" | "active" | "queued" | "blocked";
}

export interface TeamFeedState {
  entries: TeamFeedEntry[];
  tasks: TeamFeedTask[];
  fileConflicts: TeamFeedFileConflict[];
  waves: TeamFeedWave[];
}

function isTeamBoardPart(part: unknown): part is RawToolPart {
  if (typeof part !== "object" || part === null) return false;
  const p = part as {
    type?: unknown;
    toolName?: unknown;
    name?: unknown;
  };
  return (
    p.type === "tool-team_board" ||
    ((p.type === "dynamic-tool" || p.type === "tool-call") &&
      (p.toolName === "team_board" || p.name === "team_board"))
  );
}

function isSettledFeedStatus(
  status: TeamFeedTask["status"] | undefined,
): boolean {
  return status === "completed" || status === "parked";
}

function computeFeedWaves(tasks: TeamFeedTask[]): TeamFeedWave[] {
  if (tasks.length === 0) return [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const waveById = new Map<string, number>();
  const visiting = new Set<string>();

  const getWave = (taskId: string): number => {
    const cached = waveById.get(taskId);
    if (cached !== undefined) return cached;
    if (visiting.has(taskId)) return 1;
    visiting.add(taskId);
    const task = byId.get(taskId);
    let depth = 1;
    if (task?.dependsOn?.length) {
      for (const dep of task.dependsOn) {
        if (!byId.has(dep) || dep === taskId) continue;
        depth = Math.max(depth, getWave(dep) + 1);
      }
    }
    visiting.delete(taskId);
    waveById.set(taskId, depth);
    return depth;
  };

  for (const t of tasks) getWave(t.id);

  const buckets = new Map<number, TeamFeedTask[]>();
  for (const t of tasks) {
    const w = waveById.get(t.id) ?? 1;
    const list = buckets.get(w) ?? [];
    list.push(t);
    buckets.set(w, list);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([wave, items]) => {
      const nonParkedItems = items.filter((i) => i.status !== "parked");
      let status: TeamFeedWave["status"] = "queued";
      if (items.every((i) => isSettledFeedStatus(i.status))) {
        status = "completed";
      } else if (items.some((i) => i.status === "blocked")) {
        status = "blocked";
      } else if (
        nonParkedItems.some((i) => i.status === "in_progress") ||
        (nonParkedItems.length > 0 &&
          nonParkedItems.every(
            (i) =>
              !i.dependsOn?.length ||
              i.dependsOn.every((dep) =>
                isSettledFeedStatus(byId.get(dep)?.status),
              ),
          ))
      ) {
        status = "active";
      }
      return {
        wave,
        taskIds: items.map((i) => i.id),
        status,
      };
    });
}

function computeTaskFileConflicts(
  tasks: TeamFeedTask[],
): TeamFeedFileConflict[] {
  const byFile = new Map<
    string,
    { roles: Set<string>; taskIds: Set<string> }
  >();
  for (const task of tasks) {
    if (
      task.status === "completed" ||
      task.status === "parked" ||
      !task.files
    ) {
      continue;
    }
    for (const rawFile of task.files) {
      const cleaned = rawFile.trim().replace(/^\.\//, "");
      if (!cleaned) continue;
      let bucket = byFile.get(cleaned);
      if (!bucket) {
        bucket = { roles: new Set(), taskIds: new Set() };
        byFile.set(cleaned, bucket);
      }
      bucket.roles.add(task.assignedRole);
      bucket.taskIds.add(task.id);
    }
  }
  const conflicts: TeamFeedFileConflict[] = [];
  for (const [file, bucket] of byFile.entries()) {
    if (bucket.taskIds.size >= 2) {
      conflicts.push({
        file,
        roles: [...bucket.roles],
        taskIds: [...bucket.taskIds],
      });
    }
  }
  return conflicts;
}

export function deriveTeamFeed(messages: unknown): TeamFeedState {
  if (!Array.isArray(messages)) {
    return { entries: [], tasks: [], fileConflicts: [], waves: [] };
  }

  const entryMap = new Map<string, TeamFeedEntry>();
  const taskMap = new Map<string, TeamFeedTask>();

  const absorbSnapshot = (snap: Record<string, unknown> | null) => {
    if (!snap) return;
    if (Array.isArray(snap.entries)) {
      for (const rawEntry of snap.entries) {
        const e = asRecord(rawEntry);
        if (!e || typeof e.id !== "string" || typeof e.title !== "string") {
          continue;
        }
        const kindRaw = typeof e.kind === "string" ? e.kind : "finding";
        const kind = (
          [
            "finding",
            "decision",
            "contract",
            "artifact",
            "handoff",
            "blocker",
            "question",
            "debate",
            "challenge",
            "verification",
          ].includes(kindRaw)
            ? kindRaw
            : "finding"
        ) as TeamFeedEntry["kind"];
        entryMap.set(e.id, {
          id: e.id,
          kind,
          authorRole: typeof e.authorRole === "string" ? e.authorRole : "agent",
          ...(typeof e.targetRole === "string"
            ? { targetRole: e.targetRole }
            : {}),
          title: e.title,
          content: typeof e.content === "string" ? e.content : "",
          ...(Array.isArray(e.files)
            ? {
                files: e.files.filter(
                  (f): f is string => typeof f === "string",
                ),
              }
            : {}),
          ...(Array.isArray(e.mentions)
            ? {
                mentions: e.mentions.filter(
                  (m): m is string => typeof m === "string",
                ),
              }
            : {}),
          createdAt: numberOrNull(e.createdAt) ?? 0,
        });
      }
    }

    if (Array.isArray(snap.tasks)) {
      for (const rawTask of snap.tasks) {
        const t = asRecord(rawTask);
        if (!t || typeof t.id !== "string" || typeof t.title !== "string") {
          continue;
        }
        const statusRaw = typeof t.status === "string" ? t.status : "open";
        const status = (
          ["open", "in_progress", "completed", "blocked", "parked"].includes(
            statusRaw,
          )
            ? statusRaw
            : "open"
        ) as TeamFeedTask["status"];
        const prevTask = taskMap.get(t.id);
        const files = Array.isArray(t.files)
          ? t.files.filter((f): f is string => typeof f === "string")
          : prevTask?.files;
        const verification =
          typeof t.verification === "string" && t.verification.trim().length > 0
            ? t.verification.trim()
            : prevTask?.verification;
        const worktreeBranch =
          typeof t.worktreeBranch === "string" &&
          t.worktreeBranch.trim().length > 0
            ? t.worktreeBranch.trim()
            : prevTask?.worktreeBranch;

        taskMap.set(t.id, {
          id: t.id,
          title: t.title,
          assignedRole:
            typeof t.assignedRole === "string" ? t.assignedRole : "executor",
          status,
          ...(Array.isArray(t.dependsOn)
            ? {
                dependsOn: t.dependsOn.filter(
                  (d): d is string => typeof d === "string",
                ),
              }
            : prevTask?.dependsOn
              ? { dependsOn: prevTask.dependsOn }
              : {}),
          ...(files && files.length > 0 ? { files } : {}),
          ...(typeof t.notes === "string"
            ? { notes: t.notes }
            : prevTask?.notes
              ? { notes: prevTask.notes }
              : {}),
          ...(verification ? { verification } : {}),
          ...(worktreeBranch ? { worktreeBranch } : {}),
          updatedBy: typeof t.updatedBy === "string" ? t.updatedBy : "main",
          updatedAt: numberOrNull(t.updatedAt) ?? 0,
        });
      }
    }
  };

  for (const raw of messages as RawMessage[]) {
    if (!raw || raw.role !== "assistant" || !Array.isArray(raw.parts)) continue;
    for (const part of raw.parts) {
      if (!isTeamBoardPart(part) && !isTaskPart(part)) continue;
      const rawPart = part as RawToolPart;
      const output = asRecord(rawPart.output);
      if (!output) continue;
      const snap = asRecord(output.teamSnapshot ?? output);
      absorbSnapshot(snap);
    }
  }

  const tasks = [...taskMap.values()];
  return {
    entries: [...entryMap.values()].sort((a, b) => a.createdAt - b.createdAt),
    tasks,
    fileConflicts: computeTaskFileConflicts(tasks),
    waves: computeFeedWaves(tasks),
  };
}
