import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { getChatById, getChatMessages } from "@/lib/db/sessions";
import { requireDesktopUser, unauthorized } from "@/lib/desktop/auth";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const user = await requireDesktopUser(req);
  if (!user) {
    return unauthorized();
  }
  const { chatId } = await params;

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

  const messages = await getChatMessages(chatId);
  return NextResponse.json({ chat, messages });
}
