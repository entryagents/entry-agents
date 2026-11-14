"use client";

import { Share2 } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

export function TeamBoardRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-team_board">) {
  const input = part.input;
  const output = part.state === "output-available" ? part.output : undefined;

  const action = output?.action ?? input?.action ?? "sync";
  const labelMap: Record<string, string> = {
    post: input?.title ? `Posted "${input.title}"` : "Posted note",
    read: "Read team board",
    plan_tasks: "Planned team tasks",
    update_task: input?.taskId ? `Updated ${input.taskId}` : "Updated task",
  };

  const summary = labelMap[action] ?? action;
  const meta = output?.teamSnapshot
    ? `${output.teamSnapshot.entries.length} notes · ${output.teamSnapshot.tasks.length} tasks`
    : undefined;

  return (
    <ToolLayout
      icon={<Share2 className="h-3.5 w-3.5" />}
      name="Team Board"
      summary={summary}
      meta={meta}
      state={state}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
