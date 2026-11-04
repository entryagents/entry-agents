import { and, desc, eq, like } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { chats, sessions } from "@/lib/db/schema";
import { createChat, getChatById } from "@/lib/db/sessions";
import { requireDesktopUser, unauthorized } from "@/lib/desktop/auth";

export const runtime = "nodejs";

interface CreateChatBody {
  chatId?: string;
  sessionId?: string;
  title?: string;
  modelId?: string;
  reasoningEffort?: string;
  desktop?: boolean;
}

async function ensureDesktopAgentSession(
  userId: string,
  title: string,
  chatId?: string,
) {
  const id =
    chatId && chatId.startsWith("desktop-")
      ? chatId
      : chatId
        ? `desktop-${chatId}`
        : `desktop-${crypto.randomUUID()}`;
  const existing = await db.query.sessions.findFirst({
    where: eq(sessions.id, id),
  });
  if (existing) {
    if (existing.userId !== userId) {
      return null;
    }
    return id;
  }
  await db.insert(sessions).values({
    id,
    userId,
    title: title.slice(0, 80) || "Desktop chat",
    status: "completed",
  });
  return id;
}

export async function POST(req: NextRequest) {
  const user = await requireDesktopUser(req);
  if (!user) {
    return unauthorized();
  }

  let body: CreateChatBody;
  try {
    body = (await req.json()) as CreateChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.chatId) {
    return NextResponse.json({ error: "chatId required" }, { status: 400 });
  }

  let sessionId = body.sessionId;
  if (sessionId) {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });
    if (!session || session.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (body.desktop) {
    const provisioned = await ensureDesktopAgentSession(
      user.id,
      body.title ?? "Desktop chat",
      body.chatId,
    );
    if (!provisioned) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    sessionId = provisioned;
  } else {
    return NextResponse.json(
      { error: "chatId and sessionId required" },
      { status: 400 },
    );
  }

  const existing = await getChatById(body.chatId);
  if (existing) {
    if (existing.sessionId !== sessionId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ chat: existing });
  }

  const chat = await createChat({
    id: body.chatId,
    sessionId,
    title: body.title ?? "Desktop chat",
    modelId: body.modelId ?? null,
    reasoningEffort: body.reasoningEffort ?? null,
    status: "idle",
  });

  return NextResponse.json({ chat });
}

export async function GET(req: NextRequest) {
  const user = await requireDesktopUser(req);
  if (!user) {
    return unauthorized();
  }
  try {
    const rows = await db
      .select({
        id: chats.id,
        title: chats.title,
        createdAt: chats.createdAt,
        updatedAt: chats.updatedAt,
        modelId: chats.modelId,
        sessionId: chats.sessionId,
      })
      .from(chats)
      .innerJoin(sessions, eq(chats.sessionId, sessions.id))
      .where(and(eq(sessions.userId, user.id), like(sessions.id, "desktop-%")))
      .orderBy(desc(chats.updatedAt))
      .limit(200);
    return NextResponse.json({ chats: rows });
  } catch (error) {
    console.error("GET /api/desktop/chats failed:", error);
    return NextResponse.json(
      { error: "Failed to list chats" },
      { status: 500 },
    );
  }
}
