import { checkBotProtection } from "@/lib/botid";
import { generateText } from "ai";
import { gateway } from "@entry-agents/agent";
import { z } from "zod";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerSession } from "@/lib/session/get-server-session";
import { getTitleModelId } from "@/lib/db/platform-settings";
import { sanitizePromptToTitle } from "@/lib/random-city";

const FALLBACK_TITLE_MODEL_ID = "step-5-preview";
const TITLE_GENERATION_TIMEOUT_MS = 12_000;

/**
 * Generates a short, descriptive session title from a user message using AI.
 * If AI generation fails, times out, or rate limits, falls back to a clean
 * technical prompt extraction so sessions never get stuck with generic or empty names.
 */
export async function generateSessionTitle(
  message: string,
): Promise<string | null> {
  const trimmed = message.trim().slice(0, 2000);
  if (trimmed.length === 0) return null;

  try {
    const configuredTitleModel = await getTitleModelId();
    const titleModelId = configuredTitleModel ?? FALLBACK_TITLE_MODEL_ID;

    const result = await generateText({
      model: gateway(titleModelId),
      abortSignal: AbortSignal.timeout(TITLE_GENERATION_TIMEOUT_MS),
      prompt: `You are a developer tool that names coding sessions. Generate a concise, highly technical session title (max 5 words) for a coding session based on the user's first message below. Use an Action + Subject format (e.g., "Add User Authentication", "Fix CSS Layout", "Refactor Workspace Tabs"). Do NOT use quotes, brackets, or trailing punctuation. Respond with ONLY the title, nothing else.

User message:
${trimmed}`,
    });

    const title = result.text.trim().split("\n")[0]?.trim();
    if (title && title.length > 0) {
      const cleanTitle = title
        .slice(0, 60)
        .replace(/^["'`]|["'`]$/g, "")
        .replace(/[.?!,:;]+$/, "")
        .trim();
      if (cleanTitle.length > 0) {
        return cleanTitle;
      }
    }
    return sanitizePromptToTitle(trimmed);
  } catch (error) {
    console.warn(
      "[generate-title] Model title generation failed, using clean prompt fallback:",
      error,
    );
    return sanitizePromptToTitle(trimmed);
  }
}

const generateTitleRequestSchema = z.object({
  message: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  const limited = await checkRateLimit({
    key: rateLimitKey(["generate-title", session.user.id]),
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) {
    // If rate-limited on the endpoint, still return a clean sanitized title
    // instead of failing with 429
    let body: { message?: string } | null = null;
    try {
      body = (await req.json()) as { message?: string };
    } catch {
      /* ignore */
    }
    const fallbackTitle = body?.message
      ? sanitizePromptToTitle(body.message)
      : "New Session";
    return Response.json({ title: fallbackTitle });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsedBody = generateTitleRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return Response.json(
      { error: "Missing required field: message" },
      { status: 400 },
    );
  }

  const { message } = parsedBody.data;

  const title =
    (await generateSessionTitle(message)) ?? sanitizePromptToTitle(message);

  return Response.json({ title });
}
