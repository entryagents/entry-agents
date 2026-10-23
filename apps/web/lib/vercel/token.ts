import "server-only";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { accounts } from "@/lib/db/schema";

export interface UserVercelAuthInfo {
  token: string;
  expiresAt: number;
  externalId: string;
}

async function getVercelAccountId(userId: string): Promise<string> {
  const rows = await db
    .select({ accountId: accounts.accountId })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "vercel")))
    .limit(1);
  return rows[0]?.accountId ?? "";
}

/**
 * Cheap existence check for whether this user has a linked Vercel
 * account -- a single indexed row lookup, no live token fetch/refresh.
 * Used by runAgentWorkflow (see app/workflows/chat.ts) to decide whether
 * to surface the vercel_cli tool's `connected` flag to the agent,
 * mirroring how `github.hasRepo` is derived from plain session columns
 * rather than a live GitHub API call.
 */
export async function hasVercelAccountLinked(userId: string): Promise<boolean> {
  try {
    const accountId = await getVercelAccountId(userId);
    return accountId.length > 0;
  } catch (error) {
    console.error("Error checking Vercel account link:", error);
    return false;
  }
}

/**
 * Get a valid Vercel access token plus CLI-relevant metadata for the given user.
 * better-auth auto-refreshes expired tokens via stored refresh token.
 */
export async function getUserVercelAuthInfo(
  userId: string,
): Promise<UserVercelAuthInfo | null> {
  try {
    const [result, externalId] = await Promise.all([
      auth.api.getAccessToken({
        body: { providerId: "vercel", userId },
      }),
      getVercelAccountId(userId),
    ]);

    if (!result?.accessToken) {
      return null;
    }

    return {
      token: result.accessToken,
      expiresAt: result.accessTokenExpiresAt
        ? Math.floor(new Date(result.accessTokenExpiresAt).getTime() / 1000)
        : Math.floor(Date.now() / 1000) + 3600,
      externalId,
    };
  } catch (error) {
    console.error("Error fetching Vercel auth:", error);
    return null;
  }
}

/**
 * Force-refresh the user's Vercel OAuth access token via the stored
 * refresh token (see vercelTokenRefreshPlugin in lib/auth/config.ts) and
 * return the new access token, or null if no refresh is possible (no
 * linked account, no refresh token, or Vercel rejected the refresh).
 *
 * Used as a one-shot retry by vercel_cli / vercel_api when Vercel answers
 * 401/403 "invalid token" -- e.g. the token was revoked server-side or our
 * stored expiry was wrong, so the proactive expiry check didn't fire.
 */
export async function refreshUserVercelToken(
  userId: string,
): Promise<string | null> {
  try {
    const result = await auth.api.refreshToken({
      body: { providerId: "vercel", userId },
    });
    return result?.accessToken ?? null;
  } catch (error) {
    console.error("Error refreshing Vercel token:", error);
    return null;
  }
}

/**
 * True when a Vercel API status / CLI output indicates the presented
 * credentials were rejected (expired, revoked, or malformed token).
 */
export function isVercelAuthFailure(input: {
  status?: number;
  text?: string;
}): boolean {
  if (input.status === 401 || input.status === 403) {
    if (input.status === 401) return true;
    // 403 is also used for genuine permission errors -- only treat it as an
    // auth failure when the body mentions the token.
    return /token|credential|authenticat/i.test(input.text ?? "");
  }
  const text = input.text ?? "";
  return /invalid[_ ]?token|token is not valid|not authorized|invalid credentials|token has expired|expired token|the specified token|forbidden.*token|authentication (?:failed|required)|not logged in/i.test(
    text,
  );
}

/**
 * Get a valid Vercel access token for the given user.
 */
export async function getUserVercelToken(
  userId: string,
): Promise<string | null> {
  try {
    const result = await auth.api.getAccessToken({
      body: { providerId: "vercel", userId },
    });

    return result?.accessToken ?? null;
  } catch (error) {
    // "Account not found" is expected when the user hasn't linked Vercel --
    // only log unexpected errors (mirrors lib/github/token.ts).
    const isExpected =
      error instanceof Error && error.message === "Account not found";
    if (!isExpected) {
      console.error("Error fetching Vercel token:", error);
    }
    return null;
  }
}
