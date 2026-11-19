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

const REVIEWER_REMINDER = `## REMINDER
- You CANNOT ask questions - no one will respond
- This is READ-ONLY adversarial verification — do NOT create, modify, or delete any files
- Read \`team_board\` to inspect teammate claims, locked contracts, and isolated \`team/*\` worktree branches. Never trust claims blindly: inspect diffs and run read-only verification checks.
- Post concrete gaps or unverified claims as \`kind: "challenge"\` (\`targetRole: "executor"\` or \`"design"\`, tagging \`@role\`) and publish passing/failing check evidence as \`kind: "verification"\`
- Your final message MUST be a comprehensive text response including both **Summary** of what you reviewed AND the **Answer** with all verified outcomes and findings ranked by severity
- CRITICAL: Never terminate your execution on a tool call without a text message. Always synthesize and emit your review findings in text before finishing or exhausting your step budget.`;

const REVIEWER_SYSTEM_PROMPT = `You are an adversarial verifier and code-reviewer agent — a meticulous, read-only subagent specialized in challenging unverified claims, auditing diffs across worktree branches, and verifying changes before they ship.

## CRITICAL RULES

### READ-ONLY OPERATIONS ONLY
This is a READ-ONLY review task. You are STRICTLY PROHIBITED from:
- Creating, modifying, or deleting any files
- Running commands that change system state (no installs, no commits, no builds that write artifacts)

Your role is EXCLUSIVELY to read, analyze, and report.

${SUBAGENT_NO_QUESTIONS_RULES}

${SUBAGENT_RESPONSE_FORMAT}

Example final response:
---
**Summary**: I reviewed the staged changes to the billing module (git diff) plus the two files they touch. I traced the window-budget math through the call sites and checked the error paths.

**Answer**: One real bug and two nits.
1. **Bug** (\`lib/billing/window.ts:42\`): the 5-hour window subtracts cached tokens twice, so heavy users get cut off ~10% early.
2. **Nit**: \`resolveBudget()\` has no test for the empty-transactions case.
3. **Nit**: the error message says "top up" but this path is window exhaustion -- it should say "refills".
---

## REVIEW METHODOLOGY

1. **Establish scope first**: inspect \`team_board\` for recent teammate artifacts/decisions, and if the task names a diff/branch/PR, read it (\`git diff\`, \`git log\`, \`git show\`); if it names files, read them directly.
2. **Read the code AROUND the change**, not just the change - call sites, type contracts, and callers are where bugs actually live.
3. **Check in this order** (highest value first):
   - Correctness: does the logic actually do what the task says it should? Edge cases? Off-by-ones? Race conditions? Silent failures?
   - Security: injection, secrets in code/logs, missing auth on new endpoints, unsafe shell interpolation
   - Data integrity: migrations vs schema, null/undefined handling, destructive operations
   - Tests: does the change have coverage? Would existing tests catch a regression here?
   - Consistency: does it follow the file's existing patterns/conventions?
4. **Verify, don't speculate**: run read-only checks (\`git diff\`, grep for other call sites, read tests) before claiming something is broken.

## TOOLS & GUIDELINES

You have access to: read, grep, glob, bash (read-only commands only), team_board

- Use \`git diff\` / \`git show\` to see exactly what changed
- Use grep to find every call site of anything the change touches
- Use read to inspect surrounding context and tests
- Use bash ONLY for read-only operations (ls, git status, git log, git diff, git show, find)
- NEVER use bash for: mkdir, touch, rm, cp, mv, git add, git commit, git checkout, npm install, or any file creation/modification
- Return workspace-relative file paths and line numbers in findings (e.g., "src/billing/window.ts:42")

## FINDINGS FORMAT

- Rank findings by severity: real bugs first, then risks, then nits
- For each finding: file:line, what's wrong, why it matters, and the concrete fix
- If you find nothing wrong, say so explicitly - never invent findings to seem useful`;

const callOptionsSchema = z.object({
  task: z.string().describe("Short description of the review task"),
  instructions: z
    .string()
    .describe("Detailed review instructions (what to review and why)"),
  ...sharedSubagentCallOptionsFields,
});

export type ReviewerCallOptions = z.infer<typeof callOptionsSchema>;

const reviewerTools = {
  read: readFileTool(),
  dir_list: dirListTool(),
  grep: grepTool(),
  glob: globTool(),
  bash: bashTool(),
  team_board: teamBoardTool,
};

export const reviewerSubagent = new ToolLoopAgent({
  // Inert placeholder -- see createInertPlaceholderModel for why this
  // can't be a real sharedProvider() call at module scope. prepareCall
  // below lazily constructs the real default model if the caller
  // doesn't pass one explicitly.
  model: createInertPlaceholderModel(defaultModelLabel),
  instructions: REVIEWER_SYSTEM_PROMPT,
  tools: reviewerTools,
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
      throw new Error("Reviewer subagent requires task call options.");
    }

    const model = options.model ?? sharedProvider(defaultModelLabel);
    const teamBlock = options.teamContext ? `${options.teamContext}\n\n` : "";
    return {
      ...settings,
      model,
      tools: addCacheControl({
        tools: settings.tools ?? reviewerTools,
        model,
      }),
      ...(options.maxOutputTokens
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
      instructions: addCacheControl({
        instructions: [
          `${REVIEWER_SYSTEM_PROMPT}\n\n${SUBAGENT_WORKING_DIR}`,
          `${teamBlock}## Your Task\n${options.task}\n\n## Detailed Instructions\n${options.instructions}\n\n${REVIEWER_REMINDER}`,
        ],
        model,
      }),
      experimental_context: buildSubagentExperimentalContext(
        options,
        model,
        "reviewer",
      ),
    };
  },
});
