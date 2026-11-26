import { and, count, eq, gte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { chatDiagnosticEvents } from "@/lib/db/schema";
import { getServerSession } from "@/lib/session/get-server-session";

export const dynamic = "force-dynamic";

const MAX_EVENTS_PER_CHAT_WINDOW = 20;
const WINDOW_MS = 5 * 60 * 1000;

const diagnosticEventSchema = z.object({
  eventType: z.enum([
    "stream-divergence",
    "stream-reconnect",
    "message-rollback",
    "snapshot-reconcile",
    "stream-error",
  ]),
  workflowRunId: z.string().max(128).optional().nullable(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ sessionId: string; chatId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, chatId } = await context.params;
  if (!sessionId || !chatId) {
    return NextResponse.json(
      { error: "sessionId and chatId are required" },
      { status: 400 },
    );
  }

  let parsed: z.infer<typeof diagnosticEventSchema>;
  try {
    const body = await req.json();
    parsed = diagnosticEventSchema.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    // Hard cap per chat per 5-minute window so anomaly logging never floods Postgres.
    const since = new Date(Date.now() - WINDOW_MS);
    const existing = await db
      .select({ total: count() })
      .from(chatDiagnosticEvents)
      .where(
        and(
          eq(chatDiagnosticEvents.chatId, chatId),
          gte(chatDiagnosticEvents.createdAt, since),
        ),
      );

    if (Number(existing[0]?.total ?? 0) >= MAX_EVENTS_PER_CHAT_WINDOW) {
      return NextResponse.json({ ok: true, dropped: "rate-capped" });
    }

    await db.insert(chatDiagnosticEvents).values({
      id: crypto.randomUUID(),
      chatId,
      sessionId,
      workflowRunId: parsed.workflowRunId ?? null,
      userId: session.user.id,
      eventType: parsed.eventType,
      detailsJson: parsed.details ?? {},
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[chat/diagnostics] Failed to record event:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
