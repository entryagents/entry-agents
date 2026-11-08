import { tool } from "ai";
import { z } from "zod";
import { getSandboxForCommand } from "./utils";

const gitStatusInputSchema = z.object({
  path: z
    .string()
    .optional()
    .describe(
      "Optional workspace-relative directory or submodule to check git status for. Defaults to workspace root.",
    ),
});

export type GitStatusInput = z.infer<typeof gitStatusInputSchema>;

export interface GitFileChange {
  status: "modified" | "added" | "deleted" | "untracked" | "renamed" | "other";
  path: string;
}

export interface GitStatusResult {
  success: boolean;
  branch?: string;
  clean?: boolean;
  changedFilesCount?: number;
  changedFiles?: GitFileChange[];
  diffStat?: string;
  summary?: string;
  error?: string;
}

export const gitStatusTool = () =>
  tool({
    description: `Inspect the current git status, branch, and uncommitted working tree changes in the workspace.

WHEN TO USE:
- Checking what files were modified, added, or deleted after making code changes
- Reviewing git branch and working tree cleanliness before completing a task or reporting back
- Reviewing local changes without requiring GitHub account authorization or connected repository accounts

WHEN NOT TO USE:
- Committing or pushing changes (use github_cli with action: 'commit_and_push' when connected and explicitly requested)
- Running arbitrary non-git commands (use bash instead)`,
    inputSchema: gitStatusInputSchema,
    execute: async (
      { path: targetPath },
      { experimental_context },
    ): Promise<GitStatusResult> => {
      let resolved;
      try {
        resolved = await getSandboxForCommand(experimental_context);
      } catch (error) {
        return {
          success: false,
          error: `Sandbox is unavailable (${error instanceof Error ? error.message : String(error)}). Cannot check git status.`,
        };
      }
      const { sandbox } = resolved;
      const cwd = targetPath ? targetPath : sandbox.workingDirectory;

      try {
        const [statusRes, branchRes, diffStatRes] = await Promise.all([
          sandbox.exec("git status --short", cwd, 15000),
          sandbox.exec("git branch --show-current", cwd, 10000),
          sandbox.exec("git diff --stat", cwd, 15000),
        ]);

        if (
          !statusRes.success &&
          (statusRes.stderr.includes("not a git repository") ||
            statusRes.stdout.includes("not a git repository"))
        ) {
          return {
            success: false,
            error: "Current workspace is not a git repository.",
          };
        }

        const branch =
          branchRes.stdout.trim() || sandbox.currentBranch || "HEAD";
        const shortStatus = statusRes.stdout.trim();
        const diffStat = diffStatRes.stdout.trim();

        const lines = shortStatus ? shortStatus.split("\n") : [];
        const changedFiles: GitFileChange[] = lines
          .map((line) => {
            const trimmed = line.trim();
            if (!trimmed) return null;
            const code = trimmed.slice(0, 2).trim();
            const file = trimmed.slice(2).trim();
            let status: GitFileChange["status"] = "other";
            if (code === "M") status = "modified";
            else if (code === "A" || code === "??")
              status = code === "??" ? "untracked" : "added";
            else if (code === "D") status = "deleted";
            else if (code === "R") status = "renamed";
            return { status, path: file };
          })
          .filter((item): item is GitFileChange => item !== null);

        const summary =
          changedFiles.length === 0
            ? "Working tree clean. No uncommitted changes."
            : `Branch: ${branch}\nUncommitted changes (${changedFiles.length} files):\n${shortStatus}\n\nDiff stat:\n${diffStat || "No line changes"}`;

        return {
          success: true,
          branch,
          clean: changedFiles.length === 0,
          changedFilesCount: changedFiles.length,
          changedFiles,
          diffStat: diffStat || "No changes",
          summary,
        };
      } catch (err) {
        return {
          success: false,
          error: `Failed to run git status: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  });
