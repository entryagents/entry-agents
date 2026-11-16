import { tool } from "ai";
import { z } from "zod";
import {
  pushSubagentRealtimeMessage,
  stopAllSubagentsForTeam,
  stopSubagentById,
} from "../subagents/session-store";
import type { AgentContext } from "../types";

const stopSubagentInputSchema = z.object({
  subagentId: z
    .string()
    .optional()
    .describe(
      "The subagent ID or sessionId to stop. Omit only when stopping all active subagents with all=true.",
    ),
  all: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true to stop all active subagents in the current team."),
  reason: z
    .string()
    .optional()
    .describe("Optional reason for stopping the subagent(s)."),
});

export type StopSubagentInput = z.infer<typeof stopSubagentInputSchema>;

export const stopSubagentTool = tool({
  description:
    "Stop a running subagent by its subagentId/sessionId, or stop all active subagents in the team.",
  inputSchema: stopSubagentInputSchema,
  execute: async ({ subagentId, all, reason }, { experimental_context }) => {
    const context = experimental_context as AgentContext | undefined;
    const teamId = context?.teamId ?? "default-team";

    if (all) {
      const stoppedCount = stopAllSubagentsForTeam(teamId);
      return {
        success: true,
        stoppedCount,
        teamId,
        ...(reason ? { reason } : {}),
      };
    }

    if (!subagentId?.trim()) {
      return {
        success: false,
        error: "subagentId is required unless all=true.",
      };
    }

    const stopped = stopSubagentById(subagentId.trim());
    return {
      success: stopped,
      subagentId: subagentId.trim(),
      ...(stopped ? {} : { error: "No active subagent found for that ID." }),
      ...(reason ? { reason } : {}),
    };
  },
});

const sendParentUpdateInputSchema = z.object({
  message: z
    .string()
    .min(1)
    .describe(
      "Real-time progress update or question to send to the parent agent.",
    ),
});

export type SendParentUpdateInput = z.infer<typeof sendParentUpdateInputSchema>;

export const sendParentUpdateTool = tool({
  description:
    "Send a real-time progress update, blocker, or finding from a running subagent back to the parent orchestrator.",
  inputSchema: sendParentUpdateInputSchema,
  execute: async ({ message }, { experimental_context }) => {
    const context = experimental_context as AgentContext | undefined;
    const teamId = context?.teamId ?? "default-team";
    const fromRole = context?.agentRole ?? "subagent";

    const delivered = pushSubagentRealtimeMessage({
      fromSubagentId: fromRole,
      subagentType: fromRole,
      teamId,
      message,
    });

    return {
      success: true,
      id: delivered.id,
      createdAt: delivered.createdAt,
      teamId,
    };
  },
});
