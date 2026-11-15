import { NextResponse } from "next/server";
import {
  ComposioServiceError,
  scrubSecretsFromText,
  verifyAndProcessComposioWebhook,
} from "@/lib/composio/client";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature =
    req.headers.get("webhook-signature") ??
    req.headers.get("x-composio-signature");
  const webhookId =
    req.headers.get("webhook-id") ?? req.headers.get("x-composio-webhook-id");
  const webhookTimestamp =
    req.headers.get("webhook-timestamp") ??
    req.headers.get("x-composio-timestamp");

  try {
    const result = await verifyAndProcessComposioWebhook({
      rawBody,
      signature,
      webhookId,
      webhookTimestamp,
    });
    return NextResponse.json({
      ok: true,
      eventType: result.eventType,
      connectedAccountId: result.connectedAccountId,
      updatedStatus: result.updatedStatus,
    });
  } catch (error) {
    const status =
      error instanceof ComposioServiceError ? error.statusCode : 400;
    const message =
      error instanceof Error
        ? scrubSecretsFromText(error.message)
        : "Webhook verification failed";
    return NextResponse.json({ error: message }, { status });
  }
}
