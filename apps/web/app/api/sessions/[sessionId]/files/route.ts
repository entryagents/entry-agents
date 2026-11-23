import { connectSandbox } from "@entry-agents/sandbox";
import {
  requireAuthenticatedUser,
  requireOwnedSessionWithSandboxGuard,
} from "@/app/api/sessions/_lib/session-context";
import { updateSession } from "@/lib/db/sessions";
import { buildHibernatedLifecycleUpdate } from "@/lib/sandbox/lifecycle";
import {
  clearUnavailableSandboxState,
  hasRuntimeSandboxState,
  isSandboxUnavailableError,
} from "@/lib/sandbox/utils";

export type FileSuggestion = {
  value: string;
  display: string;
  isDirectory: boolean;
  kind?: "file" | "agent" | "team";
  description?: string;
};

export type FilesResponse = {
  files: FileSuggestion[];
};

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

const MAX_FILE_SUGGESTIONS = 5000;

function getPathDepth(suggestion: FileSuggestion): number {
  const normalizedPath = suggestion.isDirectory
    ? suggestion.value.slice(0, -1)
    : suggestion.value;
  return normalizedPath ? normalizedPath.split("/").length : 0;
}

/**
 * Parse git ls-files output and extract files and directories
 */
function parseGitFiles(output: string): FileSuggestion[] {
  const results: FileSuggestion[] = [];
  const seenDirs = new Set<string>();

  const files = output.trim().split("\n").filter(Boolean);

  for (const file of files) {
    // Add parent directories
    const parts = file.split("/");
    let dirPath = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;
      dirPath = dirPath ? `${dirPath}/${part}` : part;
      if (!seenDirs.has(dirPath)) {
        seenDirs.add(dirPath);
        results.push({
          value: `${dirPath}/`,
          display: `${dirPath}/`,
          isDirectory: true,
        });
      }
    }

    // Add the file
    results.push({
      value: file,
      display: file,
      isDirectory: false,
    });
  }

  // Keep top-level paths first so files like README.md are always surfaced.
  results.sort((a, b) => {
    const depthDiff = getPathDepth(a) - getPathDepth(b);
    if (depthDiff !== 0) return depthDiff;
    return a.display.localeCompare(b.display);
  });

  return results;
}

export async function GET(_req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId } = await context.params;

  const sessionContext = await requireOwnedSessionWithSandboxGuard({
    userId: authResult.userId,
    sessionId,
    sandboxGuard: hasRuntimeSandboxState,
    sandboxErrorMessage: "Sandbox not initialized",
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  const { sessionRecord } = sessionContext;
  const sandboxState = sessionRecord.sandboxState;
  if (!sandboxState) {
    return Response.json({ error: "Sandbox not initialized" }, { status: 400 });
  }

  try {
    const sandbox = await connectSandbox(sandboxState);
    const cwd = sandbox.workingDirectory;

    // Single git ls-files invocation returns both tracked and untracked files
    // in one sandbox RPC round-trip instead of two sequential execs.
    const filesResult = await sandbox.exec(
      "git ls-files --cached --others --exclude-standard",
      cwd,
      30000,
    );

    if (!filesResult.success) {
      const stderr = filesResult.stderr ?? "";
      if (isSandboxUnavailableError(stderr)) {
        await updateSession(sessionId, {
          sandboxState: clearUnavailableSandboxState(
            sessionRecord.sandboxState,
            stderr,
          ),
          ...buildHibernatedLifecycleUpdate(),
        });
        return Response.json(
          { error: "Sandbox is unavailable. Please resume sandbox." },
          { status: 409 },
        );
      }
      console.error("Git ls-files failed:", filesResult.stderr);
      return Response.json(
        { error: "Failed to list files. Ensure this is a git repository." },
        { status: 400 },
      );
    }

    const files = parseGitFiles(filesResult.stdout);

    // Keep a high upper bound to avoid huge payloads on very large repos.
    const limitedFiles = files.slice(0, MAX_FILE_SUGGESTIONS);

    const response: FilesResponse = {
      files: limitedFiles,
    };

    return Response.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isSandboxUnavailableError(message)) {
      await updateSession(sessionId, {
        sandboxState: clearUnavailableSandboxState(
          sessionRecord.sandboxState,
          message,
        ),
        ...buildHibernatedLifecycleUpdate(),
      });
      return Response.json(
        { error: "Sandbox is unavailable. Please resume sandbox." },
        { status: 409 },
      );
    }
    console.error("Failed to list files:", error);
    return Response.json(
      { error: "Failed to connect to sandbox" },
      { status: 500 },
    );
  }
}
