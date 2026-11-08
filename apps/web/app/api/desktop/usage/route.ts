import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { authSessions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getUserBillingState } from "@/lib/billing/credit-ledger";
import { getPlanDefinition } from "@/lib/billing/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve token against auth_sessions table
    const [foundSession] = await db
      .select({
        id: authSessions.id,
        userId: authSessions.userId,
        expiresAt: authSessions.expiresAt,
        userEmail: users.email,
        userName: users.name,
        userAvatar: users.avatarUrl,
      })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.token, token))
      .limit(1);

    if (!foundSession || foundSession.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invalid or expired session token" },
        { status: 401 },
      );
    }

    const billingState = await getUserBillingState(foundSession.userId).catch(
      () => null,
    );
    const plan = getPlanDefinition(billingState?.plan);

    return NextResponse.json({
      userId: foundSession.userId,
      email: foundSession.userEmail,
      name: foundSession.userName,
      avatar: foundSession.userAvatar,
      plan: plan.id,
      planName: plan.name,
      creditBalanceCents: billingState?.creditBalanceCents ?? 0,
      monthlyGrantCents: plan.creditGrantCents ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 },
    );
  }
}
