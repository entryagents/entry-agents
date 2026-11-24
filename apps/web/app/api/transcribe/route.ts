import { checkBotProtection } from "@/lib/botid";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerSession } from "@/lib/session/get-server-session";

interface TranscribeRequestBody {
  audio: string; // base64-encoded audio data
  mimeType?: string; // e.g., "audio/webm"
}

interface DeepgramListenResponse {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
      }>;
    }>;
  };
}

const DEEPGRAM_LISTEN_URL =
  "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&punctuate=true&language=en";

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
    key: rateLimitKey(["transcribe", session.user.id]),
    limit: 5,
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

  let body: TranscribeRequestBody;
  try {
    body = (await req.json()) as TranscribeRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { audio, mimeType } = body;

  if (!audio || typeof audio !== "string") {
    return Response.json(
      { error: "Missing required field: audio" },
      { status: 400 },
    );
  }

  // Limit audio size to ~7.5MB of raw audio (10MB base64)
  const maxBase64Length = 10 * 1024 * 1024;
  if (audio.length > maxBase64Length) {
    return Response.json(
      { error: "Audio file too large. Maximum size is approximately 7.5MB." },
      { status: 413 },
    );
  }

  const base64Payload = audio.includes(",")
    ? (audio.split(",")[1] ?? "")
    : audio;
  const audioBuffer = Buffer.from(base64Payload, "base64");
  const contentType =
    typeof mimeType === "string" && mimeType.trim().length > 0
      ? mimeType.split(";")[0]?.trim() || "audio/webm"
      : "audio/webm";

  try {
    const response = await fetch(DEEPGRAM_LISTEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": contentType,
      },
      body: audioBuffer,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      console.error(
        `Deepgram transcription failed (${response.status}):`,
        errorBody.slice(0, 500),
      );
      return Response.json({ error: "Transcription failed" }, { status: 502 });
    }

    const data = (await response.json()) as DeepgramListenResponse;
    const text =
      data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";

    return Response.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Transcription failed:", message);
    return Response.json({ error: "Transcription failed" }, { status: 500 });
  }
}
