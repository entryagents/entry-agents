import crypto from "node:crypto";
import { asc, eq, and, inArray } from "drizzle-orm";
import { db } from "./client";
import { chatSteeringInbox, type ChatSteeringInboxRow } from "./schema";

export async function enqueueInboxMessage(params: {
  chatId: string;
  userId: string;
  content: string;
}): Promise<ChatSteeringInboxRow> {
  const id = `inbox_${crypto.randomUUID()}`;
  const [row] = await db
    .insert(chatSteeringInbox)
    .values({
      id,
      chatId: params.chatId,
      userId: params.userId,
      content: params.content,
      status: "unread",
    })
    .returning();
  return row;
}

export async function listInboxMessages(
  chatId: string,
): Promise<ChatSteeringInboxRow[]> {
  return db
    .select()
    .from(chatSteeringInbox)
    .where(eq(chatSteeringInbox.chatId, chatId))
    .orderBy(asc(chatSteeringInbox.createdAt));
}

export async function getUnreadInboxMessages(
  chatId: string,
): Promise<ChatSteeringInboxRow[]> {
  return db
    .select()
    .from(chatSteeringInbox)
    .where(
      and(
        eq(chatSteeringInbox.chatId, chatId),
        eq(chatSteeringInbox.status, "unread"),
      ),
    )
    .orderBy(asc(chatSteeringInbox.createdAt));
}

export async function markInboxMessagesRead(
  chatId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const updated = await db
    .update(chatSteeringInbox)
    .set({
      status: "read",
      readAt: new Date(),
    })
    .where(
      and(
        eq(chatSteeringInbox.chatId, chatId),
        eq(chatSteeringInbox.status, "unread"),
        inArray(chatSteeringInbox.id, ids),
      ),
    )
    .returning({ id: chatSteeringInbox.id });
  return updated.length;
}
