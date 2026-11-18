import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./client";
import { compactionCheckpoints, type CompactionCheckpointRow } from "./schema";

export async function getLatestCompactionCheckpoint(
  chatId: string,
): Promise<CompactionCheckpointRow | null> {
  const [row] = await db
    .select()
    .from(compactionCheckpoints)
    .where(eq(compactionCheckpoints.chatId, chatId))
    .orderBy(desc(compactionCheckpoints.createdAt))
    .limit(1);
  return row ?? null;
}

export async function saveCompactionCheckpoint(params: {
  chatId: string;
  sessionId?: string | null;
  summaryText: string;
  compactedUpToMessageCount: number;
  compactedUpToMessageId?: string | null;
  preTokens: number;
  postTokens: number;
}): Promise<CompactionCheckpointRow> {
  const [row] = await db
    .insert(compactionCheckpoints)
    .values({
      id: `ckpt_${nanoid()}`,
      chatId: params.chatId,
      sessionId: params.sessionId ?? null,
      summaryText: params.summaryText,
      compactedUpToMessageCount: params.compactedUpToMessageCount,
      compactedUpToMessageId: params.compactedUpToMessageId ?? null,
      preTokens: params.preTokens,
      postTokens: params.postTokens,
    })
    .returning();
  return row;
}
