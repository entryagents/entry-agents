import { tool } from "ai";
import { z } from "zod";
import { resolveWorkspacePath } from "./path-security";
import { getSandboxForCommand } from "./utils";

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/**
 * First-class browser automation tool wrapping `agent-browser` (with headless
 * Chrome pre-installed on Boxd VMs). Always use this tool for web testing,
 * UI audits, screenshots, DOM inspection, and form interaction instead of
 * installing Playwright or writing custom browser bash scripts.
 */
export function browserTool() {
  return tool({
    description: `Drive the sandbox's built-in headless browser directly. ALWAYS use this tool for web/UI testing, screenshots, clicking, filling forms, and checking console errors — never install Playwright or Chromium via npm.
Actions:
- open: Navigate to a URL (supports optional viewportWidth / viewportHeight).
- snapshot: Get interactive elements with @ref IDs for clicking/filling.
- click / fill / type / press: Interact with elements by @ref or CSS selector.
- screenshot: Save a PNG screenshot to the workspace (then inspect it with read).
- console / errors: Read browser console output or page errors.
- eval: Evaluate a JavaScript expression in the active page.
- close: Close the browser session.`,
    inputSchema: z.object({
      action: z.enum([
        "open",
        "snapshot",
        "click",
        "fill",
        "type",
        "press",
        "screenshot",
        "console",
        "errors",
        "eval",
        "close",
      ]),
      url: z.string().optional().describe("URL to open (for action: 'open')"),
      target: z
        .string()
        .optional()
        .describe("Element @ref or CSS selector (for click/fill/type)"),
      value: z
        .string()
        .optional()
        .describe(
          "Text value, key name, or JS expression (for fill/type/press/eval)",
        ),
      outputPath: z
        .string()
        .optional()
        .describe(
          "Workspace-relative PNG path for screenshot (default: .entry-screenshots/page.png)",
        ),
      fullPage: z
        .boolean()
        .optional()
        .default(false)
        .describe("Capture full scrollable page (for action: 'screenshot')"),
      viewportWidth: z.number().int().min(320).max(2560).optional(),
      viewportHeight: z.number().int().min(320).max(2560).optional(),
    }),
    execute: async (input, { experimental_context }) => {
      const { sandbox } = await getSandboxForCommand(experimental_context);
      const workingDirectory = sandbox.workingDirectory;

      const buildCommand = ():
        | { ok: true; cmd: string; screenshotPath?: string }
        | { ok: false; error: string } => {
        switch (input.action) {
          case "open": {
            if (!input.url)
              return { ok: false, error: "url is required for action 'open'" };
            const cmds: string[] = [];
            if (input.viewportWidth && input.viewportHeight) {
              cmds.push(
                `agent-browser set viewport ${input.viewportWidth} ${input.viewportHeight}`,
              );
            }
            cmds.push(`agent-browser open ${shellEscape(input.url)}`);
            return { ok: true, cmd: cmds.join(" && ") };
          }
          case "snapshot":
            return { ok: true, cmd: "agent-browser snapshot -i" };
          case "click":
            if (!input.target)
              return {
                ok: false,
                error: "target is required for action 'click'",
              };
            return {
              ok: true,
              cmd: `agent-browser click ${shellEscape(input.target)}`,
            };
          case "fill":
            if (!input.target || input.value === undefined) {
              return {
                ok: false,
                error: "target and value are required for action 'fill'",
              };
            }
            return {
              ok: true,
              cmd: `agent-browser fill ${shellEscape(input.target)} ${shellEscape(input.value)}`,
            };
          case "type":
            if (!input.target || input.value === undefined) {
              return {
                ok: false,
                error: "target and value are required for action 'type'",
              };
            }
            return {
              ok: true,
              cmd: `agent-browser type ${shellEscape(input.target)} ${shellEscape(input.value)}`,
            };
          case "press":
            if (!input.value)
              return {
                ok: false,
                error: "value (key name) is required for action 'press'",
              };
            return {
              ok: true,
              cmd: `agent-browser press ${shellEscape(input.value)}`,
            };
          case "screenshot": {
            const rel =
              input.outputPath?.trim() || ".entry-screenshots/page.png";
            const abs = resolveWorkspacePath(rel, workingDirectory);
            if (!abs)
              return {
                ok: false,
                error: `Invalid outputPath outside workspace: ${rel}`,
              };
            const dir = abs.slice(0, abs.lastIndexOf("/")) || workingDirectory;
            const flag = input.fullPage ? " --full" : "";
            return {
              ok: true,
              cmd: `mkdir -p ${shellEscape(dir)} && agent-browser screenshot${flag} ${shellEscape(abs)}`,
              screenshotPath: rel,
            };
          }
          case "console":
            return { ok: true, cmd: "agent-browser console" };
          case "errors":
            return { ok: true, cmd: "agent-browser errors" };
          case "eval":
            if (!input.value)
              return {
                ok: false,
                error: "value (JS expression) is required for action 'eval'",
              };
            return {
              ok: true,
              cmd: `agent-browser eval ${shellEscape(input.value)}`,
            };
          case "close":
            return { ok: true, cmd: "agent-browser close" };
        }
      };

      const built = buildCommand();
      if (!built.ok) {
        return { success: false, error: built.error };
      }

      const res = await sandbox.exec(built.cmd, workingDirectory, 60_000);
      if (!res.success) {
        return {
          success: false,
          error: (
            res.stderr ||
            res.stdout ||
            `browser ${input.action} failed`
          ).trim(),
        };
      }

      return {
        success: true,
        action: input.action,
        ...(built.screenshotPath
          ? { screenshotPath: built.screenshotPath }
          : {}),
        output: (res.stdout || "").trim().slice(0, 12_000),
      };
    },
  });
}
