import "server-only";
import { auth } from "@/lib/auth/config";

/**
 * Get a valid GitHub access token for the given user.
 * better-auth auto-refreshes expired tokens via stored refresh token.
 */
export async function getUserGitHubToken(
  userId: string,
): Promise<string | null> {
  try {
    const { getProviderAccountId } = await import("@/lib/auth/account-token");
    const accountId = await getProviderAccountId(userId, "github");
    if (!accountId) return null;
    const result = await auth.api.getAccessToken({
      body: { accountId, userId },
    });

    return result?.accessToken ?? null;
  } catch (error) {
    // "Account not found" is expected when the user hasn't linked GitHub —
    // only log unexpected errors.
    const isExpected =
      error instanceof Error && error.message === "Account not found";
    if (!isExpected) {
      console.error("Error fetching GitHub token:", error);
    }
    return null;
  }
}

export async function getGitHubAppUserToken(
  userId: string,
): Promise<string | null> {
  return getUserGitHubToken(userId);
}
