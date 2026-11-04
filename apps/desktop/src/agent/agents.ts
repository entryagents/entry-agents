/**
 * Entry Agents Registry (`build`, `plan`, `explore`, `general`, `title`, `summary`)
 * Powered by `entryagents.agent` and `entryagents.plan`.
 *
 * Embodies Entry Agents' 5 Core Promises:
 * 1. Spend less: Get more useful work from every dollar.
 * 2. Move faster: Fast native app, fast execution, efficient agents.
 * 3. Trust the results: Agents must prove their work.
 * 4. Stay in control: Users own their models, projects, execution and data.
 * 5. Extend everything: Plugins make Entry Agents capable of growing beyond its original developers.
 */
import { join } from "node:path";
import {
  buildPlanEnterReminder,
  PLAN_LEAVE_REMINDER,
  PROMPT_EXPLORE,
  PROMPT_SUMMARY,
  PROMPT_SYSTEM_HARNESS,
  PROMPT_TITLE,
  renderSessionSystemPrompt,
} from "@entry-agents/agent";
import {
  BUILD_PERMISSION_RULESET,
  PLAN_PERMISSION_RULESET,
  type PermissionRuleset,
} from "../permission/permission";

export interface AgentInfo {
  name: "build" | "plan" | "explore" | "general" | "title" | "summary";
  displayName: string;
  description: string;
  mode: "primary" | "subagent" | "hidden";
  native: boolean;
  permission: PermissionRuleset;
  systemInstructions: string;
}

export const PROMPT_BUILD = `${renderSessionSystemPrompt(PROMPT_SYSTEM_HARNESS)}

# Entry Agents Build Mode
Core Product Principle: Get the most verified work done with the least time, money, and human intervention.
- Spend less: Avoid redundant file reads or noisy output.
- Move faster: Execute changes directly and cleanly.
- Trust the results: Always verify your changes (run typecheck, tests, or build checks) and report concrete verification proof.
- Stay in control: Respect project boundaries and permission rules.`;

export function buildPlanModeReminder(
  projectDir: string,
  sessionSlug: string,
): string {
  const planDir = join(projectDir, ".entry", "plan").replace(/\\/g, "/");
  const planPath = join(planDir, `${sessionSlug}.md`).replace(/\\/g, "/");
  return `${buildPlanEnterReminder(planDir)}\n\nPrimary session plan file: ${planPath}`;
}

export { PLAN_LEAVE_REMINDER, PROMPT_EXPLORE, PROMPT_SUMMARY, PROMPT_TITLE };

export const AGENTS: Record<AgentInfo["name"], AgentInfo> = {
  build: {
    name: "build",
    displayName: "Build",
    description:
      "Default Entry Agents execution mode with full tools and automated verification.",
    mode: "primary",
    native: true,
    permission: BUILD_PERMISSION_RULESET,
    systemInstructions: PROMPT_BUILD,
  },
  plan: {
    name: "plan",
    displayName: "Plan",
    description:
      "Read-only architectural exploration mode. Disallows file edits except .entry/plan/*.md.",
    mode: "primary",
    native: true,
    permission: PLAN_PERMISSION_RULESET,
    systemInstructions:
      "You are Entry Agents in PLAN mode. Explore the codebase read-only and produce a clear, verifiable engineering blueprint.",
  },
  general: {
    name: "general",
    displayName: "General",
    description:
      "General-purpose subagent for researching complex questions and executing multi-step tasks.",
    mode: "subagent",
    native: true,
    permission: BUILD_PERMISSION_RULESET,
    systemInstructions: PROMPT_BUILD,
  },
  explore: {
    name: "explore",
    displayName: "Explore",
    description:
      "Fast read-only subagent specialized for exploring codebases with glob, grep, and read.",
    mode: "subagent",
    native: true,
    permission: PLAN_PERMISSION_RULESET,
    systemInstructions: PROMPT_EXPLORE,
  },
  title: {
    name: "title",
    displayName: "Title",
    description: "Hidden conversation title generator.",
    mode: "hidden",
    native: true,
    permission: PLAN_PERMISSION_RULESET,
    systemInstructions: PROMPT_TITLE,
  },
  summary: {
    name: "summary",
    displayName: "Summary",
    description: "Hidden pull-request style session summary generator.",
    mode: "hidden",
    native: true,
    permission: PLAN_PERMISSION_RULESET,
    systemInstructions: PROMPT_SUMMARY,
  },
};

export function listVisibleAgents(): AgentInfo[] {
  return Object.values(AGENTS).filter((a) => a.mode !== "hidden");
}
