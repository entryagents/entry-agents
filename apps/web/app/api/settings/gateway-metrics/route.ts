import type { NextRequest } from "next/server";
import { isUserAdmin } from "@/lib/db/users";
import { getSessionFromReq } from "@/lib/session/server";

/**
 * Server-side proxy for the entry-gateway's OIDC-verified metrics surface.
 *
 * The gateway no longer accepts the inference GATEWAY_API_KEY on
 * /metrics or /v1/debug/routes -- those are verified with a Vercel OIDC
 * token bound to this dashboard project (or a static METRICS_BEARER_KEY
 * fallback for self-hosted deployments). An OIDC token only exists in the
 * Vercel runtime, so the browser cannot present it: this route attaches
 * the platform token server-side.
 *
 * Admin-gated to match /api/settings/gateway-defaults, which feeds this
 * page its base URL and inference key.
 */

const ALLOWED_PATHS = new Set([
  "/metrics",
  "/health",
  "/v1/debug/routes",
  "/v1/models",
]);

const METRICS_AUTH_HEADER_NAME = "Authorization";
const MISSING_TOKEN_BODY = {
  error: "No metrics credential is configured for this deployment",
};

export async function GET(req: NextRequest) {
  const session = await getSessionFromReq(req);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = await isUserAdmin(session.user.id);
  if (!admin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const path = req.nextUrl.searchParams.get("path") ?? "/metrics";
  if (!ALLOWED_PATHS.has(path)) {
    return Response.json({ error: "Unknown metrics path" }, { status: 400 });
  }

  const baseUrl = (process.env.GATEWAY_BASE_URL || "").replace(/\/+$/, "");
  if (!baseUrl) {
    return Response.json(
      { error: "GATEWAY_BASE_URL is not configured" },
      { status: 503 },
    );
  }

  // Priority: the platform OIDC token (bound to this dashboard project and
  // environment, auto-rotated by Vercel), then the static metrics key so
  // self-hosted deployments without OIDC keep working.
  const token =
    process.env.VERCEL_OIDC_TOKEN || process.env.GATEWAY_METRICS_BEARER_KEY;
  if (!token) {
    return Response.json(MISSING_TOKEN_BODY, { status: 503 });
  }

  const daily = req.nextUrl.searchParams.get("daily");
  const suffix = daily ? `?daily=${encodeURIComponent(daily)}` : "";

  try {
    const upstream = await fetch(`${baseUrl}${path}${suffix}`, {
      headers: { [METRICS_AUTH_HEADER_NAME]: `Bearer ${token}` },
      cache: "no-store",
    });

    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[gateway-metrics] upstream fetch failed:", error);
    return Response.json({ error: "Gateway is unreachable" }, { status: 502 });
  }
}
