import { connectSandbox } from "@entry-agents/sandbox";
import { generateText } from "ai";
import { gateway } from "@entry-agents/agent";
import { APP_DEFAULT_MODEL_ID } from "@/lib/models";
import { checkBotProtection } from "@/lib/botid";
import { getSessionById } from "@/lib/db/sessions";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isSandboxActive } from "@/lib/sandbox/utils";
import { getServerSession } from "@/lib/session/get-server-session";

export const maxDuration = 30;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  const limited = await checkRateLimit({
    key: rateLimitKey(["generate-commit-message", session.user.id]),
    limit: 10,
    windowMs: 60_000,
  });
  if (limited) {
    return limited;
  }

  const { sessionId } = await params;
  const dbSession = await getSessionById(sessionId);
  if (!dbSession || dbSession.userId !== session.user.id) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  if (!isSandboxActive(dbSession.sandboxState)) {
    return Response.json({ error: "No active sandbox" }, { status: 400 });
  }

  const sandbox = await connectSandbox(dbSession.sandboxState);
  const cwd = sandbox.workingDirectory;

  // Get the diff for commit message generation
  const diffResult = await sandbox.exec(
    "git diff HEAD --stat && echo '---DIFF---' && git diff HEAD",
    cwd,
    30000,
  );

  const diff = diffResult.stdout;
  if (!diff.trim() || !diff.includes("---DIFF---")) {
    return Response.json({ message: "chore: update repository changes" });
  }

  const result = await generateText({
    model: gateway(APP_DEFAULT_MODEL_ID),
    prompt: `Generate a professional git commit message for these changes adhering to conventional commit format (e.g., "feat: ...", "fix: ...", "refactor: ...").
Format your output as:
Line 1: Concise commit subject line (max 72 chars)
Line 2: Blank line
Line 3+: Bulleted summary of key changes made (1-4 concise bullets)

Session context: ${dbSession.title}

Diff:
${diff.slice(0, 10000)}

Respond ONLY with the formatted commit message. Do not wrap in markdown quotes or code blocks.`,
  });

  const raw = result.text
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "");
  const lines = raw.split("\n");
  const title =
    lines[0]?.trim().slice(0, 72) || "chore: update repository changes";
  const body = lines.slice(1).join("\n").trim();
  const message = body ? `${title}\n\n${body}` : title;

  return Response.json({ message, title, body });
}
