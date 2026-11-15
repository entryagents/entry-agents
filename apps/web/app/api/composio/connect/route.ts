import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ComposioServiceError,
  disconnectComposioAccount,
  initiateComposioConnection,
  reconnectComposioAccount,
  scrubSecretsFromText,
} from "@/lib/composio/client";
import { setDefaultComposioConnectedAccount } from "@/lib/db/composio-sessions";
import { getServerSession } from "@/lib/session/get-server-session";

const connectBodySchema = z.object({
  action: z
    .enum(["connect", "reconnect", "set_default"])
    .optional()
    .default("connect"),
  toolkit: z.string().optional(),
  connectedAccountId: z.string().optional(),
  alias: z.string().max(80).optional().nullable(),
  accountType: z.enum(["PRIVATE", "SHARED"]).optional().default("PRIVATE"),
  allowMultiple: z.boolean().optional().default(true),
  authConfigId: z.string().optional().nullable(),
  chatId: z.string().optional().nullable(),
  sessionId: z.string().optional().nullable(),
  returnPath: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof connectBodySchema>;
  try {
    const raw = await req.json();
    parsed = connectBodySchema.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Invalid request payload" },
      { status: 400 },
    );
  }

  const origin = new URL(req.url).origin;

  try {
    if (parsed.action === "set_default") {
      if (!parsed.connectedAccountId) {
        return NextResponse.json(
          { error: "connectedAccountId is required" },
          { status: 400 },
        );
      }
      const updated = await setDefaultComposioConnectedAccount(
        session.user.id,
        parsed.connectedAccountId,
      );
      if (!updated) {
        return NextResponse.json(
          { error: "Connected account not found" },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, account: updated });
    }

    if (parsed.action === "reconnect") {
      if (!parsed.connectedAccountId) {
        return NextResponse.json(
          { error: "connectedAccountId is required for reconnect" },
          { status: 400 },
        );
      }
      const reconnected = await reconnectComposioAccount({
        userId: session.user.id,
        connectedAccountId: parsed.connectedAccountId,
        callbackBaseUrl: origin,
      });
      return NextResponse.json({
        ok: true,
        redirectUrl: reconnected.redirectUrl,
        account: reconnected.account,
      });
    }

    if (!parsed.toolkit?.trim()) {
      return NextResponse.json(
        { error: "toolkit slug is required" },
        { status: 400 },
      );
    }

    const initiated = await initiateComposioConnection({
      userId: session.user.id,
      toolkitSlug: parsed.toolkit,
      callbackBaseUrl: origin,
      alias: parsed.alias ?? null,
      accountType: parsed.accountType,
      allowMultiple: parsed.allowMultiple,
      authConfigId: parsed.authConfigId ?? null,
      chatId: parsed.chatId ?? null,
      sessionId: parsed.sessionId ?? null,
      returnPath: parsed.returnPath ?? null,
    });

    return NextResponse.json({
      ok: true,
      redirectUrl: initiated.redirectUrl,
      connectedAccountId: initiated.connectedAccountId,
      stateNonce: initiated.stateNonce,
      status: initiated.status,
      toolkitSlug: initiated.toolkitSlug,
      alias: initiated.alias,
      accountType: initiated.accountType,
    });
  } catch (error) {
    const status =
      error instanceof ComposioServiceError ? error.statusCode : 500;
    const message =
      error instanceof Error
        ? scrubSecretsFromText(error.message)
        : "Failed to initiate Composio connection";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  let connectedAccountId = url.searchParams.get("connectedAccountId")?.trim();

  if (!connectedAccountId) {
    try {
      const body = (await req.json()) as { connectedAccountId?: string };
      connectedAccountId = body.connectedAccountId?.trim();
    } catch {
      // ignore empty body
    }
  }

  if (!connectedAccountId) {
    return NextResponse.json(
      { error: "connectedAccountId is required" },
      { status: 400 },
    );
  }

  try {
    const res = await disconnectComposioAccount({
      userId: session.user.id,
      connectedAccountId,
    });
    return NextResponse.json({ ok: res.deleted });
  } catch (error) {
    const status =
      error instanceof ComposioServiceError ? error.statusCode : 500;
    const message =
      error instanceof Error
        ? scrubSecretsFromText(error.message)
        : "Failed to disconnect Composio account";
    return NextResponse.json({ error: message }, { status });
  }
}
