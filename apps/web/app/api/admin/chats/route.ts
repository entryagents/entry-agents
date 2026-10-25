import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session/get-server-session";
import { isUserAdmin } from "@/lib/db/users";
import { db } from "@/lib/db/client";
import {
  chats,
  sessions,
  users,
  chatMessages,
  workflowRuns,
} from "@/lib/db/schema";
import { eq, desc, sql, count } from "drizzle-orm";

async function isAuthorized(req: Request): Promise<boolean> {
  const suppliedSecret = req.headers.get("x-audit-secret");
  const expectedSecret = process.env.AUDIT_ROUTE_SECRET;
  const expectedSecretLive = process.env.AUDIT_ROUTE_SECRET_LIVE;

  if (
    suppliedSecret &&
    ((expectedSecret && suppliedSecret === expectedSecret) ||
      (expectedSecretLive && suppliedSecret === expectedSecretLive))
  ) {
    return true;
  }

  const session = await getServerSession();
  if (session?.user?.id) {
    const isAdmin = await isUserAdmin(session.user.id).catch(() => false);
    if (isAdmin) {
      return true;
    }
  }

  return false;
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [totalChatsRes] = await db.select({ count: count() }).from(chats);
    const [activeChatsRes] = await db
      .select({ count: count() })
      .from(chats)
      .where(
        sql`${chats.status} IN ('queued', 'running', 'sleeping', 'resuming') OR ${chats.activeStreamId} IS NOT NULL`,
      );
    const [totalMessagesRes] = await db
      .select({ count: count() })
      .from(chatMessages);
    const [totalRunsRes] = await db
      .select({ count: count() })
      .from(workflowRuns);

    const recentChats = await db
      .select({
        id: chats.id,
        sessionId: chats.sessionId,
        title: chats.title,
        status: chats.status,
        modelId: chats.modelId,
        activeStreamId: chats.activeStreamId,
        createdAt: chats.createdAt,
        updatedAt: chats.updatedAt,
        sessionTitle: sessions.title,
        userId: sessions.userId,
        userEmail: users.email,
        userName: users.name,
      })
      .from(chats)
      .innerJoin(sessions, eq(sessions.id, chats.sessionId))
      .leftJoin(users, eq(users.id, sessions.userId))
      .orderBy(desc(chats.updatedAt))
      .limit(50);

    return NextResponse.json({
      metrics: {
        totalChats: totalChatsRes?.count ?? 0,
        activeChats: activeChatsRes?.count ?? 0,
        totalMessages: totalMessagesRes?.count ?? 0,
        totalRuns: totalRunsRes?.count ?? 0,
      },
      recentChats,
    });
  } catch (error) {
    console.error("[admin/chats] Failed to fetch chat metrics:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch chat metrics",
      },
      { status: 500 },
    );
  }
}
