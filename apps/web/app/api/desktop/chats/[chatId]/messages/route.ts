import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import {
  createChatMessageIfNotExists,
  getChatById,
  getChatMessages,
  touchChat,
} from "@/lib/db/sessions";
import { requireDesktopUser, unauthorized } from "@/lib/desktop/auth";

export const runtime = "nodejs";

interface AppendMessageBody {
  messageId: string;
  role: "user" | "assistant";
  parts: unknown;
}

function toStoredMessage(body: AppendMessageBody): unknown {
  const p = body.parts;
  if (Array.isArray(p)) {
    return {
      id: body.messageId,
      role: body.role,
      parts: p,
    };
  }
  return p;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const user = await requireDesktopUser(req);
  if (!user) {
    return unauthorized();
  }
  const { chatId } = await params;

  let body: AppendMessageBody;
  try {
    body = (await req.json()) as AppendMessageBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (
    !body.messageId ||
    (body.role !== "user" && body.role !== "assistant") ||
    typeof body.parts !== "object" ||
    body.parts === null
  ) {
    return NextResponse.json(
      { error: "messageId, role (user|assistant), parts required" },
      { status: 400 },
    );
  }
  const partsForValidation = Array.isArray(body.parts)
    ? body.parts
    : ((body.parts as { parts?: unknown }).parts ?? []);
  if (
    !Array.isArray(partsForValidation) ||
    !partsForValidation.every(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as { type?: unknown }).type === "string",
    )
  ) {
    return NextResponse.json(
      { error: "messageId, role (user|assistant), parts[] required" },
      { status: 400 },
    );
  }

  const chat = await getChatById(chatId);
  if (!chat) {
    return NextResponse.json({ error: "Not found" }, { status: 403 });
  }
  const session = chat.sessionId
    ? await db.query.sessions.findFirst({
        where: eq(sessions.id, chat.sessionId),
      })
    : undefined;
  if (
    !session ||
    session.userId !== user.id ||
    !session.id.startsWith("desktop-")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const message = await createChatMessageIfNotExists({
    id: body.messageId,
    chatId,
    role: body.role,
    parts: toStoredMessage(body),
  } as never);
  await touchChat(chatId);

  return NextResponse.json({ message: message ?? null });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const user = await requireDesktopUser(req);
  if (!user) {
    return unauthorized();
  }
  const { chatId } = await params;
  try {
    const chat = await getChatById(chatId);
    if (!chat) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const session = chat.sessionId
      ? await db.query.sessions.findFirst({
          where: eq(sessions.id, chat.sessionId),
        })
      : undefined;
    if (
      !session ||
      session.userId !== user.id ||
      !session.id.startsWith("desktop-")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const messages = await getChatMessages(chatId);
    return NextResponse.json({ messages });
  } catch (error) {
    console.error("GET /api/desktop/chats/:id/messages failed:", error);
    return NextResponse.json(
      { error: "Failed to list messages" },
      { status: 500 },
    );
  }
}
