import { checkBotProtection } from "@/lib/botid";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerSession } from "@/lib/session/get-server-session";

interface TtsRequestBody {
  text: string;
}

const DEEPGRAM_SPEAK_URL =
  "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=mp3";

const MAX_TTS_TEXT_LENGTH = 2000;

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
    key: rateLimitKey(["tts", session.user.id]),
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) {
    return limited;
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Text-to-speech service not configured" },
      { status: 503 },
    );
  }

  let body: TtsRequestBody;
  try {
    body = (await req.json()) as TtsRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json(
      { error: "Missing required field: text" },
      { status: 400 },
    );
  }

  if (text.length > MAX_TTS_TEXT_LENGTH) {
    return Response.json(
      {
        error: `Text too long. Maximum length is ${MAX_TTS_TEXT_LENGTH} characters.`,
      },
      { status: 413 },
    );
  }

  try {
    const upstream = await fetch(DEEPGRAM_SPEAK_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!upstream.ok || !upstream.body) {
      const errorBody = await upstream.text().catch(() => "");
      console.error(
        `Deepgram TTS failed (${upstream.status}):`,
        errorBody.slice(0, 500),
      );
      return Response.json({ error: "Text-to-speech failed" }, { status: 502 });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("TTS failed:", message);
    return Response.json({ error: "Text-to-speech failed" }, { status: 500 });
  }
}
