import { asSchema, tool } from "ai";
import type { Tool, ToolCallOptions, ToolSet } from "ai";
import { z } from "zod";

// Progressive tool disclosure (Hermes `tool_search` pattern).
//
// Every tool in the AI SDK toolset has its description + JSON schema
// serialized into EVERY model step. MCP/connector servers (Composio in
// particular) can expose dozens to hundreds of tools, so eagerly
// loading them costs thousands of tokens per step even when the model
// never uses them. The bridge swaps N secondary tools for 3 small ones.
//
// It is only applied when it actually saves tokens -- see
// `shouldBridgeTools` -- so a user with one tiny MCP server keeps the
// simpler eager path.

/** Rough chars-per-token ratio for JSON/English; deliberately conservative. */
const CHARS_PER_TOKEN = 4;

/**
 * Tokens the three bridge tools themselves cost per step (measured from
 * their serialized descriptions + schemas, see tests). The bridge only
 * wins when eager tools cost clearly more than this plus the extra
 * search/describe round trips, so the gate requires a wide margin.
 */
export const BRIDGE_MIN_SAVINGS_TOKENS = 2_000;

export const BRIDGE_TOOL_NAMES = [
  "tool_search",
  "tool_describe",
  "tool_call",
] as const;

const SEARCH_RESULT_LIMIT = 10;

function schemaJson(candidate: Tool): unknown {
  try {
    return asSchema(candidate.inputSchema).jsonSchema;
  } catch {
    return {};
  }
}

/** Estimated per-step prompt tokens one tool definition costs. */
export function estimateToolTokens(name: string, candidate: Tool): number {
  const serialized = JSON.stringify({
    name,
    description: candidate.description ?? "",
    parameters: schemaJson(candidate),
  });
  return Math.ceil(serialized.length / CHARS_PER_TOKEN);
}

export function estimateToolSetTokens(tools: ToolSet): number {
  let total = 0;
  for (const [name, candidate] of Object.entries(tools)) {
    total += estimateToolTokens(name, candidate);
  }
  return total;
}

/**
 * True only when bridging is projected to cut per-step tokens:
 * eager schema cost minus the bridge's own cost must exceed the margin.
 */
export function shouldBridgeTools(
  secondaryTools: ToolSet,
  bridgeTokens: number = estimateToolSetTokens(createToolBridge({})),
): boolean {
  const eager = estimateToolSetTokens(secondaryTools);
  return eager - bridgeTokens >= BRIDGE_MIN_SAVINGS_TOKENS;
}

function scoreTool(name: string, description: string, terms: string[]): number {
  const haystackName = name.toLowerCase();
  const haystackDesc = description.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (haystackName.includes(term)) score += 3;
    if (haystackDesc.includes(term)) score += 1;
  }
  return score;
}

function firstLine(text: string | undefined): string {
  const line = (text ?? "").split("\n")[0]?.trim() ?? "";
  return line.length > 160 ? `${line.slice(0, 157)}...` : line;
}

async function resolveNeedsApproval(
  target: Tool,
  args: unknown,
  options: ToolCallOptions,
): Promise<boolean> {
  const gate = target.needsApproval;
  if (typeof gate === "function") {
    return Boolean(
      await (gate as (a: unknown, o: unknown) => unknown)(args, options),
    );
  }
  return Boolean(gate);
}

async function finalValue(result: unknown): Promise<unknown> {
  if (
    result !== null &&
    typeof result === "object" &&
    Symbol.asyncIterator in result
  ) {
    let last: unknown;
    for await (const chunk of result as AsyncIterable<unknown>) last = chunk;
    return last;
  }
  return result;
}

/**
 * Builds the three bridge tools over `hidden`. The hidden tools keep
 * their own approval gates: `tool_call` delegates `needsApproval` to the
 * target tool, so bridging never weakens permission checks.
 */
export function createToolBridge(hidden: ToolSet): ToolSet {
  const names = Object.keys(hidden);

  return {
    tool_search: tool({
      description:
        "Search the catalog of additional connector/MCP tools that are not loaded by default. Returns matching tool names with one-line descriptions. Follow with tool_describe to get a tool's argument schema, then tool_call to run it.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("Keywords describing the capability you need."),
      }),
      execute: async ({ query }) => {
        const terms = query
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter(Boolean);
        const ranked = names
          .map((name) => ({
            name,
            score: scoreTool(name, hidden[name]?.description ?? "", terms),
          }))
          .filter((entry) => entry.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, SEARCH_RESULT_LIMIT);
        return {
          totalAvailable: names.length,
          matches: ranked.map((entry) => ({
            tool: entry.name,
            description: firstLine(hidden[entry.name]?.description),
          })),
        };
      },
    }),
    tool_describe: tool({
      description:
        "Get the full description and JSON argument schema for one or more tools found via tool_search.",
      inputSchema: z.object({
        tools: z.array(z.string()).min(1).max(5),
      }),
      execute: async ({ tools }) => ({
        tools: tools.map((name) => {
          const target = hidden[name];
          if (!target) return { tool: name, error: "unknown tool" };
          return {
            tool: name,
            description: target.description ?? "",
            inputSchema: schemaJson(target),
          };
        }),
      }),
    }),
    tool_call: tool({
      description:
        "Execute a tool discovered via tool_search/tool_describe. Pass the exact tool name and an arguments object matching its schema.",
      inputSchema: z.object({
        tool: z.string(),
        arguments: z.record(z.string(), z.unknown()).default({}),
      }),
      needsApproval: async (input, options) => {
        const target = hidden[input.tool];
        // Unknown tool: nothing runs, so nothing to approve.
        if (!target) return false;
        return resolveNeedsApproval(target, input.arguments, options);
      },
      execute: async (input, options) => {
        const target = hidden[input.tool];
        if (!target?.execute) {
          return { error: `Unknown tool "${input.tool}". Use tool_search.` };
        }
        const schema = asSchema(target.inputSchema);
        if (schema.validate) {
          const checked = await schema.validate(input.arguments);
          if (!checked.success) {
            return {
              error: `Invalid arguments for ${input.tool}: ${checked.error.message}`,
            };
          }
        }
        return finalValue(await target.execute(input.arguments, options));
      },
    }),
  };
}

/**
 * Entry point used by the agent: returns the tools to expose for the
 * secondary (MCP/connector) set -- either the originals (small sets) or
 * the 3 bridge tools (large sets).
 */
export function applyToolDisclosure(secondary: ToolSet): {
  tools: ToolSet;
  bridged: boolean;
  eagerTokens: number;
} {
  const eagerTokens = estimateToolSetTokens(secondary);
  if (Object.keys(secondary).length === 0 || !shouldBridgeTools(secondary)) {
    return { tools: secondary, bridged: false, eagerTokens };
  }
  return { tools: createToolBridge(secondary), bridged: true, eagerTokens };
}
