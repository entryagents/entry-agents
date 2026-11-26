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
import { eq, desc, sql, count, ilike, or, inArray } from "drizzle-orm";

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
    const url = new URL(req.url);
    const search = (url.searchParams.get("search") ?? "").trim();
    const page = Math.max(
      1,
      Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1,
    );
    const pageSize = Math.min(
      100,
      Math.max(
        10,
        Number.parseInt(url.searchParams.get("pageSize") ?? "25", 10) || 25,
      ),
    );

    const searchPattern = search ? `%${search}%` : null;
    const whereClause = searchPattern
      ? or(
          ilike(chats.id, searchPattern),
          ilike(chats.sessionId, searchPattern),
          ilike(chats.title, searchPattern),
          ilike(chats.modelId, searchPattern),
          ilike(chats.status, searchPattern),
          ilike(users.email, searchPattern),
          ilike(users.name, searchPattern),
        )
      : undefined;

    const [
      totalChatsRes,
      activeChatsRes,
      totalMessagesRes,
      totalRunsRes,
      filteredCountRes,
      recentChats,
    ] = await Promise.all([
      db.select({ count: count() }).from(chats),
      db
        .select({ count: count() })
        .from(chats)
        .where(
          sql`${chats.status} IN ('queued', 'running', 'sleeping', 'resuming') OR ${chats.activeStreamId} IS NOT NULL`,
        ),
      db.select({ count: count() }).from(chatMessages),
      db.select({ count: count() }).from(workflowRuns),
      db
        .select({ count: count() })
        .from(chats)
        .innerJoin(sessions, eq(sessions.id, chats.sessionId))
        .leftJoin(users, eq(users.id, sessions.userId))
        .where(whereClause),
      db
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
        .where(whereClause)
        .orderBy(desc(chats.updatedAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
    ]);

    const chatIds = recentChats.map((c) => c.id);
    const runCountsByChat = new Map<string, number>();
    if (chatIds.length > 0) {
      const runCounts = await db
        .select({
          chatId: workflowRuns.chatId,
          count: count(),
        })
        .from(workflowRuns)
        .where(inArray(workflowRuns.chatId, chatIds))
        .groupBy(workflowRuns.chatId);
      for (const row of runCounts) {
        runCountsByChat.set(row.chatId, Number(row.count));
      }
    }

    const totalFiltered = Number(filteredCountRes[0]?.count ?? 0);

    return NextResponse.json({
      metrics: {
        totalChats: totalChatsRes[0]?.count ?? 0,
        activeChats: activeChatsRes[0]?.count ?? 0,
        totalMessages: totalMessagesRes[0]?.count ?? 0,
        totalRuns: totalRunsRes[0]?.count ?? 0,
      },
      recentChats: recentChats.map((c) => ({
        ...c,
        runCount: runCountsByChat.get(c.id) ?? 0,
      })),
      pagination: {
        page,
        pageSize,
        totalCount: totalFiltered,
        totalPages: Math.max(1, Math.ceil(totalFiltered / pageSize)),
      },
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
