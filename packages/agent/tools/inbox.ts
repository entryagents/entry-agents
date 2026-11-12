import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../types";

const inboxInputSchema = z.object({
  action: z
    .enum(["check", "list"])
    .optional()
    .default("check")
    .describe(
      "Use 'check' (default) to read all steering inbox messages and mark newly arrived UNREAD messages as read. Use 'list' to inspect without marking as read.",
    ),
});

export type InboxToolInput = z.infer<typeof inboxInputSchema>;

export const inboxTool = tool({
  description:
    "Check the user's real-time steering inbox for this chat. Returns all inbox messages in chronological order, clearly distinguishing [NEW / UNREAD] instructions from [OLD / READ] ones, and marks unread messages as read so no user instruction is missed or re-processed.",
  inputSchema: inboxInputSchema,
  execute: async ({ action }, { experimental_context }) => {
    const context = experimental_context as AgentContext | undefined;
    const inboxHooks = context?.inboxHooks;
    if (!inboxHooks) {
      return {
        success: false,
        error: "Steering inbox is not configured in this host environment.",
        unreadCount: 0,
        totalCount: 0,
        newlyReadCount: 0,
        messages: [],
      };
    }

    const result = await inboxHooks.checkInbox({
      markAsRead: action !== "list",
    });

    return {
      success: true,
      action,
      unreadCount: result.unreadCount,
      totalCount: result.totalCount,
      newlyReadCount: result.newlyReadCount,
      messages: result.messages.map((msg) => ({
        sequence: msg.sequence,
        id: msg.id,
        label: msg.isNew ? "[NEW / UNREAD]" : "[OLD / READ]",
        isNew: msg.isNew,
        content: msg.content,
        createdAt: msg.createdAt,
        readAt: msg.readAt,
      })),
    };
  },
});
