import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Resolve the better-auth accountId for a user's linked OAuth provider.
 * better-auth 1.7.x getAccessToken/refreshToken take accountId (the
 * provider-side account id from the accounts table) instead of providerId.
 * Returns null when the user hasn't linked that provider.
 */
export async function getProviderAccountId(
  userId: string,
  providerId: "github" | "vercel",
): Promise<string | null> {
  const [row] = await db
    .select({ accountId: accounts.accountId })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, providerId)))
    .limit(1);
  return row?.accountId ?? null;
}
