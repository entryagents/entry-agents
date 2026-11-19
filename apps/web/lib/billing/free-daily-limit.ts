import "server-only";

import { and, count, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { chatMessages, chats, sessions } from "@/lib/db/schema";

export const FREE_DAILY_MESSAGE_LIMIT = 5;
export const FREE_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isFreeDailyLimitExceeded(
  messageCount: number,
  limit: number = FREE_DAILY_MESSAGE_LIMIT,
): boolean {
  return messageCount > limit;
}

export async function countUserMessagesLast24Hours(
  userId: string,
  nowMs: number = Date.now(),
): Promise<number> {
  const cutoff = new Date(nowMs - FREE_DAILY_WINDOW_MS);
  const [row] = await db
    .select({ total: count() })
    .from(chatMessages)
    .innerJoin(chats, eq(chatMessages.chatId, chats.id))
    .innerJoin(sessions, eq(chats.sessionId, sessions.id))
    .where(
      and(
        eq(sessions.userId, userId),
        eq(chatMessages.role, "user"),
        gte(chatMessages.createdAt, cutoff),
      ),
    );

  return Number(row?.total ?? 0);
}
