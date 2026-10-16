import { NextRequest, NextResponse } from "next/server";
import { requireDesktopUser, unauthorized } from "@/lib/auth";
import { debitUsage } from "@/lib/billing/credit-ledger";
import { estimateModelUsageCost } from "@/lib/models";
import { fetchAllLanguageModelsForAdmin } from "@/lib/models-with-context";
import {
  settleStepCost,
  type UsageAccrualState,
} from "@/lib/billing/usage-accrual";
import { recordUsage } from "@/lib/db/usage";

export const runtime = "nodejs";

/**
 * POST /v1/chat/completions — Entry Gateway proxy (desktop model transport) with the SERVER-SIDE
 * GATEWAY_API_KEY. Streams the gateway's response straight through
 * (SSE-friendly), propagates client aborts, and never returns the key.
 * The agent itself runs locally in Electron — this is only the model
 * transport boundary (Phase 5/6 architecture, now deployed).
 */
export const maxDuration = 300;

function getModelId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const anyBody = body as { model?: string; modelId?: string };
  return typeof anyBody.model === "string"
    ? anyBody.model
    : typeof anyBody.modelId === "string"
      ? anyBody.modelId
      : null;
}

export async function POST(req: NextRequest) {
  const user = await requireDesktopUser(req);
  if (!user) return unauthorized();

  const gatewayBase = process.env.GATEWAY_BASE_URL;
  const gatewayKey = process.env.GATEWAY_API_KEY;
  if (!gatewayBase || !gatewayKey) {
    return NextResponse.json(
      { error: "Model gateway unavailable" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const modelId = getModelId(body);
  const catalog = modelId
    ? await fetchAllLanguageModelsForAdmin().catch(() => [])
    : [];
  const modelCost = catalog.find((m) => m.id === modelId)?.cost;
  let upstream: Response;
  try {
    upstream = await fetch(
      `${gatewayBase.replace(/\/$/, "")}/v1/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayKey}`,
          "http-referer":
            process.env.NEXT_PUBLIC_SITE_URL ?? "https://entry-agents.dev",
          "x-title": "Entry Desktop",
        },
        body: JSON.stringify(body),
        signal: req.signal, // propagate desktop cancellation
      },
    );
  } catch {
    return NextResponse.json(
      { error: "Model gateway unreachable" },
      { status: 504 },
    );
  }

  if (!upstream.ok) {
    const status = upstream.status;
    return NextResponse.json(
      {
        error:
          status === 401 || status === 403
            ? "Model gateway rejected the request"
            : `Model error (${status})`,
      },
      { status: status >= 500 ? 502 : 400 },
    );
  }

  const headers = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) headers.set("content-type", ct);

  const upstreamBody = upstream.body;
  if (!upstreamBody || !modelId) {
    return new Response(upstreamBody, { status: upstream.status, headers });
  }

  const [forClient, forBilling] = upstreamBody.tee();
  void (async () => {
    try {
      const text = await new Response(forBilling).text();
      const match = text.match(
        /"usage"\s*:\s*\{[^}]*"prompt_tokens"\s*:\s*(\d+)[^}]*"completion_tokens"\s*:\s*(\d+)[^}]*\}/s,
      );
      if (!match) return;
      const inputTokens = Number(match[1]);
      const outputTokens = Number(match[2]);
      const costUsd = estimateModelUsageCost(
        {
          inputTokens,
          outputTokens,
          cachedInputTokens: 0,
        },
        modelCost,
      );
      if (typeof costUsd !== "number") return;
      const state: UsageAccrualState = { carryCents: 0 };
      const billable = settleStepCost(state, costUsd);
      if (billable > 0) {
        await debitUsage(user.id, billable, {
          modelId,
          description: `Desktop model usage for ${modelId}`,
        });
      }
      await recordUsage(user.id, {
        source: "desktop",
        modelId,
        inputTokens,
        outputTokens,
        cachedInputTokens: 0,
        costUsd,
      });
    } catch {
      // billing should never block the response stream
    }
  })();

  return new Response(forClient, { status: upstream.status, headers });
}
