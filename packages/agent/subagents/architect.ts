import type { LanguageModel } from "ai";
import { stepCountIs, ToolLoopAgent } from "ai";
import { z } from "zod";
import { addCacheControl, maybeCompactMessages } from "../context-management";
import { defaultModelLabel } from "../default-model";
import { createInertPlaceholderModel, sharedProvider } from "../models";
import { bashTool } from "../tools/bash";
import { dirListTool } from "../tools/dir-list";
import { globTool } from "../tools/glob";
import { grepTool } from "../tools/grep";
import { readFileTool } from "../tools/read";
import { teamBoardTool } from "../tools/team";
import type { SandboxExecutionContext } from "../types";
import {
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_RESPONSE_FORMAT,
  SUBAGENT_STEP_LIMIT,
  SUBAGENT_WORKING_DIR,
} from "./constants";

const ARCHITECT_REMINDER = `## REMINDER
- You CANNOT ask questions - no one will respond
- This is READ-ONLY architecture & planning - do NOT create, modify, or delete any repository files
- Post concrete decisions, interface contracts, and parallel/sequential subtasks to \`team_board\` (\`plan_tasks\` and \`post\`) so \`executor\`, \`design\`, and \`reviewer\` teammates can execute cleanly
- Your final message MUST contain both **Summary** and **Answer** with exact file paths, interface contracts, and execution order`;

const ARCHITECT_SYSTEM_PROMPT = `You are an architect agent — a principal systems engineer subagent specialized in dependency mapping, interface design, and decomposing multi-file engineering tasks into coordinated teammate work.

## CRITICAL RULES

### READ-ONLY OPERATIONS ONLY
This is a READ-ONLY planning and architecture task. You are STRICTLY PROHIBITED from:
- Creating, modifying, or deleting files
- Running state-changing shell commands (no installs, builds that mutate git state, commits, etc.)

${SUBAGENT_NO_QUESTIONS_RULES}

${SUBAGENT_RESPONSE_FORMAT}

## TEAM COLLABORATION
- Always call \`team_board\` (\`action: "read"\`) first to check existing teammate findings.
- Post architecture decisions and interface contracts with \`team_board\` (\`action: "post"\`, \`kind: "decision"\` or \`kind: "handoff"\`, specifying \`files\` and \`targetRole\`).
- Decompose non-trivial changes via \`team_board\` (\`action: "plan_tasks"\`) assigning work cleanly across \`explorer\`, \`executor\`, \`design\`, and \`reviewer\`.

## TOOLS & GUIDELINES
You have access to: \`read\`, \`dir_list\`, \`grep\`, \`glob\`, \`bash\` (read-only commands only), \`team_board\`.
- Trace exact call sites, schemas, and imports before proposing contracts.
- Return workspace-relative paths with line references.`;

const callOptionsSchema = z.object({
  task: z.string().describe("Short description of the architecture task"),
  instructions: z
    .string()
    .describe("Detailed architecture and planning instructions"),
  sandbox: z
    .custom<SandboxExecutionContext["sandbox"]>()
    .describe("Sandbox for file system and shell operations"),
  model: z.custom<LanguageModel>().describe("Language model for this subagent"),
  teamId: z.string().optional(),
  teamContext: z.string().optional(),
  maxOutputTokens: z.number().int().positive().optional(),
  contextWindow: z.number().int().positive().optional(),
  compactionThreshold: z.number().positive().optional(),
});

export type ArchitectCallOptions = z.infer<typeof callOptionsSchema>;

const architectTools = {
  read: readFileTool(),
  dir_list: dirListTool(),
  grep: grepTool(),
  glob: globTool(),
  bash: bashTool(),
  team_board: teamBoardTool,
};

export const architectSubagent = new ToolLoopAgent({
  model: createInertPlaceholderModel(defaultModelLabel),
  instructions: ARCHITECT_SYSTEM_PROMPT,
  tools: architectTools,
  stopWhen: stepCountIs(SUBAGENT_STEP_LIMIT),
  callOptionsSchema,
  prepareStep: ({ messages, model, experimental_context }) => {
    const context = (experimental_context ?? {}) as {
      contextWindow?: number;
      compactionThreshold?: number;
    };
    return {
      messages: addCacheControl({
        messages: maybeCompactMessages({
          messages,
          model,
          contextWindowOverride: context.contextWindow,
          compactionThresholdOverride: context.compactionThreshold,
        }),
        model,
      }),
      experimental_context: context,
    };
  },
  prepareCall: ({ options, ...settings }) => {
    if (!options) {
      throw new Error("Architect subagent requires task call options.");
    }

    const sandbox = options.sandbox;
    const model = options.model ?? sharedProvider(defaultModelLabel);
    const teamBlock = options.teamContext ? `${options.teamContext}\n\n` : "";
    return {
      ...settings,
      model,
      tools: addCacheControl({
        tools: settings.tools ?? architectTools,
        model,
      }),
      ...(options.maxOutputTokens
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
      instructions: addCacheControl({
        instructions: [
          `${ARCHITECT_SYSTEM_PROMPT}\n\n${SUBAGENT_WORKING_DIR}`,
          `${teamBlock}## Your Task\n${options.task}\n\n## Detailed Instructions\n${options.instructions}\n\n${ARCHITECT_REMINDER}`,
        ],
        model,
      }),
      experimental_context: {
        sandbox,
        model,
        teamId: options.teamId ?? "default-team",
        agentRole: "architect",
        contextWindow: options.contextWindow,
        compactionThreshold: options.compactionThreshold,
      },
    };
  },
});
