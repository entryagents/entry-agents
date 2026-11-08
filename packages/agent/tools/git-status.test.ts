import { describe, expect, test } from "bun:test";
import type { Sandbox } from "@entry-agents/sandbox";
import { gitStatusTool } from "./git-status";

type ToolWithExecute = {
  execute: (
    input: unknown,
    options: { experimental_context: unknown },
  ) => Promise<{
    success: boolean;
    clean?: boolean;
    branch?: string;
    changedFilesCount?: number;
    summary?: string;
    changedFiles?: Array<{ status: string; path: string }>;
    error?: string;
  }>;
};

describe("gitStatusTool", () => {
  test("returns branch and clean status when git working tree has no changes", async () => {
    const sandbox = {
      type: "local" as const,
      workingDirectory: "/workspace",
      async exec(cmd: string) {
        if (cmd.includes("status --short")) {
          return { exitCode: 0, stdout: "", stderr: "", success: true };
        }
        if (cmd.includes("branch --show-current")) {
          return {
            exitCode: 0,
            stdout: "feature/fast-stream\n",
            stderr: "",
            success: true,
          };
        }
        if (cmd.includes("diff --stat")) {
          return { exitCode: 0, stdout: "", stderr: "", success: true };
        }
        return { exitCode: 0, stdout: "", stderr: "", success: true };
      },
      async stat() {
        return { isDirectory: () => true } as unknown as Awaited<
          ReturnType<Sandbox["stat"]>
        >;
      },
    };

    const tool = gitStatusTool();
    const result = await (tool as unknown as ToolWithExecute).execute(
      {},
      { experimental_context: { sandbox } },
    );

    expect(result.success).toBe(true);
    expect(result.clean).toBe(true);
    expect(result.branch).toBe("feature/fast-stream");
    expect(result.changedFilesCount).toBe(0);
    expect(result.summary).toContain("Working tree clean");
  });

  test("parses modified and untracked files correctly", async () => {
    const sandbox = {
      type: "local" as const,
      workingDirectory: "/workspace",
      async exec(cmd: string) {
        if (cmd.includes("status --short")) {
          return {
            exitCode: 0,
            stdout: " M src/index.ts\n?? new-file.ts\n D old-file.ts\n",
            stderr: "",
            success: true,
          };
        }
        if (cmd.includes("branch --show-current")) {
          return { exitCode: 0, stdout: "main\n", stderr: "", success: true };
        }
        if (cmd.includes("diff --stat")) {
          return {
            exitCode: 0,
            stdout: "src/index.ts | 4 ++--\n 1 file changed\n",
            stderr: "",
            success: true,
          };
        }
        return { exitCode: 0, stdout: "", stderr: "", success: true };
      },
      async stat() {
        return { isDirectory: () => true } as unknown as Awaited<
          ReturnType<Sandbox["stat"]>
        >;
      },
    };

    const tool = gitStatusTool();
    const result = await (tool as unknown as ToolWithExecute).execute(
      {},
      { experimental_context: { sandbox } },
    );

    expect(result.success).toBe(true);
    expect(result.clean).toBe(false);
    expect(result.branch).toBe("main");
    expect(result.changedFilesCount).toBe(3);
    expect(result.changedFiles).toEqual([
      { status: "modified", path: "src/index.ts" },
      { status: "untracked", path: "new-file.ts" },
      { status: "deleted", path: "old-file.ts" },
    ]);
  });

  test("returns error if directory is not a git repository", async () => {
    const sandbox = {
      type: "local" as const,
      workingDirectory: "/workspace",
      async exec() {
        return {
          exitCode: 128,
          stdout: "",
          stderr:
            "fatal: not a git repository (or any of the parent directories): .git",
          success: false,
        };
      },
      async stat() {
        return { isDirectory: () => true } as unknown as Awaited<
          ReturnType<Sandbox["stat"]>
        >;
      },
    };

    const tool = gitStatusTool();
    const result = await (tool as unknown as ToolWithExecute).execute(
      {},
      { experimental_context: { sandbox } },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("not a git repository");
  });
});
