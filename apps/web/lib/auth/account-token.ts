import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Resolve the Better Auth account row id (`accounts.id`) for a user's linked
 * OAuth provider. Better Auth 1.7.x `getAccessToken` / `refreshToken` match
 * `candidate.id === selection.accountId` against the internal primary key
 * (`accounts.id`), NOT the external provider-side `accounts.accountId`.
 * Returns null when the user hasn't linked that provider.
 */
export async function getProviderAccountId(
  userId: string,
  providerId: "github" | "vercel",
): Promise<string | null> {
  const [row] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), eq(accounts.providerId, providerId)),
    )
    .limit(1);
  return row?.id ?? null;
}
