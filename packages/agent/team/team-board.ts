import type { ModelMessage } from "ai";

export type TeamBoardEntryKind =
  | "finding"
  | "decision"
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
  notes?: string;
  updatedBy: string;
  updatedAt: number;
}

export interface TeamBoardSnapshot {
  teamId: string;
  entries: TeamBoardEntry[];
  tasks: TeamWorkItem[];
}

const MAX_BOARD_ENTRIES = 80;
const MAX_TEAM_TASKS = 50;

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
      notes?: string;
    }>,
    updatedBy: string,
  ): TeamWorkItem[] {
    const now = Date.now();
    for (const item of items) {
      if (this.tasks.size >= MAX_TEAM_TASKS && !this.tasks.has(item.id)) {
        break;
      }
      const prev = this.tasks.get(item.id);
      this.tasks.set(item.id, {
        id: item.id,
        title: item.title.trim(),
        assignedRole: item.assignedRole,
        status: item.status ?? prev?.status ?? "open",
        ...(item.dependsOn ? { dependsOn: item.dependsOn } : {}),
        ...(item.notes !== undefined
          ? { notes: item.notes }
          : prev?.notes
            ? { notes: prev.notes }
            : {}),
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
    notes?: string,
  ): TeamWorkItem | null {
    const existing = this.tasks.get(taskId);
    if (!existing) return null;
    const updated: TeamWorkItem = {
      ...existing,
      status,
      updatedBy,
      updatedAt: Date.now(),
      ...(notes !== undefined ? { notes } : {}),
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
    return {
      teamId: this.teamId,
      entries: [...this.entries],
      tasks: this.listTasks(),
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

  if (snap.tasks.length > 0) {
    lines.push("", "### Team Tasks");
    for (const task of snap.tasks.slice(-15)) {
      lines.push(
        `- [${task.status}] \`${task.id}\` (${task.assignedRole}): ${task.title}${task.notes ? ` — ${task.notes}` : ""}`,
      );
    }
  }

  if (snap.entries.length > 0) {
    lines.push("", "### Recent Teammate Findings & Handoffs");
    for (const entry of snap.entries.slice(-12)) {
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
