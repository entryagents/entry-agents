import type { ModelMessage } from "ai";

export type TeamBoardEntryKind =
  | "finding"
  | "decision"
  | "contract"
  | "artifact"
  | "handoff"
  | "blocker"
  | "question";

export type TeamTaskStatus = "open" | "in_progress" | "completed" | "blocked";

export interface TeamBoardEntry {
  id: string;
  kind: TeamBoardEntryKind;
  authorRole: string;
  authorSessionId?: string;
  targetRole?: string;
  title: string;
  content: string;
  files?: string[];
  createdAt: number;
}

export interface TeamWorkItem {
  id: string;
  title: string;
  assignedRole: string;
  status: TeamTaskStatus;
  dependsOn?: string[];
  files?: string[];
  notes?: string;
  verification?: string;
  updatedBy: string;
  updatedAt: number;
}

export interface TeamFileConflict {
  file: string;
  roles: string[];
  taskIds: string[];
}

export interface TeamExecutionWave {
  wave: number;
  taskIds: string[];
  status: "completed" | "active" | "queued" | "blocked";
}

export interface TeamBoardSnapshot {
  teamId: string;
  entries: TeamBoardEntry[];
  tasks: TeamWorkItem[];
  fileConflicts?: TeamFileConflict[];
  waves?: TeamExecutionWave[];
}

const MAX_BOARD_ENTRIES = 80;
const MAX_TEAM_TASKS = 50;

function normalizeFileClaimList(files: string[] | undefined): string[] {
  if (!files || files.length === 0) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of files) {
    const cleaned = raw.trim().replace(/^\.\//, "");
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    normalized.push(cleaned);
  }
  return normalized;
}

/**
 * Computes dependency-ordered execution waves from task `dependsOn` edges.
 * Independent tasks land in the same parallel wave; dependent tasks wait for
 * upstream prerequisites. Cycles fall back safely into subsequent waves.
 */
export function computeExecutionWaves(
  tasks: TeamWorkItem[],
): TeamExecutionWave[] {
  if (tasks.length === 0) return [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const waveIndexById = new Map<string, number>();
  const visiting = new Set<string>();

  const getWave = (taskId: string): number => {
    const cached = waveIndexById.get(taskId);
    if (cached !== undefined) return cached;
    if (visiting.has(taskId)) return 1;
    visiting.add(taskId);

    const task = byId.get(taskId);
    let depth = 1;
    if (task?.dependsOn && task.dependsOn.length > 0) {
      for (const depId of task.dependsOn) {
        if (!byId.has(depId) || depId === taskId) continue;
        depth = Math.max(depth, getWave(depId) + 1);
      }
    }

    visiting.delete(taskId);
    waveIndexById.set(taskId, depth);
    return depth;
  };

  for (const t of tasks) {
    getWave(t.id);
  }

  const buckets = new Map<number, TeamWorkItem[]>();
  for (const t of tasks) {
    const w = waveIndexById.get(t.id) ?? 1;
    const list = buckets.get(w) ?? [];
    list.push(t);
    buckets.set(w, list);
  }

  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([wave, items]) => {
      let status: TeamExecutionWave["status"] = "queued";
      if (items.every((i) => i.status === "completed")) {
        status = "completed";
      } else if (items.some((i) => i.status === "blocked")) {
        status = "blocked";
      } else if (
        items.some((i) => i.status === "in_progress") ||
        items.every(
          (i) =>
            !i.dependsOn?.length ||
            i.dependsOn.every((dep) => byId.get(dep)?.status === "completed"),
        )
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

/**
 * Detects active (non-completed) tasks claiming overlapping repository paths
 * so teammates avoid colliding edits on the same file.
 */
export function findFileOwnershipConflicts(
  tasks: TeamWorkItem[],
): TeamFileConflict[] {
  const byFile = new Map<
    string,
    { roles: Set<string>; taskIds: Set<string> }
  >();

  for (const task of tasks) {
    if (task.status === "completed") continue;
    const files = normalizeFileClaimList(task.files);
    for (const file of files) {
      let bucket = byFile.get(file);
      if (!bucket) {
        bucket = { roles: new Set(), taskIds: new Set() };
        byFile.set(file, bucket);
      }
      bucket.roles.add(task.assignedRole);
      bucket.taskIds.add(task.id);
    }
  }

  const conflicts: TeamFileConflict[] = [];
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

export class TeamBoard {
  public readonly teamId: string;
  private entries: TeamBoardEntry[] = [];
  private tasks = new Map<string, TeamWorkItem>();

  constructor(teamId: string) {
    this.teamId = teamId;
  }

  postEntry(
    input: Omit<TeamBoardEntry, "id" | "createdAt"> & {
      id?: string;
      createdAt?: number;
    },
  ): TeamBoardEntry {
    const entry: TeamBoardEntry = {
      id: input.id ?? `tb_${crypto.randomUUID().slice(0, 8)}`,
      kind: input.kind,
      authorRole: input.authorRole,
      ...(input.authorSessionId
        ? { authorSessionId: input.authorSessionId }
        : {}),
      ...(input.targetRole ? { targetRole: input.targetRole } : {}),
      title: input.title.trim(),
      content: input.content.trim(),
      ...(input.files && input.files.length > 0 ? { files: input.files } : {}),
      createdAt: input.createdAt ?? Date.now(),
    };

    const existingIdx = this.entries.findIndex((item) => item.id === entry.id);
    if (existingIdx >= 0) {
      this.entries[existingIdx] = entry;
    } else {
      this.entries.push(entry);
      if (this.entries.length > MAX_BOARD_ENTRIES) {
        this.entries.splice(0, this.entries.length - MAX_BOARD_ENTRIES);
      }
    }
    return entry;
  }

  upsertTasks(
    items: Array<{
      id: string;
      title: string;
      assignedRole: string;
      status?: TeamTaskStatus;
      dependsOn?: string[];
      files?: string[];
      notes?: string;
      verification?: string;
    }>,
    updatedBy: string,
  ): TeamWorkItem[] {
    const now = Date.now();
    for (const item of items) {
      if (this.tasks.size >= MAX_TEAM_TASKS && !this.tasks.has(item.id)) {
        break;
      }
      const prev = this.tasks.get(item.id);
      const nextFiles =
        item.files !== undefined
          ? normalizeFileClaimList(item.files)
          : prev?.files;
      const nextVerification =
        item.verification !== undefined
          ? item.verification.trim() || undefined
          : prev?.verification;

      this.tasks.set(item.id, {
        id: item.id,
        title: item.title.trim(),
        assignedRole: item.assignedRole,
        status: item.status ?? prev?.status ?? "open",
        ...(item.dependsOn ? { dependsOn: item.dependsOn } : {}),
        ...(nextFiles && nextFiles.length > 0 ? { files: nextFiles } : {}),
        ...(item.notes !== undefined
          ? { notes: item.notes }
          : prev?.notes
            ? { notes: prev.notes }
            : {}),
        ...(nextVerification ? { verification: nextVerification } : {}),
        updatedBy,
        updatedAt: now,
      });
    }
    return this.listTasks();
  }

  updateTaskStatus(
    taskId: string,
    status: TeamTaskStatus,
    updatedBy: string,
    notesOrOptions?:
      | string
      | {
          notes?: string;
          files?: string[];
          verification?: string;
        },
  ): TeamWorkItem | null {
    const existing = this.tasks.get(taskId);
    if (!existing) return null;

    const opts =
      typeof notesOrOptions === "string"
        ? { notes: notesOrOptions }
        : (notesOrOptions ?? {});
    const nextFiles =
      opts.files !== undefined
        ? normalizeFileClaimList(opts.files)
        : existing.files;
    const nextVerification =
      opts.verification !== undefined
        ? opts.verification.trim() || undefined
        : existing.verification;

    const updated: TeamWorkItem = {
      ...existing,
      status,
      updatedBy,
      updatedAt: Date.now(),
      ...(nextFiles && nextFiles.length > 0 ? { files: nextFiles } : {}),
      ...(opts.notes !== undefined ? { notes: opts.notes } : {}),
      ...(nextVerification ? { verification: nextVerification } : {}),
    };
    this.tasks.set(taskId, updated);
    return updated;
  }

  listEntries(filter?: {
    kind?: TeamBoardEntryKind;
    authorRole?: string;
    targetRole?: string;
  }): TeamBoardEntry[] {
    return this.entries.filter((entry) => {
      if (filter?.kind && entry.kind !== filter.kind) return false;
      if (filter?.authorRole && entry.authorRole !== filter.authorRole)
        return false;
      if (
        filter?.targetRole &&
        entry.targetRole !== filter.targetRole &&
        entry.targetRole !== "all"
      ) {
        return false;
      }
      return true;
    });
  }

  listTasks(): TeamWorkItem[] {
    return [...this.tasks.values()];
  }

  snapshot(): TeamBoardSnapshot {
    const tasks = this.listTasks();
    const fileConflicts = findFileOwnershipConflicts(tasks);
    const waves = computeExecutionWaves(tasks);
    return {
      teamId: this.teamId,
      entries: [...this.entries],
      tasks,
      ...(fileConflicts.length > 0 ? { fileConflicts } : {}),
      ...(waves.length > 0 ? { waves } : {}),
    };
  }
}

const teamBoards = new Map<string, TeamBoard>();

export function getOrCreateTeamBoard(teamId: string): TeamBoard {
  let board = teamBoards.get(teamId);
  if (!board) {
    board = new TeamBoard(teamId);
    teamBoards.set(teamId, board);
    if (teamBoards.size > 200) {
      const oldestKey = teamBoards.keys().next().value;
      if (oldestKey) teamBoards.delete(oldestKey);
    }
  }
  return board;
}

export function clearTeamBoard(teamId: string): void {
  teamBoards.delete(teamId);
}

/**
 * Rehydrates shared team findings/tasks from persisted ModelMessage[] history so
 * team coordination survives durable workflow step boundaries cleanly.
 */
export function rebuildTeamBoardFromMessages(
  messages: unknown[],
  teamId: string,
): TeamBoard {
  const board = getOrCreateTeamBoard(teamId);
  if (!Array.isArray(messages)) return board;

  for (const msg of messages as Array<Partial<ModelMessage>>) {
    if (!msg || !Array.isArray(msg.content)) continue;
    for (const part of msg.content as Array<Record<string, unknown>>) {
      if (part?.type !== "tool-result") continue;
      if (part.toolName !== "team_board" && part.toolName !== "task") continue;

      const rawOutput = part.output as
        | { type?: string; value?: unknown }
        | unknown;
      const value =
        rawOutput &&
        typeof rawOutput === "object" &&
        "value" in rawOutput &&
        (rawOutput as { type?: string }).type === "json"
          ? (rawOutput as { value: unknown }).value
          : rawOutput;

      if (!value || typeof value !== "object") continue;
      const snapshot = (
        "teamSnapshot" in value
          ? (value as { teamSnapshot?: TeamBoardSnapshot }).teamSnapshot
          : value
      ) as Partial<TeamBoardSnapshot> | undefined;

      if (!snapshot) continue;
      if (Array.isArray(snapshot.entries)) {
        for (const entry of snapshot.entries) {
          if (entry && typeof entry.title === "string") {
            board.postEntry(entry);
          }
        }
      }
      if (Array.isArray(snapshot.tasks)) {
        board.upsertTasks(snapshot.tasks, "replay");
      }
    }
  }

  return board;
}

export function formatTeamContextSummary(board: TeamBoard): string {
  const snap = board.snapshot();
  if (snap.entries.length === 0 && snap.tasks.length === 0) {
    return "";
  }

  const lines: string[] = [
    "## Shared Team Board Snapshot",
    "Coordinate with teammates by reading/updating this shared board via `team_board`:",
  ];

  if (snap.waves && snap.waves.length > 0) {
    lines.push("", "### Execution Waves");
    for (const wave of snap.waves) {
      lines.push(
        `- Wave ${wave.wave} [${wave.status}]: ${wave.taskIds.join(", ")}`,
      );
    }
  }

  if (snap.tasks.length > 0) {
    lines.push("", "### Team Tasks");
    for (const task of snap.tasks.slice(-15)) {
      const files = task.files?.length
        ? ` [files: ${task.files.slice(0, 6).join(", ")}]`
        : "";
      const deps = task.dependsOn?.length
        ? ` (after: ${task.dependsOn.join(", ")})`
        : "";
      const verified = task.verification
        ? ` | verified: ${task.verification}`
        : "";
      lines.push(
        `- [${task.status}] \`${task.id}\` (${task.assignedRole}): ${task.title}${deps}${files}${task.notes ? ` — ${task.notes}` : ""}${verified}`,
      );
    }
  }

  if (snap.fileConflicts && snap.fileConflicts.length > 0) {
    lines.push("", "### File Ownership Warnings");
    for (const conflict of snap.fileConflicts) {
      lines.push(
        `- Overlap on \`${conflict.file}\` across tasks ${conflict.taskIds.join(", ")} (${conflict.roles.join(", ")}) — coordinate before editing.`,
      );
    }
  }

  const contracts = snap.entries.filter((e) => e.kind === "contract");
  if (contracts.length > 0) {
    lines.push("", "### Locked Interface Contracts");
    for (const contract of contracts.slice(-8)) {
      const target = contract.targetRole ? ` -> ${contract.targetRole}` : "";
      lines.push(
        `- **${contract.authorRole}${target}** — ${contract.title}: ${contract.content.slice(0, 320)}`,
      );
    }
  }

  const notes = snap.entries.filter((e) => e.kind !== "contract");
  if (notes.length > 0) {
    lines.push("", "### Recent Teammate Findings & Handoffs");
    for (const entry of notes.slice(-12)) {
      const target = entry.targetRole ? ` -> ${entry.targetRole}` : "";
      const files = entry.files?.length
        ? ` [files: ${entry.files.slice(0, 5).join(", ")}]`
        : "";
      lines.push(
        `- (${entry.kind}) **${entry.authorRole}${target}** — ${entry.title}${files}: ${entry.content.slice(0, 240)}`,
      );
    }
  }

  return lines.join("\n");
}
