/**
 * Entry Agents — Everything-is-a-Plugin & Hook Architecture
 *
 * Implements the complete suite of built-in plugins for both Web (`entry-agents.dev`)
 * and Local Native Runtime (`apps/desktop`):
 * - `entryagents.agent`: Build, Plan, General, Explore, Compaction, Title, Summary agents
 * - `entryagents.plan`: Plan mode read-only enforcement + `<system-reminder>` reconciliation
 * - `entryagents.goal`: Autonomous multi-turn `/goal` loop with reviewer judge verdict (`done` | `continue` | `blocked` | `paused` | `wait`)
 * - `entryagents.command`: Built-in `/init`, `/review`, `/schedule`, and dynamic MCP prompt slash commands
 * - `entryagents.skill`: Built-in `entry-agents` and `report` diagnostic skills
 * - `entryagents.prompt.identity`: Injects `# Your Model` (`Name`, `Provider ID`, `Model ID`) into system prompt
 * - `entryagents.prompt.verbosity`: Sets `textVerbosity = "low"` on supported GPT-5/GPT-6 models
 * - `entryagents.prompt.optimize`: Applies model-specific system prompts (`PROMPT_GPT_ASTRA`, `PROMPT_GPT`, `PROMPT_ANTHROPIC`, `PROMPT_KIMI`, `PROMPT_TRINITY`, `PROMPT_META`)
 * - `entryagents.tool.input.repair`: Automatically repairs stringified JSON objects/arrays, numeric/boolean strings, and tool name aliases (`shell` <-> `bash`)
 * - `entryagents.mcp`: Unifies remote HTTP/SSE MCP servers, local stdio MCP servers, and `<mcp_instructions>`
 * - `entryagents.warming`: Keeps active session prompt caches warm
 */

import {
  buildModelIdentityBlock,
  buildPlanEnterReminder,
  PLAN_LEAVE_REMINDER,
  PROMPT_ANTHROPIC,
  PROMPT_COMMAND_INITIALIZE,
  PROMPT_COMMAND_REVIEW,
  PROMPT_EXPLORE,
  PROMPT_GOAL_CONTINUATION,
  PROMPT_GOAL_JUDGE,
  PROMPT_GOAL_KICKOFF,
  PROMPT_GOAL_REMINDER,
  PROMPT_GPT,
  PROMPT_GPT_ASTRA,
  PROMPT_KIMI,
  PROMPT_META,
  PROMPT_SUMMARY,
  PROMPT_SYSTEM_HARNESS,
  PROMPT_TITLE,
  PROMPT_TRINITY,
  renderSessionSystemPrompt,
} from "../prompts/entry-prompts";

export type HookDomain = "aisdk" | "session" | "permission" | "shell" | "tool";

export interface EntryPluginDescriptor {
  id: string;
  name: string;
  version: string;
  description: string;
  domain: HookDomain[];
  enabled: boolean;
}

export const BUILTIN_ENTRY_PLUGINS: EntryPluginDescriptor[] = [
  {
    id: "entryagents.agent",
    name: "Entry Agents Core Roles",
    version: "1.0.0",
    description:
      "Registers Build, Plan, General, Explore, Compaction, Title, and Summary agents with role-specific permissions.",
    domain: ["session", "permission"],
    enabled: true,
  },
  {
    id: "entryagents.plan",
    name: "Entry Agents Plan Mode",
    version: "1.0.0",
    description:
      "Read-only exploration agent mode that restricts edits to .entry/plan/* and reconciles <system-reminder> transitions.",
    domain: ["session", "permission", "tool"],
    enabled: true,
  },
  {
    id: "entryagents.goal",
    name: "Entry Agents Autonomous Goal Loop",
    version: "1.0.0",
    description:
      "Multi-turn /goal supervisor with an automated reviewer judge (done | continue | blocked | paused | wait).",
    domain: ["session"],
    enabled: true,
  },
  {
    id: "entryagents.command",
    name: "Entry Agents Slash Commands",
    version: "1.0.0",
    description:
      "Provides /init (guided AGENTS.md setup), /review (diff/commit/branch/PR review), /schedule, and MCP server prompt commands.",
    domain: ["session"],
    enabled: true,
  },
  {
    id: "entryagents.skill",
    name: "Entry Agents Built-in Skills",
    version: "1.0.0",
    description:
      "Registers built-in Entry Agents self-documentation and runtime diagnostics report skills.",
    domain: ["session", "tool"],
    enabled: true,
  },
  {
    id: "entryagents.prompt.optimize",
    name: "Entry Agents Model Prompt Optimizer",
    version: "1.0.0",
    description:
      "Selects the optimal harness system prompt per model family (GPT-Astra, GPT, Claude/Anthropic, Kimi, Trinity, Meta).",
    domain: ["session", "aisdk"],
    enabled: true,
  },
  {
    id: "entryagents.prompt.identity",
    name: "Entry Agents Model Identity",
    version: "1.0.0",
    description:
      "Injects authoritative # Your Model metadata (Name, Provider ID, Model ID) into the session system prompt.",
    domain: ["session"],
    enabled: true,
  },
  {
    id: "entryagents.prompt.verbosity",
    name: "Entry Agents Low-Verbosity Tuning",
    version: "1.0.0",
    description:
      "Automatically sets textVerbosity = 'low' on supported OpenAI GPT-5.1–5.6 and GPT-6 models to reduce token waste.",
    domain: ["aisdk", "session"],
    enabled: true,
  },
  {
    id: "entryagents.tool.input.repair",
    name: "Entry Agents Tool Input Repair",
    version: "1.0.0",
    description:
      "Repairs stringified JSON tool arguments, coerces numeric/boolean strings, and resolves tool aliases before execution.",
    domain: ["tool"],
    enabled: true,
  },
  {
    id: "entryagents.mcp",
    name: "Entry Agents MCP Supervisor",
    version: "1.0.0",
    description:
      "Connects HTTP, SSE, and local stdio MCP servers, injects <mcp_instructions>, and namespaces tools with x-mcp-mode: tools.",
    domain: ["session", "tool", "permission"],
    enabled: true,
  },
  {
    id: "entryagents.warming",
    name: "Entry Agents Prompt Cache Warming",
    version: "1.0.0",
    description:
      "Maintains warm prompt caches during active coding sessions so follow-up turns execute with minimal latency and cost.",
    domain: ["session"],
    enabled: true,
  },
];

// ---------------------------------------------------------------------------
// 1. `entryagents.prompt.optimize` & `entryagents.prompt.identity`
// ---------------------------------------------------------------------------

export function optimizeSystemPromptForModel(options: {
  modelId?: string;
  modelName?: string;
  tools?: string[];
}): string {
  const rawId = (options.modelId ?? "").toLowerCase();
  const providerID = rawId.includes("/")
    ? (rawId.split("/")[0] ?? "entry")
    : "entry";
  const name = options.modelName ?? options.modelId ?? "Entry Agent Model";
  const tools = options.tools ?? [
    "bash",
    "read",
    "write",
    "edit",
    "glob",
    "grep",
  ];

  let basePrompt: string;
  if (rawId.includes("gpt")) {
    basePrompt = renderSessionSystemPrompt(
      rawId.includes("astra") ||
        rawId.includes("5.4") ||
        rawId.includes("codex")
        ? PROMPT_GPT_ASTRA
        : PROMPT_GPT,
      tools,
    );
  } else if (rawId.includes("claude")) {
    basePrompt = `${renderSessionSystemPrompt(PROMPT_SYSTEM_HARNESS, tools)}\n\n${PROMPT_ANTHROPIC}`;
  } else if (rawId.includes("kimi")) {
    basePrompt = PROMPT_KIMI;
  } else if (rawId.includes("trinity")) {
    basePrompt = PROMPT_TRINITY;
  } else if (rawId.includes("muse") || rawId.includes("llama")) {
    basePrompt = PROMPT_META.replaceAll("{{MODEL_NAME}}", name);
  } else {
    basePrompt = renderSessionSystemPrompt(PROMPT_SYSTEM_HARNESS, tools);
  }

  const identity = buildModelIdentityBlock({
    name,
    providerID,
    id: options.modelId ?? "default",
  });

  return `${basePrompt}\n\n${identity}`;
}

// ---------------------------------------------------------------------------
// 2. `entryagents.prompt.verbosity`
// ---------------------------------------------------------------------------

export function supportsLowVerbosity(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (id.includes("gpt-6")) return true;
  if (id.includes("-chat") || id.includes("-image")) return false;
  return (
    /(?:^|[/.])gpt-5\.[1-6](?:[.:-]|$)/.test(id) ||
    /(?:^|[/.])gpt-5(?:-(?:mini|nano)(?:[.:-]|$)|$)/.test(id)
  );
}

// ---------------------------------------------------------------------------
// 3. `entryagents.tool.input.repair`
// ---------------------------------------------------------------------------

const TOOL_ALIASES = new Map<string, string>([
  ["shell", "bash"],
  ["exec", "bash"],
]);

export function resolveToolAlias(toolName: string): {
  resolvedName: string;
  aliasedFrom?: string;
} {
  const mapped = TOOL_ALIASES.get(toolName);
  if (mapped) {
    return { resolvedName: mapped, aliasedFrom: toolName };
  }
  return { resolvedName: toolName };
}

export function repairToolInput(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return repairToolInput(JSON.parse(trimmed), depth + 1);
      } catch {
        return value;
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => repairToolInput(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === "true") out[k] = true;
      else if (v === "false") out[k] = false;
      else if (
        typeof v === "string" &&
        /^-?\d+$/.test(v.trim()) &&
        (k === "limit" ||
          k === "offset" ||
          k === "timeout" ||
          k === "line" ||
          k === "startLine" ||
          k === "endLine")
      ) {
        out[k] = Number(v.trim());
      } else {
        out[k] = repairToolInput(v, depth + 1);
      }
    }
    return out;
  }

  return value;
}

// ---------------------------------------------------------------------------
// 4. `entryagents.mcp` — `<mcp_instructions>` and `x-mcp-mode: tools`
// ---------------------------------------------------------------------------

export interface McpInstructionServerSummary {
  server: string;
  instructions: string;
  codemode?: boolean;
}

export function renderMcpInstructionsXml(
  servers: ReadonlyArray<McpInstructionServerSummary>,
): string {
  if (servers.length === 0) return "";
  const lines: string[] = ["<mcp_instructions>"];
  for (const srv of servers) {
    lines.push(`  <server name="${srv.server}">`);
    for (const line of srv.instructions.split("\n")) {
      lines.push(`    ${line}`);
    }
    lines.push("  </server>");
  }
  lines.push("</mcp_instructions>");
  return lines.join("\n");
}

export function applyMcpCodeModeDefaults(server: {
  url: string;
  headers?: Record<string, string>;
}): Record<string, string> | undefined {
  try {
    const parsed = new URL(server.url);
    const isPosthog =
      /(?:^|\.)posthog\.com$/i.test(parsed.hostname) &&
      /^\/mcp\/?$/.test(parsed.pathname);
    if (
      isPosthog &&
      !parsed.searchParams.has("mode") &&
      !Object.keys(server.headers ?? {}).some(
        (k) => k.toLowerCase() === "x-mcp-mode",
      )
    ) {
      return { ...server.headers, "x-mcp-mode": "tools" };
    }
  } catch {
    // ignore invalid URL
  }
  return server.headers;
}

// ---------------------------------------------------------------------------
// 5. `entryagents.command` & `entryagents.goal` Helpers
// ---------------------------------------------------------------------------

export function expandSlashCommandPrompt(
  rawText: string,
  projectDir: string,
): {
  command?: "init" | "review" | "goal";
  expandedPrompt: string;
  goalObjective?: string;
} {
  const trimmed = rawText.trim();
  if (trimmed === "/init" || trimmed.startsWith("/init ")) {
    const args = trimmed.slice(5).trim();
    const text = PROMPT_COMMAND_INITIALIZE.replaceAll(
      /\$\{path\}/g,
      projectDir,
    ).replaceAll("$ARGUMENTS", args || "None");
    return { command: "init", expandedPrompt: text };
  }
  if (trimmed === "/review" || trimmed.startsWith("/review ")) {
    const args = trimmed.slice(7).trim();
    const text = PROMPT_COMMAND_REVIEW.replaceAll(
      /\$\{path\}/g,
      projectDir,
    ).replaceAll("$ARGUMENTS", args || "uncommitted changes");
    return { command: "review", expandedPrompt: text };
  }
  if (trimmed.startsWith("/goal ")) {
    const objective = trimmed.slice(6).trim();
    const text = PROMPT_GOAL_KICKOFF.replace(/\$\{objective\}/g, objective);
    return {
      command: "goal",
      expandedPrompt: text,
      goalObjective: objective,
    };
  }
  return { expandedPrompt: rawText };
}

export {
  buildPlanEnterReminder,
  PLAN_LEAVE_REMINDER,
  PROMPT_EXPLORE,
  PROMPT_GOAL_CONTINUATION,
  PROMPT_GOAL_JUDGE,
  PROMPT_GOAL_KICKOFF,
  PROMPT_GOAL_REMINDER,
  PROMPT_SUMMARY,
  PROMPT_TITLE,
};
