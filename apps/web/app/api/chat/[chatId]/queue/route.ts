import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chats } from "@/lib/db/schema";
import {
  requireAuthenticatedUser,
  requireOwnedChatById,
} from "@/app/api/chat/_lib/chat-context";

/**
 * Server-backed composer queue.
 *
 * The queue is stored on the chat row, drained server-side at the end of a
 * workflow turn (or by the client when idle), so switching chats, reloading,
 * or closing the tab preserves queued prompts cleanly.
 */

const MAX_QUEUED_PROMPTS = 20;
const MAX_TEXT_LENGTH = 8_000;

/** Result of the POST enqueue — the full flag must be read under the lock. */
type QueuePostOutcome = {
  full: boolean;
  queued: QueuedPrompt[];
};

type QueuedPrompt = {
  id: string;
  text: string;
  /**
   * The composer's full message payload, not just its text. The queue
   * has to be re-sendable after a reload or on another device, and the
   * composer payload (attachments, model choice, structured content) is
   * what /api/chat actually accepts -- text alone cannot be replayed.
   */
  payload: unknown;
  modelId?: string | null;
  reasoningEffort?: string | null;
  createdAt: string;
};

type RouteContext = { params: Promise<{ chatId: string }> };

function normalize(value: unknown): QueuedPrompt[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is QueuedPrompt =>
      !!item &&
      typeof item === "object" &&
      typeof (item as QueuedPrompt).id === "string" &&
      typeof (item as QueuedPrompt).text === "string" &&
      !!(item as QueuedPrompt).payload &&
      typeof (item as QueuedPrompt).payload === "object",
  );
}

function parseQueuedList(value: unknown): QueuedPrompt[] | null {
  if (!Array.isArray(value) || value.length > MAX_QUEUED_PROMPTS) return null;
  const normalized = normalize(value);
  if (normalized.length !== value.length) return null;
  if (normalized.some((item) => item.text.length > MAX_TEXT_LENGTH))
    return null;
  return normalized;
}

async function readQueue(chatId: string): Promise<QueuedPrompt[]> {
  const rows = await db
    .select({ queuedPrompts: chats.queuedPrompts })
    .from(chats)
    .where(eq(chats.id, chatId))
    .limit(1);
  return normalize(rows[0]?.queuedPrompts);
}

async function withQueuedPrompts<T>(
  chatId: string,
  mutate: (queue: QueuedPrompt[]) => { next: QueuedPrompt[]; result: T },
): Promise<T> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ queuedPrompts: chats.queuedPrompts })
      .from(chats)
      .where(eq(chats.id, chatId))
      .limit(1)
      .for("update");

    const { next, result } = mutate(normalize(rows[0]?.queuedPrompts));

    await tx
      .update(chats)
      .set({ queuedPrompts: next.length > 0 ? next : null })
      .where(eq(chats.id, chatId));

    return result;
  });
}

async function authorize(
  context: RouteContext,
): Promise<{ ok: true; chatId: string } | { ok: false; response: Response }> {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return { ok: false, response: authResult.response };
  }

  const { chatId } = await context.params;
  const chatContext = await requireOwnedChatById({
    chatId,
    userId: authResult.userId,
  });
  if (!chatContext.ok) {
    return { ok: false, response: chatContext.response };
  }

  return { ok: true, chatId };
}

export async function GET(_req: Request, context: RouteContext) {
  const auth = await authorize(context);
  if (!auth.ok) return auth.response;

  return Response.json({ queued: await readQueue(auth.chatId) });
}

export async function POST(req: Request, context: RouteContext) {
  const auth = await authorize(context);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    text?: unknown;
    payload?: unknown;
    modelId?: unknown;
    reasoningEffort?: unknown;
    id?: unknown;
  };

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json({ error: "text is required" }, { status: 400 });
  }
  if (!body.payload || typeof body.payload !== "object") {
    return Response.json(
      { error: "payload is required -- a queued message must be re-sendable" },
      { status: 400 },
    );
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      { error: `Queued messages are capped at ${MAX_TEXT_LENGTH} characters` },
      { status: 400 },
    );
  }

  // Enforce maximum 5 attachments per queued message
  const payloadObj = body.payload as Record<string, unknown>;
  const payloadFiles = Array.isArray(payloadObj.files) ? payloadObj.files : [];
  const payloadParts = Array.isArray(payloadObj.parts) ? payloadObj.parts : [];
  const partAttachments = payloadParts.filter(
    (p) =>
      typeof p === "object" &&
      p !== null &&
      "type" in p &&
      ((p as { type: string }).type === "file" ||
        (p as { type: string }).type === "image" ||
        (p as { type: string }).type === "data-snippet"),
  );
  if (payloadFiles.length + partAttachments.length > 5) {
    return Response.json(
      { error: "Maximum 5 attachments allowed per message" },
      { status: 400 },
    );
  }

  const outcome = await withQueuedPrompts(
    auth.chatId,
    (queued): { next: QueuedPrompt[]; result: QueuePostOutcome } => {
      if (queued.length >= MAX_QUEUED_PROMPTS) {
        return { next: queued, result: { full: true, queued } };
      }

      const prompt: QueuedPrompt = {
        id:
          typeof body.id === "string" && body.id
            ? body.id
            : crypto.randomUUID(),
        text,
        payload: body.payload,
        modelId: typeof body.modelId === "string" ? body.modelId : null,
        reasoningEffort:
          typeof body.reasoningEffort === "string" && body.reasoningEffort
            ? body.reasoningEffort
            : null,
        createdAt: new Date().toISOString(),
      };

      const next = queued.some((item) => item.id === prompt.id)
        ? queued
        : [...queued, prompt];

      return { next, result: { full: false, queued: next } };
    },
  );

  if (outcome.full) {
    return Response.json(
      { error: `Queue is full (${MAX_QUEUED_PROMPTS} messages)` },
      { status: 409 },
    );
  }

  return Response.json({ queued: outcome.queued });
}

export async function PUT(req: Request, context: RouteContext) {
  const auth = await authorize(context);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as { queued?: unknown };
  const queued = parseQueuedList(body.queued);
  if (!queued) {
    return Response.json(
      { error: "queued must be a valid list of at most 20 messages" },
      { status: 400 },
    );
  }

  const queuedAfterWrite = await withQueuedPrompts(auth.chatId, () => ({
    next: queued,
    result: queued,
  }));

  return Response.json({ queued: queuedAfterWrite });
}

export async function DELETE(req: Request, context: RouteContext) {
  const auth = await authorize(context);
  if (!auth.ok) return auth.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const queued = await withQueuedPrompts(auth.chatId, (current) => {
    const next = current.filter((item) => item.id !== id);
    return { next, result: next };
  });

  return Response.json({ queued });
}

export const dynamic = "force-dynamic";
