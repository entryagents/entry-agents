import { describe, expect, test } from "bun:test";
import type { ModelMessage } from "ai";
import {
  compactToolData,
  findSupersededReadToolCallKeys,
  indexToolCalls,
} from "./aggressive-compaction-helpers";

const NOTICE = "[Compacted]";

describe("aggressive compaction helpers", () => {
  test("detects superseded read, dir_list, and git_status calls outside recent tail", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "read-old",
            toolName: "read",
            input: { filePath: "src/app.ts", offset: 1, limit: 100 },
          },
          {
            type: "tool-call",
            toolCallId: "dir-old",
            toolName: "dir_list",
            input: { path: "src" },
          },
          {
            type: "tool-call",
            toolCallId: "status-old",
            toolName: "git_status",
            input: {},
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "edit-app",
            toolName: "edit",
            input: { filePath: "src/app.ts", oldString: "a", newString: "b" },
          },
          {
            type: "tool-call",
            toolCallId: "dir-new",
            toolName: "dir_list",
            input: { path: "src" },
          },
          {
            type: "tool-call",
            toolCallId: "status-new",
            toolName: "git_status",
            input: {},
          },
        ],
      },
    ] as unknown as ModelMessage[];

    const toolCallIndex = indexToolCalls(messages);
    const superseded = findSupersededReadToolCallKeys({
      messages,
      toolCallIndex,
      recentToolCallKeys: new Set(["id:status-new"]),
      compactedToolNotice: NOTICE,
    });

    expect(superseded.has("id:read-old")).toBe(true);
    expect(superseded.has("id:dir-old")).toBe(true);
    expect(superseded.has("id:status-old")).toBe(true);
    expect(superseded.has("id:edit-app")).toBe(false);
    expect(superseded.has("id:dir-new")).toBe(false);
    expect(superseded.has("id:status-new")).toBe(false);
  });

  test("preserves contextual target summary when compacting tool-call and tool-result parts", () => {
    const messages = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "read",
            input: { filePath: "apps/web/app/page.tsx" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "read",
            output: { type: "text", value: "very long file contents..." },
          },
        ],
      },
    ] as unknown as ModelMessage[];

    const toolCallIndex = indexToolCalls(messages);
    const compacted = compactToolData({
      messages,
      toolCallIndex,
      pendingCandidates: {
        pendingToolCallKeys: new Set(["id:c1"]),
        pendingAnonymousToolResults: 0,
      },
      compactedToolNotice: NOTICE,
    });

    const assistantPart = (
      compacted[0]!.content as Array<Record<string, unknown>>
    )[0]!;
    const toolPart = (
      compacted[1]!.content as Array<Record<string, unknown>>
    )[0]!;

    expect(assistantPart.input).toEqual({
      compacted: true,
      target: "apps/web/app/page.tsx",
      message: `${NOTICE} [Previously ran: read (apps/web/app/page.tsx)]`,
    });
    expect(toolPart.output).toEqual({
      type: "text",
      value: `${NOTICE} [Previously ran: read (apps/web/app/page.tsx)]`,
    });
  });
});
