import { tool, type UIToolInvocation } from "ai";
import { z } from "zod";
import {
  getOrCreateTeamBoard,
  type TeamBoardEntry,
  type TeamBoardSnapshot,
  type TeamWorkItem,
} from "../team/team-board";

const teamBoardEntryKindSchema = z.enum([
  "finding",
  "decision",
  "artifact",
  "handoff",
  "blocker",
  "question",
]);

const teamTaskStatusSchema = z.enum([
  "open",
  "in_progress",
  "completed",
  "blocked",
]);

const teamBoardInputSchema = z.object({
  action: z
    .enum(["post", "read", "plan_tasks", "update_task"])
    .describe(
      "Action to perform: post (share note), read (inspect board), plan_tasks (define team tasks), update_task (update task status)",
    ),
  kind: teamBoardEntryKindSchema
    .optional()
    .describe(
      "For post/read: finding, decision, artifact, handoff, blocker, or question",
    ),
  title: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .optional()
    .describe("For post: short title of the note or handoff"),
  content: z
    .string()
    .trim()
    .min(1)
    .max(4000)
    .optional()
    .describe(
      "For post: concrete findings, contract details, or handoff notes",
    ),
  authorRole: z
    .string()
    .trim()
    .max(40)
    .optional()
    .describe("For read: optional filter by author role"),
  targetRole: z
    .string()
    .trim()
    .max(40)
    .optional()
    .describe(
      "For post/read: optional recipient role (e.g. 'executor', 'reviewer', 'design', 'architect', 'main', 'all')",
    ),
  files: z
    .array(z.string().trim().max(260))
    .max(20)
    .optional()
    .describe("For post: relevant repository-relative file paths"),
  tasks: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(48),
        title: z.string().trim().min(1).max(200),
        assignedRole: z
          .enum([
            "main",
            "architect",
            "explorer",
            "executor",
            "design",
            "reviewer",
          ])
          .default("executor"),
        status: teamTaskStatusSchema.optional(),
        dependsOn: z.array(z.string().trim().max(48)).max(10).optional(),
        notes: z.string().trim().max(400).optional(),
      }),
    )
    .max(20)
    .optional()
    .describe("For plan_tasks: array of tasks assigned across team roles"),
  taskId: z
    .string()
    .trim()
    .min(1)
    .max(48)
    .optional()
    .describe("For update_task: target task ID"),
  status: teamTaskStatusSchema
    .optional()
    .describe("For update_task: new task status"),
  notes: z
    .string()
    .trim()
    .max(400)
    .optional()
    .describe("For update_task: optional progress note"),
});

export type TeamBoardToolInput = z.infer<typeof teamBoardInputSchema>;

export interface TeamBoardToolOutput {
  action: TeamBoardToolInput["action"];
  teamId: string;
  authorRole: string;
  postedEntry?: TeamBoardEntry;
  updatedTask?: TeamWorkItem | null;
  error?: string;
  teamSnapshot: TeamBoardSnapshot;
}

export const teamBoardTool = tool({
  needsApproval: false,
  description: `Collaborate with teammate agents via the shared team board.

Actions:
- \`post\`: Publish a codebase finding, architecture decision, handoff note, modified artifact list, or blocker for other teammates.
- \`read\`: Inspect recent findings, handoffs, and active team tasks from other agents before exploring or editing.
- \`plan_tasks\`: Break down multi-agent work into assigned team tasks (\`architect\`/\`main\`).
- \`update_task\`: Claim (\`in_progress\`), complete (\`completed\`), or mark a team task \`blocked\`.`,
  inputSchema: teamBoardInputSchema,
  execute: async (
    input,
    { experimental_context },
  ): Promise<TeamBoardToolOutput> => {
    const ctx = (experimental_context ?? {}) as {
      teamId?: string;
      agentRole?: string;
      agentSessionId?: string;
    };
    const teamId = ctx.teamId || "default-team";
    const authorRole = ctx.agentRole || "main";
    const board = getOrCreateTeamBoard(teamId);

    switch (input.action) {
      case "post": {
        const title = input.title?.trim();
        const content = input.content?.trim();
        if (!title || !content) {
          return {
            action: "post",
            teamId,
            authorRole,
            error: "Both `title` and `content` are required for `post`.",
            teamSnapshot: board.snapshot(),
          };
        }
        const postedEntry = board.postEntry({
          kind: input.kind ?? "finding",
          authorRole,
          ...(ctx.agentSessionId
            ? { authorSessionId: ctx.agentSessionId }
            : {}),
          ...(input.targetRole ? { targetRole: input.targetRole } : {}),
          title,
          content,
          ...(input.files ? { files: input.files } : {}),
        });
        return {
          action: "post",
          teamId,
          authorRole,
          postedEntry,
          teamSnapshot: board.snapshot(),
        };
      }
      case "read": {
        const filteredEntries = board.listEntries({
          ...(input.kind ? { kind: input.kind } : {}),
          ...(input.authorRole ? { authorRole: input.authorRole } : {}),
          ...(input.targetRole ? { targetRole: input.targetRole } : {}),
        });
        return {
          action: "read",
          teamId,
          authorRole,
          teamSnapshot: {
            teamId,
            entries: filteredEntries,
            tasks: board.listTasks(),
          },
        };
      }
      case "plan_tasks": {
        if (!input.tasks || input.tasks.length === 0) {
          return {
            action: "plan_tasks",
            teamId,
            authorRole,
            error: "`tasks` array is required for `plan_tasks`.",
            teamSnapshot: board.snapshot(),
          };
        }
        board.upsertTasks(
          input.tasks.map((t) => ({
            ...t,
            assignedRole: t.assignedRole ?? "executor",
          })),
          authorRole,
        );
        return {
          action: "plan_tasks",
          teamId,
          authorRole,
          teamSnapshot: board.snapshot(),
        };
      }
      case "update_task": {
        if (!input.taskId || !input.status) {
          return {
            action: "update_task",
            teamId,
            authorRole,
            error: "Both `taskId` and `status` are required for `update_task`.",
            teamSnapshot: board.snapshot(),
          };
        }
        const updatedTask = board.updateTaskStatus(
          input.taskId,
          input.status,
          authorRole,
          input.notes,
        );
        return {
          action: "update_task",
          teamId,
          authorRole,
          updatedTask,
          teamSnapshot: board.snapshot(),
        };
      }
    }
  },
  toModelOutput: ({ output }) => {
    const { entries, tasks } = output.teamSnapshot;
    const summaryParts: string[] = [];

    if (output.action === "post" && output.postedEntry) {
      summaryParts.push(
        `Posted ${output.postedEntry.kind} "${output.postedEntry.title}" to team board (${entries.length} total entries).`,
      );
    } else if (output.action === "plan_tasks") {
      summaryParts.push(
        `Updated team task board (${tasks.length} tasks tracked).`,
      );
    } else if (output.action === "update_task") {
      summaryParts.push(
        output.updatedTask
          ? `Task \`${output.updatedTask.id}\` marked \`${output.updatedTask.status}\`.`
          : "Task ID not found on team board.",
      );
    } else {
      summaryParts.push(
        `Team board has ${entries.length} entries and ${tasks.length} tasks.`,
      );
      for (const task of tasks) {
        summaryParts.push(
          `- Task [${task.status}] \`${task.id}\` (${task.assignedRole}): ${task.title}${task.notes ? ` — ${task.notes}` : ""}`,
        );
      }
      for (const entry of entries.slice(-15)) {
        const target = entry.targetRole ? ` -> ${entry.targetRole}` : "";
        const files = entry.files?.length
          ? ` [files: ${entry.files.join(", ")}]`
          : "";
        summaryParts.push(
          `- (${entry.kind}) **${entry.authorRole}${target}**: **${entry.title}**${files}\n  ${entry.content}`,
        );
      }
    }

    return { type: "text", value: summaryParts.join("\n") };
  },
});

export type TeamBoardToolUIPart = UIToolInvocation<typeof teamBoardTool>;
