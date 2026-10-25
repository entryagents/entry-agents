import { connectSandbox } from "@entry-agents/sandbox";
import {
  requireAuthenticatedUser,
  requireOwnedSessionWithSandboxGuard,
} from "@/app/api/sessions/_lib/session-context";
import { hasRuntimeSandboxState } from "@/lib/sandbox/utils";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

export type TerminalExecRequest = {
  command: string;
  cwd?: string;
};

export type TerminalExecResponse = {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  cwd: string;
  truncated: boolean;
};

export async function POST(req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawCommand =
    typeof (body as Record<string, unknown>)?.command === "string"
      ? ((body as Record<string, unknown>).command as string).trim()
      : "";
  if (!rawCommand) {
    return Response.json({ error: "Command cannot be empty" }, { status: 400 });
  }

  const sessionContext = await requireOwnedSessionWithSandboxGuard({
    userId: authResult.userId,
    sessionId,
    sandboxGuard: hasRuntimeSandboxState,
    sandboxErrorMessage: "Sandbox is not running",
  });
  if (!sessionContext.ok) {
    return sessionContext.response;
  }

  const { sessionRecord } = sessionContext;
  if (!sessionRecord.sandboxState) {
    return Response.json({ error: "Sandbox state missing" }, { status: 400 });
  }

  try {
    const sandbox = await connectSandbox(sessionRecord.sandboxState);
    const rawCwd = (body as Record<string, unknown>)?.cwd;
    const targetCwd =
      typeof rawCwd === "string" && rawCwd.trim().length > 0
        ? rawCwd.trim()
        : sandbox.workingDirectory;

    const result = await sandbox.exec(rawCommand, targetCwd, 60_000);

    return Response.json({
      success: result.success,
      exitCode: result.exitCode,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      cwd: targetCwd,
      truncated: Boolean(result.truncated),
    } satisfies TerminalExecResponse);
  } catch (error) {
    console.error("Failed to execute terminal command:", error);
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to execute command",
      },
      { status: 500 },
    );
  }
}
