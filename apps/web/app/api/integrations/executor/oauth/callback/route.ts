import { NextResponse, type NextRequest } from "next/server";
import { saveUserExecutorOAuth } from "@/lib/db/executor-connection";
import {
  buildExecutorMcpUrl,
  fetchExecutorWhoami,
} from "@/lib/integrations/providers/executor-mcp";
import {
  exchangeExecutorOAuthCode,
  EXECUTOR_OAUTH_COOKIE_NAME,
  verifyExecutorOAuthState,
} from "@/lib/integrations/providers/executor-oauth";
import { getServerSession } from "@/lib/session/get-server-session";

function resolvePublicOrigin(req: NextRequest): string {
  const forwardedHost = req.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return new URL(req.url).origin;
}

function redirectWithStatus(
  origin: string,
  status: string,
  reason?: string,
): NextResponse {
  const target = new URL("/settings/connections", origin);
  target.searchParams.set("executor", status);
  if (reason) {
    target.searchParams.set("reason", reason.slice(0, 160));
  }
  const response = NextResponse.redirect(target);
  response.cookies.delete(EXECUTOR_OAUTH_COOKIE_NAME);
  return response;
}

export async function GET(req: NextRequest) {
  const origin = resolvePublicOrigin(req);
  const session = await getServerSession();
  if (!session?.user?.id) {
    return redirectWithStatus(origin, "error", "Sign in required");
  }

  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) {
    return redirectWithStatus(
      origin,
      "error",
      req.nextUrl.searchParams.get("error_description") || oauthError,
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const rawCookie = req.cookies.get(EXECUTOR_OAUTH_COOKIE_NAME)?.value;
  const savedState = verifyExecutorOAuthState(rawCookie);

  if (
    !code ||
    !state ||
    !savedState ||
    savedState.state !== state ||
    savedState.userId !== session.user.id
  ) {
    return redirectWithStatus(
      origin,
      "error",
      "Invalid or expired OAuth state",
    );
  }

  try {
    const tokens = await exchangeExecutorOAuthCode({
      code,
      redirectUri: savedState.redirectUri,
      codeVerifier: savedState.codeVerifier,
      clientId: savedState.clientId,
      clientSecret: savedState.clientSecret,
      mcpUrl: savedState.mcpUrl,
      connectionId: savedState.connectionId,
    });

    const endpointUrl = buildExecutorMcpUrl({
      baseUrl: savedState.mcpUrl,
      authMode: "oauth",
      connectionId: savedState.connectionId,
    });

    const whoami = await fetchExecutorWhoami({
      token: tokens.accessToken,
      authMode: "oauth",
      mcpUrl: endpointUrl,
      connectionId: savedState.connectionId,
      source: "oauth",
    });

    await saveUserExecutorOAuth(session.user.id, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      clientId: savedState.clientId,
      clientSecret: savedState.clientSecret,
      organization:
        whoami.organization?.slug ?? whoami.organization?.id ?? undefined,
      organizationName: whoami.organization?.name ?? undefined,
      connectionId: savedState.connectionId,
      mcpUrl: savedState.mcpUrl,
    });

    return redirectWithStatus(origin, "connected");
  } catch (error) {
    return redirectWithStatus(
      origin,
      "error",
      error instanceof Error
        ? error.message
        : "Failed to complete Executor sign-in",
    );
  }
}
