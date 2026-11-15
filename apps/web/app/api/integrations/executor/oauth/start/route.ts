import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDefaultExecutorConfigFromEnv } from "@/lib/db/executor-connection";
import {
  buildExecutorAuthorizeUrl,
  createPkcePair,
  ensureExecutorOAuthClient,
  EXECUTOR_OAUTH_COOKIE_NAME,
  signExecutorOAuthState,
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

export async function GET(req: NextRequest) {
  const session = await getServerSession();
  const origin = resolvePublicOrigin(req);

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  try {
    const envDefaults = getDefaultExecutorConfigFromEnv();
    const mcpUrl =
      req.nextUrl.searchParams.get("mcpUrl")?.trim() || envDefaults.mcpUrl;
    const connectionId =
      req.nextUrl.searchParams.get("connection")?.trim() ||
      envDefaults.connectionId;

    const redirectUri = `${origin}/api/integrations/executor/oauth/callback`;
    const client = await ensureExecutorOAuthClient(redirectUri);
    const { codeVerifier, codeChallenge } = createPkcePair();
    const state = randomBytes(16).toString("hex");

    const signedCookie = signExecutorOAuthState({
      userId: session.user.id,
      state,
      codeVerifier,
      clientId: client.clientId,
      clientSecret: client.clientSecret,
      redirectUri,
      mcpUrl,
      connectionId,
      createdAt: Date.now(),
    });

    const authorizeUrl = buildExecutorAuthorizeUrl({
      clientId: client.clientId,
      redirectUri,
      state,
      codeChallenge,
      mcpUrl,
      connectionId,
    });

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(EXECUTOR_OAUTH_COOKIE_NAME, signedCookie, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: origin.startsWith("https://"),
      maxAge: 60 * 10,
    });
    return response;
  } catch (error) {
    const fallback = new URL("/settings/connections", origin);
    fallback.searchParams.set("executor", "error");
    fallback.searchParams.set(
      "reason",
      error instanceof Error
        ? error.message.slice(0, 140)
        : "oauth_start_failed",
    );
    return NextResponse.redirect(fallback);
  }
}
