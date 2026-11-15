import * as path from "node:path";
import type { Sandbox, SandboxState } from "@entry-agents/sandbox";
import { shellEscape } from "../tools/utils";

export const WORKTREE_ISOLATED_ROLES = new Set(["executor", "design"]);

export function isWorktreeEligibleRole(role: string): boolean {
  return WORKTREE_ISOLATED_ROLES.has(role);
}

export interface WorktreeDiffSummary {
  branchName: string;
  worktreePath: string;
  commitCount: number;
  changedFiles: string[];
  summaryLine: string;
}

export interface WorktreeCleanupResult {
  preservedBranch: boolean;
  removedWorktree: boolean;
  commitSha?: string;
  commitCount: number;
}

export interface SubagentWorktree {
  role: string;
  branchName: string;
  worktreePath: string;
  scopedSandbox: Sandbox & { state?: SandboxState };
  collectDiffSummary: () => Promise<WorktreeDiffSummary>;
  cleanup: () => Promise<WorktreeCleanupResult>;
}

const EXCLUDE_MARKER = ".entry/";

function sanitizeSegment(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16);
  return cleaned || crypto.randomUUID().slice(0, 8);
}

function resolveForWorktree(
  filePath: string,
  baseRoot: string,
  worktreePath: string,
): string {
  if (!path.isAbsolute(filePath)) {
    return path.posix.resolve(worktreePath, filePath);
  }
  const normalizedBase = path.posix.resolve(baseRoot);
  const normalizedTarget = path.posix.resolve(filePath);
  if (normalizedTarget === normalizedBase) {
    return worktreePath;
  }
  if (normalizedTarget.startsWith(`${normalizedBase}/`)) {
    const rel = normalizedTarget.slice(normalizedBase.length + 1);
    return path.posix.join(worktreePath, rel);
  }
  return filePath;
}

function resolveExecCwd(
  cwd: string | undefined,
  baseRoot: string,
  worktreePath: string,
): string {
  if (!cwd || cwd === ".") return worktreePath;
  if (!path.isAbsolute(cwd)) {
    return path.posix.resolve(worktreePath, cwd);
  }
  const normalizedBase = path.posix.resolve(baseRoot);
  const normalizedCwd = path.posix.resolve(cwd);
  if (normalizedCwd === normalizedBase) {
    return worktreePath;
  }
  if (normalizedCwd.startsWith(`${normalizedBase}/`)) {
    const rel = normalizedCwd.slice(normalizedBase.length + 1);
    return path.posix.join(worktreePath, rel);
  }
  return cwd;
}

async function ensureGitExcludeEntry(
  sandbox: Sandbox,
  baseRoot: string,
): Promise<void> {
  const excludePathResult = await sandbox.exec(
    "git rev-parse --git-path info/exclude",
    baseRoot,
    5000,
  );
  if (!excludePathResult.success) return;

  const rawPath = excludePathResult.stdout.trim();
  if (!rawPath) return;
  const excludePath = path.isAbsolute(rawPath)
    ? rawPath
    : path.posix.resolve(baseRoot, rawPath);

  let existing = "";
  try {
    existing = await sandbox.readFile(excludePath, "utf-8");
  } catch {
    const parent = path.posix.dirname(excludePath);
    try {
      await sandbox.mkdir(parent, { recursive: true });
    } catch {
      // Ignore mkdir failures on non-writable exclude dir
    }
  }

  const lines = existing.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(EXCLUDE_MARKER) || lines.includes(".entry")) {
    return;
  }

  const separator =
    existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  try {
    await sandbox.writeFile(
      excludePath,
      `${existing}${separator}${EXCLUDE_MARKER}\n`,
      "utf-8",
    );
  } catch {
    // Non-fatal; worktree isolation still operates cleanly
  }
}

function createWorktreeSandboxProxy(params: {
  baseSandbox: Sandbox;
  baseRoot: string;
  worktreePath: string;
  branchName: string;
  sandboxState?: SandboxState;
}): Sandbox & { state?: SandboxState } {
  const { baseSandbox, baseRoot, worktreePath, branchName, sandboxState } =
    params;

  const pathTranslatorMethods = new Set<string | symbol>([
    "readFile",
    "readFileBuffer",
    "writeFile",
    "writeFileBuffer",
    "stat",
    "access",
    "mkdir",
    "readdir",
  ]);

  return new Proxy(baseSandbox as Sandbox & { state?: SandboxState }, {
    get(target, prop, receiver) {
      if (prop === "workingDirectory") {
        return worktreePath;
      }
      if (prop === "currentBranch") {
        return branchName;
      }
      if (prop === "state") {
        return (
          sandboxState ??
          (target as { state?: SandboxState }).state ?? {
            type: "local" as const,
          }
        );
      }
      if (prop === "exec") {
        return (
          command: string,
          cwd: string,
          timeoutMs: number,
          options?: { signal?: AbortSignal; env?: Record<string, string> },
        ) =>
          target.exec(
            command,
            resolveExecCwd(cwd, baseRoot, worktreePath),
            timeoutMs,
            options,
          );
      }
      if (
        prop === "execDetached" &&
        typeof target.execDetached === "function"
      ) {
        return (command: string, cwd: string) =>
          target.execDetached!(
            command,
            resolveExecCwd(cwd, baseRoot, worktreePath),
          );
      }

      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }

      if (pathTranslatorMethods.has(prop)) {
        return (filePath: string, ...rest: unknown[]) =>
          value.call(
            target,
            resolveForWorktree(filePath, baseRoot, worktreePath),
            ...rest,
          );
      }

      return value.bind(target);
    },
  });
}

/**
 * Provision an isolated git worktree under `.entry/worktrees/<role>-<id>`
 * checked out onto branch `team/<role>-<id>` for write-capable teammates
 * (`executor`, `design`). Gracefully returns `null` when the workspace is not
 * a git repository, has an unborn HEAD, or worktree creation is unavailable.
 */
export async function prepareSubagentWorktree(
  baseSandbox: Sandbox | null | undefined,
  options: {
    role: string;
    taskCallId: string;
    enabled?: boolean;
    sandboxState?: SandboxState;
  },
): Promise<SubagentWorktree | null> {
  if (!baseSandbox || options.enabled === false) {
    return null;
  }
  if (!isWorktreeEligibleRole(options.role)) {
    return null;
  }

  const baseRoot = baseSandbox.workingDirectory;
  if (!baseRoot) {
    return null;
  }

  const gitCheck = await baseSandbox
    .exec("git rev-parse --is-inside-work-tree", baseRoot, 5000)
    .catch(() => null);
  if (!gitCheck?.success || gitCheck.stdout.trim() !== "true") {
    return null;
  }

  const headCheck = await baseSandbox
    .exec("git rev-parse --verify HEAD", baseRoot, 5000)
    .catch(() => null);
  const baseHead = headCheck?.success ? headCheck.stdout.trim() : "";
  if (!baseHead) {
    return null;
  }

  const role = sanitizeSegment(options.role).toLowerCase();
  const shortId = sanitizeSegment(options.taskCallId).slice(0, 8);
  const branchName = `team/${role}-${shortId}`;
  const worktreeRel = `.entry/worktrees/${role}-${shortId}`;
  const worktreePath = path.posix.join(baseRoot, worktreeRel);

  await ensureGitExcludeEntry(baseSandbox, baseRoot);
  try {
    await baseSandbox.mkdir(path.posix.join(baseRoot, ".entry/worktrees"), {
      recursive: true,
    });
  } catch {
    // Ignore if parent exists or git creates it
  }

  const addResult = await baseSandbox
    .exec(
      `git worktree add -B ${shellEscape(branchName)} ${shellEscape(worktreePath)} ${shellEscape(baseHead)}`,
      baseRoot,
      20_000,
    )
    .catch(() => null);

  if (!addResult?.success) {
    return null;
  }

  const scopedSandbox = createWorktreeSandboxProxy({
    baseSandbox,
    baseRoot,
    worktreePath,
    branchName,
    sandboxState: options.sandboxState,
  });

  let cachedDiffSummary: WorktreeDiffSummary | null = null;
  let cleanupPromise: Promise<WorktreeCleanupResult> | null = null;

  const collectDiffSummary = async (): Promise<WorktreeDiffSummary> => {
    if (cachedDiffSummary) return cachedDiffSummary;

    const changed = new Set<string>();

    const commitCountRes = await baseSandbox
      .exec(
        `git rev-list --count ${shellEscape(baseHead)}..HEAD`,
        worktreePath,
        5000,
      )
      .catch(() => null);
    const commitCount = commitCountRes?.success
      ? Number.parseInt(commitCountRes.stdout.trim(), 10) || 0
      : 0;

    if (commitCount > 0) {
      const committedFilesRes = await baseSandbox
        .exec(
          `git diff --name-only ${shellEscape(baseHead)}..HEAD`,
          worktreePath,
          5000,
        )
        .catch(() => null);
      if (committedFilesRes?.success) {
        for (const line of committedFilesRes.stdout.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed) changed.add(trimmed);
        }
      }
    }

    const statusRes = await baseSandbox
      .exec("git status --porcelain -uall", worktreePath, 5000)
      .catch(() => null);
    if (statusRes?.success) {
      for (const line of statusRes.stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const filePart = line.slice(3).trim();
        const resolvedPart = filePart.includes(" -> ")
          ? (filePart.split(" -> ").pop()?.trim() ?? filePart)
          : filePart;
        if (resolvedPart) changed.add(resolvedPart);
      }
    }

    const changedFiles = [...changed];
    const summaryLine =
      changedFiles.length > 0
        ? `Branch \`${branchName}\` (${changedFiles.length} changed file${changedFiles.length === 1 ? "" : "s"}, ${commitCount} commit${commitCount === 1 ? "" : "s"}): ${changedFiles.slice(0, 8).join(", ")}${changedFiles.length > 8 ? ", ..." : ""}`
        : `Branch \`${branchName}\` (no repository changes recorded)`;

    const summary: WorktreeDiffSummary = {
      branchName,
      worktreePath,
      commitCount,
      changedFiles,
      summaryLine,
    };
    return summary;
  };

  const cleanup = async (): Promise<WorktreeCleanupResult> => {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      cachedDiffSummary = await collectDiffSummary();

      let commitSha: string | undefined;
      const statusRes = await baseSandbox
        .exec("git status --porcelain", worktreePath, 5000)
        .catch(() => null);
      const hasDirtyChanges = Boolean(
        statusRes?.success && statusRes.stdout.trim().length > 0,
      );

      if (hasDirtyChanges) {
        const addAll = await baseSandbox
          .exec("git add -A", worktreePath, 10_000)
          .catch(() => null);
        if (addAll?.success) {
          const commitRes = await baseSandbox
            .exec(
              `git -c user.name="Entry Team" -c user.email="team@entry-agents.dev" commit --no-verify -m ${shellEscape(`team(${role}): checkpoint ${shortId}`)}`,
              worktreePath,
              15_000,
            )
            .catch(() => null);
          if (commitRes?.success) {
            const shaRes = await baseSandbox
              .exec("git rev-parse --short HEAD", worktreePath, 5000)
              .catch(() => null);
            commitSha = shaRes?.success ? shaRes.stdout.trim() : undefined;
            cachedDiffSummary = await collectDiffSummary();
          }
        }
      }

      const countRes = await baseSandbox
        .exec(
          `git rev-list --count ${shellEscape(baseHead)}..${shellEscape(branchName)}`,
          baseRoot,
          5000,
        )
        .catch(() => null);
      const commitCount = countRes?.success
        ? Number.parseInt(countRes.stdout.trim(), 10) || 0
        : 0;

      if (!commitSha && commitCount > 0) {
        const shaRes = await baseSandbox
          .exec(
            `git rev-parse --short ${shellEscape(branchName)}`,
            baseRoot,
            5000,
          )
          .catch(() => null);
        commitSha = shaRes?.success ? shaRes.stdout.trim() : undefined;
      }

      let removedWorktree = false;
      const removeRes = await baseSandbox
        .exec(
          `git worktree remove --force ${shellEscape(worktreePath)}`,
          baseRoot,
          15_000,
        )
        .catch(() => null);
      if (removeRes?.success) {
        removedWorktree = true;
      } else {
        await baseSandbox
          .exec(
            `rm -rf ${shellEscape(worktreePath)} && git worktree prune`,
            baseRoot,
            10_000,
          )
          .catch(() => null);
        removedWorktree = true;
      }

      let preservedBranch = commitCount > 0;
      if (commitCount === 0) {
        await baseSandbox
          .exec(`git branch -D ${shellEscape(branchName)}`, baseRoot, 5000)
          .catch(() => null);
        preservedBranch = false;
      }

      cachedDiffSummary = {
        ...cachedDiffSummary,
        commitCount,
      };

      return {
        preservedBranch,
        removedWorktree,
        ...(commitSha ? { commitSha } : {}),
        commitCount,
      };
    })();
    return cleanupPromise;
  };

  return {
    role,
    branchName,
    worktreePath,
    scopedSandbox,
    collectDiffSummary,
    cleanup,
  };
}
