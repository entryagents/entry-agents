import { afterEach, describe, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { connectLocal } from "@entry-agents/sandbox";
import { isWorktreeEligibleRole, prepareSubagentWorktree } from "../worktree";

const execFileAsync = promisify(execFile);

const tempDirs: string[] = [];

async function makeTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function initGitRepoWithCommit(dir: string): Promise<void> {
  await runGit(dir, ["init"]);
  await runGit(dir, ["config", "user.name", "Test User"]);
  await runGit(dir, ["config", "user.email", "test@entry-agents.dev"]);
  await fs.writeFile(path.join(dir, "README.md"), "# test\n", "utf-8");
  await runGit(dir, ["add", "README.md"]);
  await runGit(dir, ["commit", "-m", "initial commit"]);
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("prepareSubagentWorktree", () => {
  test("eligible role predicate limits isolation to write-capable specialists", () => {
    expect(isWorktreeEligibleRole("executor")).toBe(true);
    expect(isWorktreeEligibleRole("design")).toBe(true);
    expect(isWorktreeEligibleRole("reviewer")).toBe(false);
    expect(isWorktreeEligibleRole("explorer")).toBe(false);
    expect(isWorktreeEligibleRole("architect")).toBe(false);
  });

  test("returns null outside git repo, on unborn HEAD, when disabled, or for read-only roles", async () => {
    const nonGitDir = await makeTempDir("entry-wt-nongit-");
    const nonGitSandbox = await connectLocal({ rootDir: nonGitDir });
    expect(
      await prepareSubagentWorktree(nonGitSandbox, {
        role: "executor",
        taskCallId: "call_nongit_1",
      }),
    ).toBeNull();

    const unbornDir = await makeTempDir("entry-wt-unborn-");
    await runGit(unbornDir, ["init"]);
    const unbornSandbox = await connectLocal({ rootDir: unbornDir });
    expect(
      await prepareSubagentWorktree(unbornSandbox, {
        role: "executor",
        taskCallId: "call_unborn_1",
      }),
    ).toBeNull();

    const repoDir = await makeTempDir("entry-wt-gates-");
    await initGitRepoWithCommit(repoDir);
    const repoSandbox = await connectLocal({ rootDir: repoDir });

    expect(
      await prepareSubagentWorktree(repoSandbox, {
        role: "executor",
        taskCallId: "call_disabled",
        enabled: false,
      }),
    ).toBeNull();
    expect(
      await prepareSubagentWorktree(repoSandbox, {
        role: "reviewer",
        taskCallId: "call_rev",
      }),
    ).toBeNull();
    expect(
      await prepareSubagentWorktree(repoSandbox, {
        role: "explorer",
        taskCallId: "call_exp",
      }),
    ).toBeNull();
    expect(
      await prepareSubagentWorktree(null, {
        role: "executor",
        taskCallId: "call_null",
      }),
    ).toBeNull();
  });

  test("provisions isolated worktree, keeps main checkout clean, summarizes diffs, and checkpoints dirty writes on cleanup", async () => {
    const repoDir = await makeTempDir("entry-wt-dirty-");
    await initGitRepoWithCommit(repoDir);
    const baseSandbox = await connectLocal({ rootDir: repoDir });

    const worktree = await prepareSubagentWorktree(baseSandbox, {
      role: "executor",
      taskCallId: "call1234567890",
    });
    expect(worktree).not.toBeNull();
    if (!worktree) return;

    expect(worktree.branchName).toBe("team/executor-call1234");
    expect(worktree.worktreePath).toBe(
      path.posix.join(repoDir, ".entry/worktrees/executor-call1234"),
    );
    expect(worktree.scopedSandbox.workingDirectory).toBe(worktree.worktreePath);

    const branchResult = await worktree.scopedSandbox.exec(
      "git branch --show-current",
      ".",
      5000,
    );
    expect(branchResult.success).toBe(true);
    expect(branchResult.stdout.trim()).toBe("team/executor-call1234");

    await worktree.scopedSandbox.mkdir("src", { recursive: true });
    await worktree.scopedSandbox.writeFile(
      "src/isolated.ts",
      "export const isolated = true;\n",
      "utf-8",
    );

    const existsInMain = await fs
      .access(path.join(repoDir, "src/isolated.ts"))
      .then(() => true)
      .catch(() => false);
    expect(existsInMain).toBe(false);

    const preCleanupDiff = await worktree.collectDiffSummary();
    expect(preCleanupDiff.branchName).toBe("team/executor-call1234");
    expect(preCleanupDiff.changedFiles).toContain("src/isolated.ts");
    expect(preCleanupDiff.summaryLine).toContain("team/executor-call1234");

    const cleanupResult = await worktree.cleanup();
    expect(cleanupResult.removedWorktree).toBe(true);
    expect(cleanupResult.preservedBranch).toBe(true);
    expect(cleanupResult.commitCount).toBe(1);
    expect(cleanupResult.commitSha).toBeTruthy();

    const worktreeStillExists = await fs
      .access(worktree.worktreePath)
      .then(() => true)
      .catch(() => false);
    expect(worktreeStillExists).toBe(false);

    const branches = await runGit(repoDir, [
      "branch",
      "--list",
      worktree.branchName,
    ]);
    expect(branches).toContain(worktree.branchName);

    const postCleanupDiff = await worktree.collectDiffSummary();
    expect(postCleanupDiff.changedFiles).toContain("src/isolated.ts");
    expect(postCleanupDiff.commitCount).toBe(1);
  });

  test("removes unused zero-commit branch on cleanup", async () => {
    const repoDir = await makeTempDir("entry-wt-clean-");
    await initGitRepoWithCommit(repoDir);
    const baseSandbox = await connectLocal({ rootDir: repoDir });

    const worktree = await prepareSubagentWorktree(baseSandbox, {
      role: "design",
      taskCallId: "design998877",
    });
    expect(worktree).not.toBeNull();
    if (!worktree) return;

    const cleanupResult = await worktree.cleanup();
    expect(cleanupResult).toEqual({
      preservedBranch: false,
      removedWorktree: true,
      commitCount: 0,
    });

    const branches = await runGit(repoDir, [
      "branch",
      "--list",
      worktree.branchName,
    ]);
    expect(branches).toBe("");
  });
});
