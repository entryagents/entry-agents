import { NextResponse } from "next/server";
import {
  completeComposioDeferredAuth,
  ComposioServiceError,
  scrubSecretsFromText,
  verifyAndCompleteComposioCallback,
} from "@/lib/composio/client";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const session = await getServerSession();

  if (!session?.user?.id) {
    const loginRedirect = new URL("/settings/connections", origin);
    loginRedirect.searchParams.set("composio", "error");
    loginRedirect.searchParams.set(
      "reason",
      "Authentication required to complete connection",
    );
    return NextResponse.redirect(loginRedirect);
  }

  const sessionUri = url.searchParams.get("session_uri")?.trim() ?? "";
  const stateNonce = url.searchParams.get("state")?.trim() ?? "";
  const connectedAccountId =
    url.searchParams.get("connectedAccountId")?.trim() ||
    url.searchParams.get("connected_account_id")?.trim() ||
    null;
  const statusParam = url.searchParams.get("status")?.trim() ?? null;

  const rawReturnTo = url.searchParams.get("returnTo")?.trim() ?? "";
  const safeReturnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : null;

  if (sessionUri) {
    try {
      const completed = await completeComposioDeferredAuth({
        authenticatedUserId: session.user.id,
        sessionUri,
      });
      let targetPath = safeReturnTo ?? "/settings/connections";
      if (!safeReturnTo && stateNonce) {
        const { getComposioOAuthAttemptByNonce } =
          await import("@/lib/db/composio-sessions");
        const attempt = await getComposioOAuthAttemptByNonce(stateNonce).catch(
          () => null,
        );
        if (
          attempt?.returnPath &&
          attempt.returnPath.startsWith("/") &&
          !attempt.returnPath.startsWith("//")
        ) {
          targetPath = attempt.returnPath;
        }
      }
      const dest = new URL(targetPath, origin);
      dest.searchParams.set("composio", "connected");
      dest.searchParams.set("toolkit", completed.toolkitSlug);
      dest.searchParams.set("connectedAccountId", completed.connectedAccountId);
      return NextResponse.redirect(dest);
    } catch (error) {
      const reason =
        error instanceof Error
          ? scrubSecretsFromText(error.message)
          : "OAuth callback identity verification failed";
      const status =
        error instanceof ComposioServiceError ? error.statusCode : 400;

      if (req.headers.get("accept")?.includes("application/json")) {
        return NextResponse.json({ error: reason }, { status });
      }

      const errUrl = new URL("/settings/connections", origin);
      errUrl.searchParams.set("composio", "error");
      errUrl.searchParams.set("reason", reason);
      return NextResponse.redirect(errUrl);
    }
  }

  if (!stateNonce) {
    const errUrl = new URL("/settings/connections", origin);
    errUrl.searchParams.set("composio", "error");
    errUrl.searchParams.set("reason", "Missing OAuth session_uri or state");
    return NextResponse.redirect(errUrl);
  }

  try {
    const completed = await verifyAndCompleteComposioCallback({
      authenticatedUserId: session.user.id,
      stateNonce,
      connectedAccountId,
      statusParam,
    });

    const targetPath = completed.returnPath.startsWith("/")
      ? completed.returnPath
      : "/settings/connections";
    const dest = new URL(targetPath, origin);
    dest.searchParams.set(
      "composio",
      completed.account.status === "ACTIVE" ? "connected" : "error",
    );
    dest.searchParams.set("toolkit", completed.account.toolkitSlug);
    dest.searchParams.set(
      "connectedAccountId",
      completed.account.connectedAccountId,
    );
    if (completed.account.status !== "ACTIVE" && completed.account.lastError) {
      dest.searchParams.set("reason", completed.account.lastError);
    }
    return NextResponse.redirect(dest);
  } catch (error) {
    const reason =
      error instanceof Error
        ? scrubSecretsFromText(error.message)
        : "OAuth callback verification failed";
    const status =
      error instanceof ComposioServiceError ? error.statusCode : 400;

    if (req.headers.get("accept")?.includes("application/json")) {
      return NextResponse.json({ error: reason }, { status });
    }

    const errUrl = new URL("/settings/connections", origin);
    errUrl.searchParams.set("composio", "error");
    errUrl.searchParams.set("reason", reason);
    return NextResponse.redirect(errUrl);
  }
}
