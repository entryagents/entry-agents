import { checkBotProtection } from "@/lib/botid";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerSession } from "@/lib/session/get-server-session";

interface DeepgramGrantResponse {
  access_token?: string;
  expires_in?: number;
}

const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";

/**
 * Mints a short-lived (60s) Deepgram JWT for browser-side real-time WebSocket
 * streaming (`wss://api.deepgram.com/v1/listen`) so the long-lived
 * `DEEPGRAM_API_KEY` never leaves the server.
 *
 * If the configured API key lacks the Member role required by `/v1/auth/grant`,
 * returns `{ fallback: true }` so the client seamlessly falls back to batch
 * transcription via `/api/transcribe`.
 */
export async function POST() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  const limited = await checkRateLimit({
    key: rateLimitKey(["transcribe-token", session.user.id]),
    limit: 15,
    windowMs: 60_000,
  });
  if (limited) {
    return limited;
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Transcription service not configured" },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(DEEPGRAM_GRANT_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });

    if (response.status === 403) {
      return Response.json({ fallback: true });
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(
        `Deepgram token grant failed (${response.status}):`,
        errorBody.slice(0, 500),
      );
      return Response.json({ fallback: true });
    }

    const data = (await response.json()) as DeepgramGrantResponse;
    if (!data.access_token) {
      return Response.json({ fallback: true });
    }

    return Response.json({
      token: data.access_token,
      scheme: "bearer",
      expiresIn: data.expires_in ?? 60,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Deepgram token grant failed:", message);
    return Response.json({ fallback: true });
  }
}
