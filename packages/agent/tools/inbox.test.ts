import { describe, expect, test } from "bun:test";
import { inboxTool } from "./inbox";

describe("inboxTool", () => {
  test("returns error when inboxHooks is not configured", async () => {
    const res = await inboxTool.execute!(
      { action: "check" },
      { toolCallId: "tc-1", messages: [], experimental_context: {} },
    );
    expect(res).toMatchObject({
      success: false,
      unreadCount: 0,
      totalCount: 0,
      newlyReadCount: 0,
      messages: [],
    });
  });

  test("marks unread messages as [NEW / UNREAD] and old ones as [OLD / READ]", async () => {
    const res = await inboxTool.execute!(
      { action: "check" },
      {
        toolCallId: "tc-2",
        messages: [],
        experimental_context: {
          inboxHooks: {
            checkInbox: async ({
              markAsRead,
            }: { markAsRead?: boolean } = {}) => {
              expect(markAsRead).toBe(true);
              return {
                unreadCount: 1,
                totalCount: 2,
                newlyReadCount: 1,
                messages: [
                  {
                    id: "inb_1",
                    sequence: 1,
                    content: "Use Postgres instead of SQLite",
                    status: "read",
                    isNew: false,
                    createdAt: "2026-11-12T10:00:00.000Z",
                    readAt: "2026-11-12T10:01:00.000Z",
                  },
                  {
                    id: "inb_2",
                    sequence: 2,
                    content: "Also add an index on chatId",
                    status: "unread",
                    isNew: true,
                    createdAt: "2026-11-12T10:05:00.000Z",
                    readAt: null,
                  },
                ],
              };
            },
          },
        },
      },
    );

    expect(res).toMatchObject({
      success: true,
      action: "check",
      unreadCount: 1,
      totalCount: 2,
      newlyReadCount: 1,
      messages: [
        {
          sequence: 1,
          id: "inb_1",
          label: "[OLD / READ]",
          isNew: false,
          content: "Use Postgres instead of SQLite",
        },
        {
          sequence: 2,
          id: "inb_2",
          label: "[NEW / UNREAD]",
          isNew: true,
          content: "Also add an index on chatId",
        },
      ],
    });
  });
});
