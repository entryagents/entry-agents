import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/session/get-server-session";
import { isUserAdmin } from "@/lib/db/users";
import { db } from "@/lib/db/client";
import { chats, sessions, users } from "@/lib/db/schema";
import { eq, or, inArray, isNotNull } from "drizzle-orm";

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

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const updatedChats = await db
      .update(chats)
      .set({
        status: "idle",
        activeStreamId: null,
        runStatusUpdatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        or(
          isNotNull(chats.activeStreamId),
          inArray(chats.status, ["queued", "running", "sleeping", "resuming"]),
        ),
      )
      .returning({ id: chats.id });

    const updatedSessions = await db
      .update(sessions)
      .set({
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(sessions.status, "running"))
      .returning({ id: sessions.id });

    const updatedUsers = await db
      .update(users)
      .set({
        activeBillingRunId: null,
      })
      .where(isNotNull(users.activeBillingRunId))
      .returning({ id: users.id });

    return NextResponse.json({
      success: true,
      message: `Reconciled ${updatedChats.length} chats to idle, ${updatedSessions.length} sessions to completed, and cleared ${updatedUsers.length} user billing locks.`,
      reconciledChatsCount: updatedChats.length,
      reconciledSessionsCount: updatedSessions.length,
      clearedBillingLocksCount: updatedUsers.length,
    });
  } catch (error) {
    console.error("[admin/reconcile-runs] Failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to reconcile runs",
      },
      { status: 500 },
    );
  }
}
