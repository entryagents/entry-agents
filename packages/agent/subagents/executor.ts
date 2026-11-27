import { addCacheControl } from "../context-management";
import { stepCountIs, ToolLoopAgent } from "ai";
import { createInertPlaceholderModel, sharedProvider } from "../models";
import { defaultModelLabel } from "../default-model";
import { z } from "zod";
import { bashTool } from "../tools/bash";
import { globTool } from "../tools/glob";
import { grepTool } from "../tools/grep";
import { readFileTool } from "../tools/read";
import { createReadFileState } from "../tools/read-state";
import {
  sightlineCallersTool,
  sightlineFileTool,
  sightlineFindTool,
  sightlineListTool,
  sightlineMapTool,
} from "../tools/sightline";
import { editFileTool, writeFileTool } from "../tools/write";
import { sendParentUpdateTool } from "../tools/subagent-control";
import { teamBoardTool } from "../tools/team";
import { webFetchTool } from "../tools/fetch";
import {
  buildSubagentExperimentalContext,
  sharedSubagentCallOptionsFields,
} from "./call-options";
import {
  EXECUTOR_STEP_LIMIT,
  SUBAGENT_BASH_RULES,
  SUBAGENT_COMPLETE_TASK_RULES,
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_REMINDER,
  SUBAGENT_RESPONSE_FORMAT,
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
  ...sharedSubagentCallOptionsFields,
});

export type ExecutorCallOptions = z.infer<typeof callOptionsSchema>;

const executorTools = {
  read: readFileTool(),
  write: writeFileTool(),
  edit: editFileTool(),
  sightline_map: sightlineMapTool(),
  sightline_list: sightlineListTool(),
  sightline_file: sightlineFileTool(),
  sightline_find: sightlineFindTool(),
  sightline_callers: sightlineCallersTool(),
  grep: grepTool(),
  glob: globTool(),
  bash: bashTool(),
  web_fetch: webFetchTool,
  team_board: teamBoardTool,
  send_parent_update: sendParentUpdateTool,
};

export const executorSubagent = new ToolLoopAgent({
  // Inert placeholder -- see createInertPlaceholderModel for why this
  // can't be a real sharedProvider() call at module scope. prepareCall
  // below lazily constructs the real default model if the caller
  // doesn't pass one explicitly.
  model: createInertPlaceholderModel(defaultModelLabel),
  instructions: EXECUTOR_SYSTEM_PROMPT,
  tools: executorTools,
  stopWhen: stepCountIs(EXECUTOR_STEP_LIMIT),
  callOptionsSchema,
  prepareStep: ({ steps, stepNumber, messages, model, experimental_context }) =>
    prepareSubagentStep({
      steps,
      stepNumber,
      messages,
      model,
      experimental_context,
      trackReadFileState: true,
      stepLimit: EXECUTOR_STEP_LIMIT,
    }),
  prepareCall: ({ options, ...settings }) => {
    if (!options) {
      throw new Error("Executor subagent requires task call options.");
    }

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
      experimental_context: buildSubagentExperimentalContext(
        options,
        model,
        "executor",
        createReadFileState(),
      ),
    };
  },
});
