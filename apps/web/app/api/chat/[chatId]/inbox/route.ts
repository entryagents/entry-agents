import { z } from "zod";
import {
  requireAuthenticatedUser,
  requireOwnedChatById,
} from "@/app/api/chat/_lib/chat-context";
import { enqueueInboxMessage, listInboxMessages } from "@/lib/db/inbox";

type RouteContext = { params: Promise<{ chatId: string }> };

const postInboxSchema = z.object({
  content: z.string().trim().min(1).max(8_000),
});

async function authorize(
  context: RouteContext,
): Promise<
  | { ok: true; chatId: string; userId: string }
  | { ok: false; response: Response }
> {
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

  return { ok: true, chatId, userId: authResult.userId };
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await authorize(context);
  if (!auth.ok) return auth.response;

  const rows = await listInboxMessages(auth.chatId);
  const unreadCount = rows.filter((r) => r.status === "unread").length;

  return Response.json({
    unreadCount,
    totalCount: rows.length,
    messages: rows.map((row, idx) => ({
      id: row.id,
      sequence: idx + 1,
      content: row.content,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt ? row.readAt.toISOString() : null,
    })),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await authorize(context);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postInboxSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Inbox message content is required (1-8000 chars)" },
      { status: 400 },
    );
  }

  const created = await enqueueInboxMessage({
    chatId: auth.chatId,
    userId: auth.userId,
    content: parsed.data.content,
  });

  const rows = await listInboxMessages(auth.chatId);
  const unreadCount = rows.filter((r) => r.status === "unread").length;

  return Response.json(
    {
      message: {
        id: created.id,
        content: created.content,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      },
      unreadCount,
      totalCount: rows.length,
    },
    { status: 201 },
  );
}
