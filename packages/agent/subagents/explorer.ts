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
import { teamBoardTool } from "../tools/team";
import {
  buildSubagentExperimentalContext,
  sharedSubagentCallOptionsFields,
} from "./call-options";
import {
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_RESPONSE_FORMAT,
  SUBAGENT_STEP_LIMIT,
  SUBAGENT_WORKING_DIR,
} from "./constants";
import { prepareSubagentStep } from "./prepare-step";

const EXPLORER_REMINDER = `## REMINDER
- You CANNOT ask questions - no one will respond
- This is READ-ONLY - do NOT create, modify, or delete any files
- If working alongside teammates, post key discoveries to \`team_board\` (\`kind: "finding"\`) so sibling agents avoid duplicate searches
- Your final message MUST be a comprehensive text response including both **Summary** of what you explored AND the **Answer** to the task with findings and exact file:line references
- CRITICAL: Never terminate your execution on a tool call without a text message. Always synthesize and emit your final exploration findings in text before finishing or exhausting your step budget.`;

const EXPLORER_SYSTEM_PROMPT = `You are an explorer agent - a fast, read-only subagent specialized for exploring codebases.

## CRITICAL RULES

### READ-ONLY OPERATIONS ONLY
This is a READ-ONLY exploration task. You are STRICTLY PROHIBITED from:
- Creating new files (no file creation of any kind)
- Modifying existing files (no edits)
- Deleting files
- Running commands that change system state

Your role is EXCLUSIVELY to search and analyze existing code.

${SUBAGENT_NO_QUESTIONS_RULES}

${SUBAGENT_RESPONSE_FORMAT}

Example final response:
---
**Summary**: I searched for authentication middleware in src/middleware and found the auth handler. I analyzed the JWT validation logic and traced the error handling flow.

**Answer**: The authentication is handled in \`src/middleware/auth.ts:45\`. The JWT validation checks token expiration at line 67 and returns 401 errors from the \`handleAuthError\` function at line 89.
---

## TOOLS & GUIDELINES

You have access to: read, grep, glob, bash (read-only commands only), team_board

**Strengths:**
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents
- Sharing discovered symbols and call sites with teammates via \`team_board\`

**Guidelines:**
- Use glob for broad file pattern matching
- Use grep for searching file contents with regex
- Use read when you know the specific file path
- Use bash ONLY for read-only operations (ls, git status, git log, git diff, find)
- All bash commands automatically run in the working directory — NEVER prepend \`cd <working-directory> &&\` or similar to commands
- NEVER use bash for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, or any file creation/modification
- Return workspace-relative file paths in your final response (e.g., "src/index.ts:42")`;

const callOptionsSchema = z.object({
  task: z.string().describe("Short description of the exploration task"),
  instructions: z
    .string()
    .describe("Detailed instructions for the exploration"),
  ...sharedSubagentCallOptionsFields,
});

export type ExplorerCallOptions = z.infer<typeof callOptionsSchema>;

const explorerTools = {
  read: readFileTool(),
  dir_list: dirListTool(),
  grep: grepTool(),
  glob: globTool(),
  bash: bashTool(),
  team_board: teamBoardTool,
};

export const explorerSubagent = new ToolLoopAgent({
  // Inert placeholder -- see createInertPlaceholderModel for why this
  // can't be a real sharedProvider() call at module scope. prepareCall
  // below lazily constructs the real default model if the caller
  // doesn't pass one explicitly.
  model: createInertPlaceholderModel(defaultModelLabel),
  instructions: EXPLORER_SYSTEM_PROMPT,
  tools: explorerTools,
  stopWhen: stepCountIs(SUBAGENT_STEP_LIMIT),
  callOptionsSchema,
  prepareStep: ({ steps, stepNumber, messages, model, experimental_context }) =>
    prepareSubagentStep({
      steps,
      stepNumber,
      messages,
      model,
      experimental_context,
    }),
  prepareCall: ({ options, ...settings }) => {
    if (!options) {
      throw new Error("Explorer subagent requires task call options.");
    }

    const model = options.model ?? sharedProvider(defaultModelLabel);
    const teamBlock = options.teamContext ? `${options.teamContext}\n\n` : "";
    return {
      ...settings,
      model,
      tools: addCacheControl({
        tools: settings.tools ?? explorerTools,
        model,
      }),
      ...(options.maxOutputTokens
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
      instructions: addCacheControl({
        instructions: [
          `${EXPLORER_SYSTEM_PROMPT}\n\n${SUBAGENT_WORKING_DIR}`,
          `${teamBlock}## Your Task\n${options.task}\n\n## Detailed Instructions\n${options.instructions}\n\n${EXPLORER_REMINDER}`,
        ],
        model,
      }),
      experimental_context: buildSubagentExperimentalContext(
        options,
        model,
        "explorer",
      ),
    };
  },
});
