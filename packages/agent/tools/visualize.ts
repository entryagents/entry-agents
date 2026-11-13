import { tool } from "ai";
import * as path from "path";
import { z } from "zod";
import { getSandbox, toDisplayPath } from "./utils";

const VISUALIZE_KINDS = [
  "diagram",
  "chart",
  "dashboard",
  "simulation",
  "ui",
] as const;

export type VisualizeKind = (typeof VISUALIZE_KINDS)[number];

const visualizeInputSchema = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .describe("Short descriptive title for the interactive visualization."),
  description: z
    .string()
    .max(300)
    .optional()
    .describe(
      "Optional one-line summary explaining what the user can explore or interact with.",
    ),
  kind: z
    .enum(VISUALIZE_KINDS)
    .optional()
    .default("diagram")
    .describe(
      "Category of visualization: 'diagram' (architecture/flow/dependency graph), 'chart' (data plot/metrics), 'dashboard' (multi-panel metrics), 'simulation' (interactive algorithm/physics/state machine), or 'ui' (interactive component/screen prototype).",
    ),
  html: z
    .string()
    .min(1)
    .describe(
      "Complete, self-contained HTML/CSS/JS/SVG/Canvas document or fragment with zero external CDN dependencies. Must adapt cleanly to both light and dark themes (use prefers-color-scheme or inherit clean neutral surfaces).",
    ),
  height: z
    .number()
    .int()
    .min(220)
    .max(760)
    .optional()
    .default(460)
    .describe(
      "Preferred inline preview height in pixels (220-760, default 460).",
    ),
});

export type VisualizeToolInput = z.infer<typeof visualizeInputSchema>;

export interface VisualizeToolOutput {
  success: boolean;
  title: string;
  description: string | null;
  kind: VisualizeKind;
  html: string;
  height: number;
  filePath: string | null;
}

function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "visualization";
}

export const visualizeTool = tool({
  description:
    "Render an interactive, zero-dependency HTML/CSS/JS/SVG/Canvas visualization inline in the chat (architecture diagrams, dependency graphs, live charts, algorithm simulations, dashboards, or interactive UI prototypes). Always self-contained with no external CDN scripts or stylesheets.",
  inputSchema: visualizeInputSchema,
  execute: async (
    { title, description, kind, html, height },
    { experimental_context },
  ): Promise<VisualizeToolOutput> => {
    let filePath: string | null = null;

    try {
      const sandbox = await getSandbox(experimental_context, "visualize");
      const workingDirectory = sandbox.workingDirectory;
      const slug = slugifyTitle(title);
      const targetPath = path.posix.join(
        workingDirectory,
        ".entry-visualizations",
        `${slug}.html`,
      );
      await sandbox.writeFile(targetPath, html, "utf-8");
      filePath = toDisplayPath(targetPath, workingDirectory);
    } catch {
      // Inline rendering does not require sandbox persistence; proceed cleanly
      // even when no sandbox is attached or the workspace is read-only.
      filePath = null;
    }

    return {
      success: true,
      title,
      description: description ?? null,
      kind,
      html,
      height,
      filePath,
    };
  },
});
