import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { authSessions, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchAvailableLanguageModelsWithContext } from "@/lib/models-with-context";
import { estimateModelUsageCost } from "@/lib/models";
import { recordBillableUsage } from "@/lib/billing/credit-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Desktop model gateway — the ONLY new desktop route.
 *
 * Auth mirrors /api/desktop/usage: `Authorization: Bearer <session token>`
 * validated against `auth_sessions`. The request body is an OpenAI-compatible
 * `chat/completions` payload which is forwarded verbatim to Entry's managed
 * gateway (`GATEWAY_BASE_URL` + server-side `GATEWAY_API_KEY` — the key never
 * leaves the server). The SSE stream is piped back to the caller untouched.
 *
 * Billing: the final usage chunk is parsed server-side, cost is computed with
 * the same `estimateModelUsageCost` used by web, and debited via
 * `recordBillableUsage` (idempotent on the client-supplied
 * `x-billing-reference` header, so retries never double-charge).
 */

interface ParsedUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

function usageFromOpenAI(
  u: Record<string, unknown> | undefined,
): ParsedUsage | null {
  if (!u || typeof u !== "object") return null;
  const promptTokens = Number(u.prompt_tokens ?? 0);
  const completionTokens = Number(u.completion_tokens ?? 0);
  if (!Number.isFinite(promptTokens) && !Number.isFinite(completionTokens))
    return null;
  const details = (u.prompt_tokens_details ?? {}) as Record<string, unknown>;
  return {
    inputTokens: promptTokens,
    cachedInputTokens: Number(details.cached_tokens ?? 0),
    outputTokens: completionTokens,
  };
}

async function resolveUserIdFromBearer(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const [found] = await db
    .select({
      userId: authSessions.userId,
      expiresAt: authSessions.expiresAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .where(eq(authSessions.token, token))
    .limit(1);
  if (!found || found.expiresAt < new Date()) return null;
  return found.userId;
}

export async function POST(req: Request) {
  try {
    const userId = await resolveUserIdFromBearer(req);
    if (!userId) {
      return NextResponse.json(
        { error: "Invalid or expired session token" },
        { status: 401 },
      );
    }

    const gatewayBase = process.env.GATEWAY_BASE_URL;
    const gatewayKey = process.env.GATEWAY_API_KEY;
    if (!gatewayBase || !gatewayKey) {
      return NextResponse.json(
        { error: "Gateway is not configured" },
        { status: 503 },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
    }

    const modelId = typeof body.model === "string" ? body.model : "";
    const billingReference =
      req.headers.get("x-billing-reference") || crypto.randomUUID();

    // Always request usage so billing can be computed server-side.
    body.stream_options = {
      ...(body.stream_options as object | undefined),
      include_usage: true,
    };

    const upstream = await fetch(
      `${gatewayBase.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${gatewayKey}`,
        },
        body: JSON.stringify(body),
      },
    );

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Gateway error ${upstream.status}`,
          detail: text.slice(0, 2000),
        },
        { status: upstream.status || 502 },
      );
    }

    // Tee the upstream stream: pipe it back verbatim while scanning for the
    // final usage payload to bill against.
    const [toClient, forBilling] = upstream.body.tee();
    const contentType =
      upstream.headers.get("content-type") ?? "text/event-stream";

    // Collect usage without blocking the client stream.
    const usagePromise = (async () => {
      const reader = forBilling
        .pipeThrough(new TextDecoderStream())
        .getReader();
      let lastUsage: ParsedUsage | null = null;
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as Record<string, unknown>;
            const parsed = usageFromOpenAI(
              json.usage as Record<string, unknown> | undefined,
            );
            if (parsed) lastUsage = parsed;
          } catch {
            /* partial or non-JSON line — ignore */
          }
        }
      }
      return lastUsage;
    })();

    void usagePromise
      .then(async (usage) => {
        if (!usage) return;
        try {
          const models = await fetchAvailableLanguageModelsWithContext();
          const match = models.find((m) => m.id === modelId);
          const costUsd = estimateModelUsageCost(usage, match?.cost);
          await recordBillableUsage(userId, costUsd ?? 0, {
            billingReference,
            modelId: modelId || undefined,
            description: "Desktop agent usage",
          });
        } catch (err) {
          console.error("[desktop/chat] billing failed:", err);
        }
      })
      .catch(() => {});

    return new Response(toClient, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "no-store",
        "x-billing-reference": billingReference,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Desktop chat proxy failed" },
      { status: 500 },
    );
  }
}
