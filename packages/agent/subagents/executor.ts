import type { LanguageModel } from "ai";
import { addCacheControl } from "../context-management";
import { stepCountIs, ToolLoopAgent } from "ai";
import { createInertPlaceholderModel, sharedProvider } from "../models";
import { defaultModelLabel } from "../default-model";
import { z } from "zod";
import { bashTool } from "../tools/bash";
import { dirListTool } from "../tools/dir-list";
import { globTool } from "../tools/glob";
import { grepTool } from "../tools/grep";
import { readFileTool } from "../tools/read";
import { createReadFileState } from "../tools/read-state";
import { editFileTool, writeFileTool } from "../tools/write";
import { teamBoardTool } from "../tools/team";
import type { SandboxExecutionContext } from "../types";
import {
  SUBAGENT_BASH_RULES,
  SUBAGENT_COMPLETE_TASK_RULES,
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_REMINDER,
  SUBAGENT_RESPONSE_FORMAT,
  SUBAGENT_STEP_LIMIT,
  SUBAGENT_VALIDATE_RULES,
  SUBAGENT_WORKING_DIR,
} from "./constants";
import { prepareSubagentStep } from "./prepare-step";

const EXECUTOR_SYSTEM_PROMPT = `You are an executor agent - a fire-and-forget subagent that completes specific, well-defined implementation tasks autonomously.

Think of yourself as a productive engineer who cannot ask follow-up questions once started.

## CRITICAL RULES

${SUBAGENT_NO_QUESTIONS_RULES}

${SUBAGENT_COMPLETE_TASK_RULES}

${SUBAGENT_RESPONSE_FORMAT}

Example final response:
---
**Summary**: I created the new user authentication module with JWT validation. I added the auth middleware, updated the routes, and created unit tests.

**Answer**: The authentication system is now implemented:
- \`src/middleware/auth.ts\` - JWT validation middleware
- \`src/routes/auth.ts\` - Login/logout endpoints
- \`src/tests/auth.test.ts\` - Unit tests (all passing)
---

${SUBAGENT_VALIDATE_RULES}

## TEAM COLLABORATION
- If the Shared Team Board Snapshot shows active tasks, contracts, or challenges, call \`team_board\` (\`action: "read"\`) first, claim your assigned task with \`update_task\` (\`in_progress\`, exact \`files\`, and your current git branch as \`worktreeBranch\` when running in an isolated worktree), respect locked contracts and file-ownership warnings, post \`@role\` debates or handoffs (\`kind: "handoff"\` or \`kind: "debate"\`) if assumptions conflict, and when finished mark your task \`completed\` with concrete \`verification\` command evidence targeting \`@reviewer\`.

## TOOLS
You have full access to file operations (read, write, edit, grep, glob), bash commands, and \`team_board\`. Use them to complete your task.

${SUBAGENT_BASH_RULES}`;

const callOptionsSchema = z.object({
  task: z.string().describe("Short description of the task"),
  instructions: z.string().describe("Detailed instructions for the task"),
  sandbox: z
    .custom<SandboxExecutionContext["sandbox"]>()
    .describe("Sandbox for file system and shell operations"),
  model: z.custom<LanguageModel>().describe("Language model for this subagent"),
  teamId: z.string().optional(),
  teamContext: z.string().optional(),
  // Per-step output clamp threaded from the host's billing guard
  // (packages/agent SubagentBudgetGuard, 2026-09-15): ToolLoopAgent
  // applies call settings to every internal step, so one value caps
  // each step's output. Undefined = no cap.
  maxOutputTokens: z.number().int().positive().optional(),
  contextWindow: z.number().int().positive().optional(),
  compactionThreshold: z.number().positive().optional(),
});

export type ExecutorCallOptions = z.infer<typeof callOptionsSchema>;

const executorTools = {
  read: readFileTool(),
  write: writeFileTool(),
  edit: editFileTool(),
  dir_list: dirListTool(),
  grep: grepTool(),
  glob: globTool(),
  bash: bashTool(),
  team_board: teamBoardTool,
};

export const executorSubagent = new ToolLoopAgent({
  // Inert placeholder -- see createInertPlaceholderModel for why this
  // can't be a real sharedProvider() call at module scope. prepareCall
  // below lazily constructs the real default model if the caller
  // doesn't pass one explicitly.
  model: createInertPlaceholderModel(defaultModelLabel),
  instructions: EXECUTOR_SYSTEM_PROMPT,
  tools: executorTools,
  stopWhen: stepCountIs(SUBAGENT_STEP_LIMIT),
  callOptionsSchema,
  prepareStep: ({ steps, stepNumber, messages, model, experimental_context }) =>
    prepareSubagentStep({
      steps,
      stepNumber,
      messages,
      model,
      experimental_context,
      trackReadFileState: true,
    }),
  prepareCall: ({ options, ...settings }) => {
    if (!options) {
      throw new Error("Executor subagent requires task call options.");
    }

    const sandbox = options.sandbox;
    const model = options.model ?? sharedProvider(defaultModelLabel);
    const teamBlock = options.teamContext ? `${options.teamContext}\n\n` : "";
    return {
      ...settings,
      model,
      tools: addCacheControl({
        tools: settings.tools ?? executorTools,
        model,
      }),
      ...(options.maxOutputTokens
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
      instructions: addCacheControl({
        instructions: [
          `${EXECUTOR_SYSTEM_PROMPT}\n\n${SUBAGENT_WORKING_DIR}`,
          `${teamBlock}## Your Task\n${options.task}\n\n## Detailed Instructions\n${options.instructions}\n\n${SUBAGENT_REMINDER}`,
        ],
        model,
      }),
      experimental_context: {
        sandbox,
        model,
        teamId: options.teamId ?? "default-team",
        agentRole: "executor",
        contextWindow: options.contextWindow,
        compactionThreshold: options.compactionThreshold,
        // Read-before-edit gate state (tools/read-state.ts): a fresh
        // store per subagent run — the subagent must read a file
        // before editing it, same rule as the main agent. Parent
        // reads do NOT carry over: the subagent's own view of the
        // file is what its edits are checked against.
        readFileState: createReadFileState(),
      },
    };
  },
});
