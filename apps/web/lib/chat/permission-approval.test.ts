import { describe, expect, test } from "bun:test";
import type { WebAgentUIMessage } from "@/app/types";
import { collectAutoApprovableIds } from "./permission-approval";

const sampleMessages = [
  {
    id: "m-1",
    role: "assistant",
    parts: [
      {
        type: "tool-web_fetch",
        toolCallId: "tc-fetch",
        state: "approval-requested",
        input: { url: "https://example.com" },
        approval: { id: "appr-fetch" },
      },
      {
        type: "tool-bash",
        toolCallId: "tc-bash",
        state: "approval-requested",
        input: { command: "rm -rf /tmp/foo" },
        approval: { id: "appr-bash" },
      },
      {
        type: "dynamic-tool",
        toolName: "mcp__github__list_issues",
        toolCallId: "tc-mcp",
        state: "approval-requested",
        input: {},
        approval: { id: "appr-mcp" },
      },
      {
        type: "tool-web_fetch",
        toolCallId: "tc-done",
        state: "output-available",
        input: { url: "https://done.example.com" },
        output: { success: true },
      },
    ],
  },
] as unknown as WebAgentUIMessage[];

describe("collectAutoApprovableIds", () => {
  test("returns nothing in ask mode", () => {
    expect(collectAutoApprovableIds(sampleMessages, "ask")).toEqual([]);
  });

  test("auto-approves pending web_fetch and MCP requests in autoAccept mode", () => {
    expect(collectAutoApprovableIds(sampleMessages, "autoAccept")).toEqual([
      "appr-fetch",
      "appr-mcp",
    ]);
  });

  test("auto-approves all pending requests in fullAccess mode", () => {
    expect(collectAutoApprovableIds(sampleMessages, "fullAccess")).toEqual([
      "appr-fetch",
      "appr-bash",
      "appr-mcp",
    ]);
  });
});
