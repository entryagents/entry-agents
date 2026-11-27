import { addCacheControl } from "../context-management";
import { stepCountIs, ToolLoopAgent } from "ai";
import { defaultModelLabel } from "../default-model";
import { createInertPlaceholderModel, sharedProvider } from "../models";
import { z } from "zod";
import { bashTool } from "../tools/bash";
import { globTool } from "../tools/glob";
import { grepTool } from "../tools/grep";
import { readFileTool } from "../tools/read";
import { createReadFileState } from "../tools/read-state";
import { editFileTool, writeFileTool } from "../tools/write";
import { sendParentUpdateTool } from "../tools/subagent-control";
import { teamBoardTool } from "../tools/team";
import { webFetchTool } from "../tools/fetch";
import {
  buildSubagentExperimentalContext,
  sharedSubagentCallOptionsFields,
} from "./call-options";
import {
  DESIGN_STEP_LIMIT,
  SUBAGENT_BASH_RULES,
  SUBAGENT_COMPLETE_TASK_RULES,
  SUBAGENT_NO_QUESTIONS_RULES,
  SUBAGENT_REMINDER,
  SUBAGENT_RESPONSE_FORMAT,
  SUBAGENT_VALIDATE_RULES,
  SUBAGENT_WORKING_DIR,
} from "./constants";
import { prepareSubagentStep } from "./prepare-step";

const DESIGN_SYSTEM_PROMPT = `You are a design agent — a specialized subagent that creates distinctive, production-grade frontend interfaces with exceptional design quality. You avoid generic "AI slop" aesthetics and implement real working code with extraordinary attention to aesthetic details and creative choices.

## CRITICAL RULES

${SUBAGENT_NO_QUESTIONS_RULES}

${SUBAGENT_COMPLETE_TASK_RULES}

${SUBAGENT_RESPONSE_FORMAT}

Example final response:
---
**Summary**: I created a landing page with a brutalist aesthetic, using Clash Display for headings and JetBrains Mono for body text. I implemented staggered entrance animations, a custom grain overlay, and an asymmetric grid layout with overlapping elements.

**Answer**: The landing page is implemented:
- \`src/components/landing.tsx\` - Main landing page component
- \`src/styles/landing.css\` - Custom styles with CSS variables for the color system
---

${SUBAGENT_VALIDATE_RULES}

## DESIGN THINKING

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian, etc. There are so many flavors to choose from. Use these for inspiration but design one that is true to the aesthetic direction.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail

## FRONTEND AESTHETICS GUIDELINES

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics; unexpected, characterful font choices. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Prioritize CSS-only solutions for HTML. Use Motion library for React when available. Focus on high-impact moments: one well-orchestrated page load with staggered reveals (animation-delay) creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic. Apply creative forms like gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, custom cursors, and grain overlays.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

Interpret creatively and make unexpected choices that feel genuinely designed for the context. No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices (Space Grotesk, for example) across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details. Elegance comes from executing the vision well.

Remember: You are capable of extraordinary creative work. Don't hold back — show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

## TOOLS
You have full access to file operations (read, write, edit, grep, glob), bash commands, and \`team_board\` (read locked contracts and existing file claims first, claim your task with non-overlapping \`files\` and your isolated \`worktreeBranch\` when present, mark \`completed\` with \`verification\` evidence, and post \`@executor\` / \`@reviewer\` handoffs on \`team_board\`). Use them to complete your task.

${SUBAGENT_BASH_RULES}`;

const callOptionsSchema = z.object({
  task: z.string().describe("Short description of the task"),
  instructions: z.string().describe("Detailed instructions for the task"),
  ...sharedSubagentCallOptionsFields,
});

export type DesignCallOptions = z.infer<typeof callOptionsSchema>;

const designTools = {
  read: readFileTool(),
  write: writeFileTool(),
  edit: editFileTool(),
  grep: grepTool(),
  glob: globTool(),
  bash: bashTool(),
  web_fetch: webFetchTool,
  team_board: teamBoardTool,
  send_parent_update: sendParentUpdateTool,
};

export const designSubagent = new ToolLoopAgent({
  // Inert placeholder -- see createInertPlaceholderModel for why this
  // can't be a real sharedProvider() call at module scope. prepareCall
  // below lazily constructs the real default model if the caller
  // doesn't pass one explicitly.
  model: createInertPlaceholderModel(defaultModelLabel),
  instructions: DESIGN_SYSTEM_PROMPT,
  tools: designTools,
  stopWhen: stepCountIs(DESIGN_STEP_LIMIT),
  callOptionsSchema,
  prepareStep: ({ steps, stepNumber, messages, model, experimental_context }) =>
    prepareSubagentStep({
      steps,
      stepNumber,
      messages,
      model,
      experimental_context,
      trackReadFileState: true,
      stepLimit: DESIGN_STEP_LIMIT,
    }),
  prepareCall: ({ options, ...settings }) => {
    if (!options) {
      throw new Error("Design subagent requires task call options.");
    }

    const model = options.model ?? sharedProvider(defaultModelLabel);
    const teamBlock = options.teamContext ? `${options.teamContext}\n\n` : "";
    return {
      ...settings,
      model,
      tools: addCacheControl({
        tools: settings.tools ?? designTools,
        model,
      }),
      ...(options.maxOutputTokens
        ? { maxOutputTokens: options.maxOutputTokens }
        : {}),
      instructions: addCacheControl({
        instructions: [
          `${DESIGN_SYSTEM_PROMPT}\n\n${SUBAGENT_WORKING_DIR}`,
          `${teamBlock}## Your Task\n${options.task}\n\n## Detailed Instructions\n${options.instructions}\n\n${SUBAGENT_REMINDER}`,
        ],
        model,
      }),
      experimental_context: buildSubagentExperimentalContext(
        options,
        model,
        "design",
        createReadFileState(),
      ),
    };
  },
});
