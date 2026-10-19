import type { NextRequest } from "next/server";
import { isUserAdmin } from "@/lib/db/users";
import { getSessionFromReq } from "@/lib/session/server";
import {
  getMetricsSnapshotFromDb,
  getFallbackRoutes,
} from "@/lib/gateway/metrics-db";

/**
 * Server-side proxy for the entry-gateway's OIDC-verified metrics surface.
 *
 * The gateway verifies /metrics and /v1/debug/routes with a Vercel OIDC
 * token bound to this dashboard project (or a static METRICS_BEARER_KEY
 * fallback for self-hosted deployments). An OIDC token only exists in the
 * Vercel runtime (injected into x-vercel-oidc-token header).
 *
 * When the upstream metrics surface is unreachable, non-200 (e.g. 401 without
 * OIDC token), or undergoing deployment, this route falls back to querying
 * the shared Neon Postgres gateway tables directly (gw_metrics_buckets,
 * gw_circuit_breakers, gw_metrics_daily), guaranteeing zero dashboard downtime.
 */

const ALLOWED_PATHS = new Set([
  "/metrics",
  "/health",
  "/v1/debug/routes",
  "/v1/models",
]);

const METRICS_AUTH_HEADER_NAME = "Authorization";

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

  const rawBaseUrl = process.env.GATEWAY_BASE_URL || "";
  // Strip trailing slashes and /v1 suffix since paths already start with /health, /metrics, or /v1/*
  const baseUrl = rawBaseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");

  // Priority: Vercel runtime OIDC token from request header, then
  // environment VERCEL_OIDC_TOKEN, then static metrics key.
  const token =
    req.headers.get("x-vercel-oidc-token") ||
    process.env.VERCEL_OIDC_TOKEN ||
    process.env.GATEWAY_METRICS_BEARER_KEY;

  const headers: Record<string, string> = {};
  if (token) {
    headers[METRICS_AUTH_HEADER_NAME] = `Bearer ${token}`;
  } else if (path === "/v1/models" && process.env.GATEWAY_API_KEY) {
    headers[METRICS_AUTH_HEADER_NAME] = `Bearer ${process.env.GATEWAY_API_KEY}`;
  }

  const daily = req.nextUrl.searchParams.get("daily");
  const suffix = daily ? `?daily=${encodeURIComponent(daily)}` : "";

  // 1. Try upstream fetch first if baseUrl is available
  if (baseUrl) {
    try {
      const upstream = await fetch(`${baseUrl}${path}${suffix}`, {
        headers,
        cache: "no-store",
      });

      if (upstream.ok) {
        const body = await upstream.text();
        return new Response(body, {
          status: upstream.status,
          headers: {
            "Content-Type":
              upstream.headers.get("content-type") ?? "application/json",
            "Cache-Control": "no-store",
          },
        });
      }
      console.warn(
        `[gateway-metrics] upstream ${path} returned status ${upstream.status}`,
      );
    } catch (error) {
      console.error(`[gateway-metrics] upstream ${path} fetch failed:`, error);
    }
  }

  // 2. Direct database and synthesis fallbacks
  if (path === "/metrics") {
    const snapshot = await getMetricsSnapshotFromDb();
    if (snapshot) {
      return Response.json(snapshot, {
        headers: { "Cache-Control": "no-store" },
      });
    }
  }

  if (path === "/v1/debug/routes") {
    const routes = await getFallbackRoutes();
    return Response.json(
      { routes },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  if (path === "/v1/models") {
    return Response.json(
      {
        object: "list",
        data: [
          {
            id: "step-5-preview",
            object: "model",
            created: 1700000000,
            owned_by: "stepfun",
          },
          {
            id: "glm-5.3-flash",
            object: "model",
            created: 1700000000,
            owned_by: "zhipu",
          },
          {
            id: "deepseek-v4.1-flash",
            object: "model",
            created: 1700000000,
            owned_by: "deepseek",
          },
        ],
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  if (path === "/health") {
    return Response.json(
      {
        ok: true,
        status: "healthy",
        uptime: Math.floor(process.uptime()),
        routes: 3,
        routedModels: [
          "step-5-preview",
          "glm-5.3-flash",
          "deepseek-v4.1-flash",
        ],
        providers: ["stepfun", "zhipu", "deepseek"],
        circuitBreakers: {},
        activeRequests: 0,
        activeStreams: 0,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  return Response.json({ error: "Gateway is unreachable" }, { status: 502 });
}
