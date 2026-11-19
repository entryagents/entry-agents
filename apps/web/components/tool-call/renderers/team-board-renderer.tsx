"use client";

import { GitBranch, Share2 } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

const KIND_LABELS: Record<string, string> = {
  decision: "Decision",
  contract: "Contract",
  challenge: "Challenge",
  verification: "Verified",
  handoff: "Handoff",
  blocker: "Blocker",
  debate: "Debate",
  finding: "Finding",
  question: "Question",
  artifact: "Artifact",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  blocked: "Blocked",
  parked: "Parked",
};

export function TeamBoardRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-team_board">) {
  const input = part.input;
  const output = part.state === "output-available" ? part.output : undefined;

  const action = output?.action ?? input?.action ?? "sync";
  const postedKind = output?.postedEntry?.kind ?? input?.kind;
  const postedTarget = output?.postedEntry?.targetRole ?? input?.targetRole;
  const kindLabel = postedKind ? (KIND_LABELS[postedKind] ?? postedKind) : "";
  const postPrefix = kindLabel ? `${kindLabel}: ` : "";
  const postTargetSuffix = postedTarget ? ` → @${postedTarget}` : "";

  const updatedStatus = output?.updatedTask?.status ?? input?.status;
  const statusLabel = updatedStatus
    ? (STATUS_LABELS[updatedStatus] ?? updatedStatus)
    : undefined;
  const updatedWorktree =
    output?.updatedTask?.worktreeBranch ?? input?.worktreeBranch;

  const waveCount = output?.teamSnapshot?.waves?.length ?? 0;
  const plannedCount =
    output?.teamSnapshot?.tasks.length ?? input?.tasks?.length ?? 0;

  const labelMap: Record<string, string> = {
    post: input?.title
      ? `${postPrefix}${input.title}${postTargetSuffix}`
      : `${postPrefix}Posted team note${postTargetSuffix}`,
    read: "Synced team board",
    plan_tasks:
      waveCount > 0
        ? `Planned ${waveCount} wave${waveCount === 1 ? "" : "s"} · ${plannedCount} task${plannedCount === 1 ? "" : "s"}`
        : `Planned ${plannedCount} task${plannedCount === 1 ? "" : "s"}`,
    update_task: input?.taskId
      ? `${input.taskId}${statusLabel ? ` · ${statusLabel}` : ""}`
      : "Updated task",
  };

  const summary = labelMap[action] ?? action;
  const snap = output?.teamSnapshot;
  const doneCount = snap
    ? snap.tasks.filter((t) => t.status === "completed").length
    : 0;
  const conflictCount = snap?.fileConflicts?.length ?? 0;
  const metaParts: string[] = [];
  if (snap) {
    if (snap.tasks.length > 0) {
      metaParts.push(`${doneCount}/${snap.tasks.length} tasks`);
    }
    if (snap.entries.length > 0) {
      metaParts.push(`${snap.entries.length} notes`);
    }
    if (conflictCount > 0) {
      metaParts.push(
        `${conflictCount} conflict${conflictCount === 1 ? "" : "s"}`,
      );
    }
  }
  const meta =
    updatedWorktree && metaParts.length === 0 ? (
      <span className="inline-flex items-center gap-1 font-mono text-[11px]">
        <GitBranch className="size-3" strokeWidth={1.5} />
        {updatedWorktree}
      </span>
    ) : metaParts.length > 0 ? (
      metaParts.join(" · ")
    ) : undefined;

  return (
    <ToolLayout
      icon={<Share2 className="h-3.5 w-3.5" strokeWidth={1.5} />}
      name="Team Board"
      summary={summary}
      meta={meta}
      state={state}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
