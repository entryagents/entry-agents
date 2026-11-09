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
 * This used to be `useState` in session-chat-content.tsx, reset by an
 * effect keyed on chatInfo.id -- so switching chats or reloading threw
 * away anything the user typed during a long turn, and no second device
 * could ever see it. A viewer should not own that state.
 *
 * The queue is stored on the chat row, drained by the viewer when the
 * chat goes idle (see the drain effect in session-chat-content.tsx).
 * Draining is still client-initiated: sending a message must start a run,
 * and only /api/chat does that.
 */

const MAX_QUEUED_PROMPTS = 20;
const MAX_TEXT_LENGTH = 8_000;

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

/**
 * Runs `mutate` against the chat's queued_prompts under a row lock.
 *
 * The queue is a jsonb column, so every mutation is a read-modify-write
 * of the whole list. Without a lock, two concurrent POSTs (or a POST
 * racing the workflow's dequeue step) read the same snapshot and the
 * last write wins -- losing messages or double-executing a drained
 * prompt. SELECT ... FOR UPDATE plus the write in the SAME transaction
 * serializes against the dequeue step's own FOR UPDATE read (see
 * dequeueNextQueuedUserMessageStep in chat-post-finish.ts).
 */
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

  const outcome = await withQueuedPrompts(auth.chatId, (queued) => {
    if (queued.length >= MAX_QUEUED_PROMPTS) {
      // Writing the unchanged list back is a no-op on the row; the full
      // check must happen under the lock or concurrent POSTs overflow it.
      return { next: queued, result: { full: true as const, queued } };
    }

    const prompt: QueuedPrompt = {
      id:
        typeof body.id === "string" && body.id ? body.id : crypto.randomUUID(),
      text,
      payload: body.payload,
      modelId: typeof body.modelId === "string" ? body.modelId : null,
      createdAt: new Date().toISOString(),
    };

    // Idempotent on id: the composer may retry after a flaky connection,
    // and a duplicate would send the message twice later.
    const next = queued.some((item) => item.id === prompt.id)
      ? queued
      : [...queued, prompt];

    return { next, result: { full: false as const, queued: next } };
  });

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

  // Full-list writes make edits and drag reordering durable across reloads
  // and devices instead of leaving the server row with stale ordering.
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
