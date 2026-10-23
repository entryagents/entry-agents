import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type {
  GithubProfile,
  GoogleProfile,
  VercelProfile,
} from "better-auth/social-providers";
import { nanoid } from "nanoid";
import { deriveAuthUsername } from "@/lib/auth/username";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

function normalizeHost(value?: string): string | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(
      value.startsWith("http://") || value.startsWith("https://")
        ? value
        : `https://${value}`,
    ).host;
  } catch {
    return null;
  }
}

function getWildcardHostPattern(host: string): string | null {
  const hostname = host.split(":")[0];
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("[")
  ) {
    return null;
  }

  return `*.${host}`;
}

function getAuthBaseURLFallback(): string | undefined {
  return (
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
  );
}

function getAllowedAuthHosts(): string[] {
  const hosts = new Set<string>(["localhost:3000", "127.0.0.1:3000"]);

  for (const value of [
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
  ]) {
    const host = normalizeHost(value);
    if (!host) {
      continue;
    }

    hosts.add(host);

    const wildcardPattern = getWildcardHostPattern(host);
    if (wildcardPattern) {
      hosts.add(wildcardPattern);
    }
  }

  return [...hosts];
}

function mapVercelProfileToUser(profile: VercelProfile): { username: string } {
  return {
    username: deriveAuthUsername({
      id: profile.sub,
      preferred_username: profile.preferred_username,
      email: profile.email,
      name: profile.name,
    }),
  };
}

function mapGoogleProfileToUser(profile: GoogleProfile): { username: string } {
  return {
    username: deriveAuthUsername({
      id: profile.sub,
      email: profile.email,
      name: profile.name,
    }),
  };
}

function mapGitHubProfileToUser(profile: GithubProfile): {
  username: string;
  email: string;
} {
  return {
    // GitHub can hide a user's email even when the user:email scope is granted.
    // Better Auth requires an email to create the user, so use GitHub's stable
    // noreply identity when the public profile does not include one.
    email:
      profile.email ??
      `${profile.id}+${profile.login}@users.noreply.github.com`,
    username: deriveAuthUsername({
      id: profile.id,
      username: profile.login,
      email: profile.email,
      name: profile.name,
    }),
  };
}

const VERCEL_OAUTH_TOKEN_ENDPOINT = "https://api.vercel.com/login/oauth/token";

interface RefreshedOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scopes?: string[];
  idToken?: string;
  accessTokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
}

/**
 * Exchanges a stored Vercel refresh token for a fresh access token.
 *
 * Better Auth's built-in `vercel` social provider does NOT implement
 * `refreshAccessToken` (unlike google/github/etc.), so
 * `auth.api.getAccessToken` silently kept handing back the original
 * access token after it expired (~1h after sign-in). That expired token
 * was then brokered into the sandbox for `vercel_cli` and sent as the
 * Bearer for `vercel_api`, which is exactly why both tools reported
 * "invalid credentials / invalid token". We already request
 * `offline_access`, so a refresh token is stored -- it just was never used.
 */
export async function refreshVercelAccessToken(
  refreshToken: string,
): Promise<RefreshedOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID ?? "",
    client_secret: process.env.VERCEL_APP_CLIENT_SECRET ?? "",
  });

  const response = await fetch(VERCEL_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Vercel token refresh failed (${response.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`,
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    token_type?: string;
    scope?: string;
    id_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("Vercel token refresh returned no access_token");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    scopes: data.scope ? data.scope.split(" ") : undefined,
    idToken: data.id_token,
    accessTokenExpiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    refreshTokenExpiresAt: data.refresh_token_expires_in
      ? new Date(Date.now() + data.refresh_token_expires_in * 1000)
      : undefined,
  };
}

/**
 * Attaches `refreshAccessToken` to the Vercel social provider at auth
 * context init so Better Auth's normal `getAccessToken` (auto-refresh when
 * within 5s of expiry) and `refreshToken` endpoints work for Vercel the
 * same way they already do for every other provider.
 */
const vercelTokenRefreshPlugin = {
  id: "vercel-token-refresh",
  init(ctx) {
    const providers = (ctx as { socialProviders?: unknown }).socialProviders;
    if (!Array.isArray(providers)) return;
    for (const provider of providers as Array<{
      id: string;
      refreshAccessToken?: (token: string) => Promise<RefreshedOAuthTokens>;
    }>) {
      if (provider.id === "vercel" && !provider.refreshAccessToken) {
        provider.refreshAccessToken = refreshVercelAccessToken;
      }
    }
  },
} satisfies BetterAuthPlugin;

const authBaseURLFallback = getAuthBaseURLFallback();
const authAllowedHosts = getAllowedAuthHosts();

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: {
    allowedHosts: authAllowedHosts,
    ...(authBaseURLFallback ? { fallback: authBaseURLFallback } : {}),
  },

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      users: schema.users,
      auth_sessions: schema.authSessions,
      account: schema.accounts,
      verification: schema.verification,
    },
  }),

  user: {
    modelName: "users",
    fields: {
      image: "avatarUrl",
    },
    additionalFields: {
      username: { type: "string", required: true },
      lastLoginAt: { type: "date", required: false },
    },
  },

  databaseHooks: {
    user: {
      create: {
        before: async (user) => ({
          data: {
            username: deriveAuthUsername(user),
          },
        }),
      },
    },
  },

  session: {
    modelName: "auth_sessions",
  },

  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["vercel", "github", "google"],
      allowDifferentEmails: true,
    },
  },

  socialProviders: {
    vercel: {
      clientId: process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID ?? "",
      clientSecret: process.env.VERCEL_APP_CLIENT_SECRET ?? "",
      scope: ["openid", "email", "profile", "offline_access"],
      overrideUserInfoOnSignIn: true,
      mapProfileToUser: mapVercelProfileToUser,
    },
    github: {
      clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      mapProfileToUser: mapGitHubProfileToUser,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      mapProfileToUser: mapGoogleProfileToUser,
    },
  },

  plugins: [vercelTokenRefreshPlugin],

  advanced: {
    database: {
      generateId: () => nanoid(),
    },
  },
});
