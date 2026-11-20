import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { WebAgentUIMessage } from "@/app/types";
import { db } from "@/lib/db/client";
import { chatMessages, chats, sessions } from "@/lib/db/schema";
import { getServerSession } from "@/lib/session/get-server-session";
import {
  extractTriagePromptsFromMessages,
  type TriagePrompt,
} from "@/lib/triage/deck";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const recentChats = await db
    .select({
      chatId: chats.id,
      sessionId: sessions.id,
      sessionTitle: sessions.title,
    })
    .from(chats)
    .innerJoin(sessions, eq(chats.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.userId, session.user.id),
        ne(sessions.status, "archived"),
      ),
    )
    .orderBy(desc(chats.updatedAt))
    .limit(20);

  if (recentChats.length === 0) {
    return NextResponse.json({ prompts: [] });
  }

  const chatIds = recentChats.map((c) => c.chatId);
  const rows = await db
    .select({
      id: chatMessages.id,
      chatId: chatMessages.chatId,
      role: chatMessages.role,
      parts: chatMessages.parts,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(
      and(
        inArray(chatMessages.chatId, chatIds),
        eq(chatMessages.role, "assistant"),
      ),
    )
    .orderBy(desc(chatMessages.createdAt));

  // Only inspect the most recent assistant message per chat.
  const latestByChat = new Map<string, WebAgentUIMessage>();
  for (const row of rows) {
    if (latestByChat.has(row.chatId)) continue;
    latestByChat.set(row.chatId, {
      id: row.id,
      role: "assistant",
      parts: Array.isArray(row.parts)
        ? (row.parts as WebAgentUIMessage["parts"])
        : [],
    });
  }

  const prompts: TriagePrompt[] = [];
  for (const c of recentChats) {
    const msg = latestByChat.get(c.chatId);
    if (!msg) continue;
    prompts.push(
      ...extractTriagePromptsFromMessages([msg], {
        sessionId: c.sessionId,
        chatId: c.chatId,
        sessionTitle: c.sessionTitle,
      }),
    );
  }

  return NextResponse.json({ prompts });
}
