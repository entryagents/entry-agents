import { type NextRequest, NextResponse } from "next/server";
import { requireDesktopUser, unauthorized } from "@/lib/desktop/auth";
import { getSql } from "@/lib/desktop/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IntegrationStatus {
  provider: "github" | "vercel";
  connected: boolean;
  accountLogin: string | null;
  scope: string | null;
  expiresAt: string | null;
}

async function getAccount(userId: string, provider: string) {
  const sql = getSql();
  const rows = await sql`
    SELECT account_id, access_token, refresh_token, access_token_expires_at, scope
    FROM accounts
    WHERE user_id = ${userId} AND provider_id = ${provider}
    ORDER BY access_token_expires_at DESC NULLS FIRST
    LIMIT 1`;
  return rows[0] as
    | {
        account_id: string;
        access_token: string | null;
        refresh_token: string | null;
        access_token_expires_at: Date | string | null;
        scope: string | null;
      }
    | undefined;
}

function expiryIso(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  return new Date(value).toISOString();
}

function isExpired(expiresAt: Date | string | null): boolean {
  if (!expiresAt) {
    return false;
  }
  return new Date(expiresAt).getTime() - 60_000 < Date.now();
}

async function refreshAccessToken(
  provider: "github" | "vercel",
  refreshToken: string,
): Promise<{
  accessToken: string;
  expiresIn: number | null;
  scope: string | null;
} | null> {
  const endpoints: Record<
    string,
    { url: string; clientIdEnv: string; secretEnv: string }
  > = {
    github: {
      url: "https://github.com/login/oauth/access_token",
      clientIdEnv: "NEXT_PUBLIC_GITHUB_CLIENT_ID",
      secretEnv: "GITHUB_CLIENT_SECRET",
    },
    vercel: {
      url: "https://api.vercel.com/v2/oauth/access_token",
      clientIdEnv: "NEXT_PUBLIC_VERCEL_APP_CLIENT_ID",
      secretEnv: "VERCEL_APP_CLIENT_SECRET",
    },
  };
  const cfg = endpoints[provider];
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.secretEnv];
  if (!clientId || !clientSecret) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    },
    body,
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!data.access_token) {
    return null;
  }
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in ?? null,
    scope: data.scope ?? null,
  };
}

async function persistRefreshedToken(
  userId: string,
  provider: string,
  accessToken: string,
  expiresIn: number | null,
  scope: string | null,
): Promise<void> {
  const sql = getSql();
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;
  await sql`
    UPDATE accounts
    SET access_token = ${accessToken},
        access_token_expires_at = ${expiresAt},
        scope = COALESCE(${scope}, scope),
        updated_at = now()
    WHERE user_id = ${userId} AND provider_id = ${provider}`;
}

export async function GET(req: NextRequest) {
  const user = await requireDesktopUser(req);
  if (!user) {
    return unauthorized();
  }

  const status: IntegrationStatus[] = [];
  for (const provider of ["github", "vercel"] as const) {
    try {
      const account = await getAccount(user.id, provider);
      status.push({
        provider,
        connected: Boolean(account?.access_token || account?.refresh_token),
        accountLogin: account?.account_id ?? null,
        scope: account?.scope ?? null,
        expiresAt: expiryIso(account?.access_token_expires_at ?? null),
      });
    } catch {
      status.push({
        provider,
        connected: false,
        accountLogin: null,
        scope: null,
        expiresAt: null,
      });
    }
  }
  return NextResponse.json({ integrations: status });
}

export async function POST(req: NextRequest) {
  const user = await requireDesktopUser(req);
  if (!user) {
    return unauthorized();
  }

  let body: { provider?: string };
  try {
    body = (await req.json()) as { provider?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const provider = body.provider;
  if (provider !== "github" && provider !== "vercel") {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }

  let account: Awaited<ReturnType<typeof getAccount>>;
  try {
    account = await getAccount(user.id, provider);
  } catch {
    return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
  }
  if (!account || (!account.access_token && !account.refresh_token)) {
    return NextResponse.json({ error: "not_connected" }, { status: 404 });
  }

  if (account.access_token && !isExpired(account.access_token_expires_at)) {
    return NextResponse.json({
      token: account.access_token,
      scope: account.scope ?? null,
      expiresAt: expiryIso(account.access_token_expires_at),
    });
  }

  if (!account.refresh_token) {
    return NextResponse.json(
      { error: "reconnected_required" },
      { status: 401 },
    );
  }

  const refreshed = await refreshAccessToken(provider, account.refresh_token);
  if (!refreshed) {
    return NextResponse.json({ error: "revoked" }, { status: 401 });
  }

  try {
    await persistRefreshedToken(
      user.id,
      provider,
      refreshed.accessToken,
      refreshed.expiresIn,
      refreshed.scope,
    );
  } catch {
    // token still usable
  }
  return NextResponse.json({
    token: refreshed.accessToken,
    scope: refreshed.scope ?? account.scope ?? null,
    expiresAt: refreshed.expiresIn
      ? new Date(Date.now() + refreshed.expiresIn * 1000).toISOString()
      : null,
  });
}

export async function DELETE(req: NextRequest) {
  const user = await requireDesktopUser(req);
  if (!user) {
    return unauthorized();
  }

  let body: { provider?: string };
  try {
    body = (await req.json()) as { provider?: string };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const provider = body.provider;
  if (provider !== "github" && provider !== "vercel") {
    return NextResponse.json({ error: "invalid_provider" }, { status: 400 });
  }

  const sql = getSql();
  await sql`DELETE FROM accounts WHERE user_id = ${user.id} AND provider_id = ${provider}`;
  return NextResponse.json({ ok: true });
}
