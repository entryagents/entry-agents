import { describe, expect, test } from "bun:test";
import { tool } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import {
  applyToolDisclosure,
  createToolBridge,
  estimateToolSetTokens,
} from "./tool-bridge";

function fakeConnectorTools(count: number, calls: unknown[] = []): ToolSet {
  const set: ToolSet = {};
  for (let i = 0; i < count; i++) {
    set[`mcp__composio__GMAIL_ACTION_${i}`] = tool({
      description: `Gmail action ${i}: performs a mail operation such as sending, labeling or searching messages for the connected account.`,
      inputSchema: z.object({
        recipient: z.string().describe("Email address of the recipient"),
        subject: z.string().describe("Subject line"),
        body: z.string().describe("Plain text body"),
        labelIds: z.array(z.string()).optional(),
      }),
      needsApproval: async () => true,
      execute: async (args) => {
        calls.push(args);
        return { ok: true };
      },
    });
  }
  return set;
}

const approvalOptions = {
  toolCallId: "t1",
  messages: [],
  experimental_context: { permissionMode: "ask" },
};

describe("tool disclosure cost gate", () => {
  test("small sets stay eager", () => {
    const small = fakeConnectorTools(3);
    const result = applyToolDisclosure(small);
    expect(result.bridged).toBe(false);
    expect(result.tools).toBe(small);
  });

  test("large sets are bridged and the bridge is much cheaper", () => {
    const large = fakeConnectorTools(60);
    const result = applyToolDisclosure(large);
    expect(result.bridged).toBe(true);
    expect(Object.keys(result.tools).sort()).toEqual([
      "tool_call",
      "tool_describe",
      "tool_search",
    ]);
    const bridgeTokens = estimateToolSetTokens(result.tools);
    // Real measured numbers for the claim in the PR description.
    expect(result.eagerTokens).toBeGreaterThan(bridgeTokens * 10);
  });
});

describe("bridge behaviour", () => {
  test("search finds tools and describe returns schema", async () => {
    const bridge = createToolBridge(fakeConnectorTools(5));
    const found = (await bridge.tool_search?.execute?.(
      { query: "gmail action 3" },
      approvalOptions,
    )) as { matches: { tool: string }[] };
    expect(found.matches[0]?.tool).toBe("mcp__composio__GMAIL_ACTION_3");
    const described = (await bridge.tool_describe?.execute?.(
      { tools: ["mcp__composio__GMAIL_ACTION_3", "nope"] },
      approvalOptions,
    )) as { tools: { error?: string; inputSchema?: unknown }[] };
    expect(described.tools[0]?.inputSchema).toBeTruthy();
    expect(described.tools[1]?.error).toBe("unknown tool");
  });

  test("tool_call executes the hidden tool and keeps its approval gate", async () => {
    const calls: unknown[] = [];
    const bridge = createToolBridge(fakeConnectorTools(2, calls));
    const input = {
      tool: "mcp__composio__GMAIL_ACTION_0",
      arguments: { recipient: "a@b.c", subject: "s", body: "b" },
    };
    const gate = bridge.tool_call?.needsApproval as (
      i: unknown,
      o: unknown,
    ) => Promise<boolean>;
    expect(await gate(input, approvalOptions)).toBe(true);
    await bridge.tool_call?.execute?.(input, approvalOptions);
    expect(calls).toHaveLength(1);
  });

  test("tool_call rejects invalid arguments and unknown tools", async () => {
    const calls: unknown[] = [];
    const bridge = createToolBridge(fakeConnectorTools(1, calls));
    const bad = (await bridge.tool_call?.execute?.(
      { tool: "mcp__composio__GMAIL_ACTION_0", arguments: { recipient: 1 } },
      approvalOptions,
    )) as { error?: string };
    expect(bad.error).toContain("Invalid arguments");
    expect(calls).toHaveLength(0);
    const unknown = (await bridge.tool_call?.execute?.(
      { tool: "ghost", arguments: {} },
      approvalOptions,
    )) as { error?: string };
    expect(unknown.error).toContain("Unknown tool");
  });
});
