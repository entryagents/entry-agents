import * as path from "path";
import { tool } from "ai";
import { z } from "zod";
import { getToolTimeoutMs } from "./tool-timeouts";
import { resolveWorkspacePath } from "./path-security";
import {
  getSandboxForCommand,
  reconnectSandboxAfterMigration,
  shellEscape,
} from "./utils";

const DEFAULT_GIT_CLONE_TIMEOUT_MS = 60_000;
const OWNER_REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function normalizeGitCloneUrl(repo: string): string | null {
  const trimmed = repo.trim();
  if (!trimmed) return null;

  if (OWNER_REPO_PATTERN.test(trimmed)) {
    const clean = trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`;
    return `https://github.com/${clean}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function deriveRepoFolderName(repoUrl: string): string {
  try {
    const parsed = new URL(repoUrl);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "repo";
    const cleaned = last
      .replace(/\.git$/i, "")
      .replace(/[^A-Za-z0-9._-]/g, "-");
    return cleaned || "repo";
  } catch {
    return "repo";
  }
}

const gitCloneInputSchema = z.object({
  repository: z
    .string()
    .min(1)
    .describe(
      "Repository to clone: GitHub shorthand (e.g. 't3-oss/t3code') or an https:// git URL.",
    ),
  destination: z
    .string()
    .optional()
    .describe(
      "Optional target path (defaults to /tmp/repos/<repo-name> so the workspace stays clean). Must be inside /tmp/ or the workspace.",
    ),
  branch: z.string().optional().describe("Optional branch or tag to clone."),
  depth: z
    .number()
    .int()
    .positive()
    .max(100)
    .optional()
    .default(1)
    .describe("Shallow clone depth (defaults to 1)."),
});

export type GitCloneInput = z.infer<typeof gitCloneInputSchema>;

export function gitCloneTool() {
  return tool({
    description:
      "Shallow-clone a public GitHub or HTTPS git repository into /tmp/repos/<name> (or a specified path) so you can inspect external open-source codebases using read, dir_list, grep, and glob without modifying the user's repository.",
    inputSchema: gitCloneInputSchema,
    execute: async (
      { repository, destination, branch, depth },
      { experimental_context },
    ) => {
      const normalizedUrl = normalizeGitCloneUrl(repository);
      if (!normalizedUrl) {
        return {
          success: false,
          error:
            "Invalid repository. Provide an https:// git URL or GitHub owner/repo shorthand (e.g. 't3-oss/t3code').",
        };
      }

      let sandboxResult;
      try {
        sandboxResult = await getSandboxForCommand(experimental_context);
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}).`,
        };
      }
      const { sandbox } = sandboxResult;
      const workingDirectory = sandbox.workingDirectory;

      const defaultDest = `/tmp/repos/${deriveRepoFolderName(normalizedUrl)}`;
      const requestedDest = destination?.trim() || defaultDest;
      const targetPath = resolveWorkspacePath(requestedDest, workingDirectory);

      if (!targetPath) {
        return {
          success: false,
          error:
            "Destination path must be inside /tmp/ or the workspace directory.",
        };
      }

      const parentDir = path.posix.dirname(targetPath);
      const branchFlag = branch?.trim()
        ? `--branch ${shellEscape(branch.trim())} `
        : "";
      const safeDepth = Math.min(100, Math.max(1, depth ?? 1));
      const cmd = [
        `mkdir -p ${shellEscape(parentDir)}`,
        `if [ -d ${shellEscape(`${targetPath}/.git`)} ]; then echo "__ALREADY_CLONED__"; else GIT_TERMINAL_PROMPT=0 git clone --depth ${safeDepth} ${branchFlag}-- ${shellEscape(normalizedUrl)} ${shellEscape(targetPath)}; fi`,
        `ls -1a ${shellEscape(targetPath)} | head -n 40`,
      ].join(" && ");

      const timeoutMs = getToolTimeoutMs(
        "git_clone",
        DEFAULT_GIT_CLONE_TIMEOUT_MS,
      );

      let result = await sandbox.exec(cmd, workingDirectory, timeoutMs);

      if (!result.success && result.killedExternally) {
        const reconnected =
          await reconnectSandboxAfterMigration(experimental_context);
        if (reconnected) {
          result = await reconnected.exec(cmd, workingDirectory, timeoutMs);
        }
      }

      if (!result.success) {
        return {
          success: false,
          repository: normalizedUrl,
          path: targetPath,
          error: result.stderr || result.stdout || "git clone failed",
        };
      }

      const lines = result.stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const alreadyCloned = lines.includes("__ALREADY_CLONED__");
      const entries = lines.filter(
        (line) =>
          line !== "__ALREADY_CLONED__" && line !== "." && line !== "..",
      );

      return {
        success: true,
        repository: normalizedUrl,
        path: targetPath,
        alreadyCloned,
        entries,
      };
    },
  });
}
