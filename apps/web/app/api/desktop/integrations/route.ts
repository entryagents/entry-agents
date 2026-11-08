import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { authSessions, accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [session] = await db
      .select({ userId: authSessions.userId })
      .from(authSessions)
      .where(eq(authSessions.token, token))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userAccounts = await db
      .select({
        providerId: accounts.providerId,
        accountId: accounts.accountId,
        createdAt: accounts.createdAt,
      })
      .from(accounts)
      .where(eq(accounts.userId, session.userId));

    const github = userAccounts.find((a) => a.providerId === "github");
    const vercel = userAccounts.find((a) => a.providerId === "vercel");

    return NextResponse.json({
      github: {
        connected: Boolean(github),
        accountId: github?.accountId,
      },
      vercel: {
        connected: Boolean(vercel),
        accountId: vercel?.accountId,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Internal server error" },
      { status: 500 },
    );
  }
}
