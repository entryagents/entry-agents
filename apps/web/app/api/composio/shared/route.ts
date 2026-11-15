import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ComposioServiceError,
  scrubSecretsFromText,
  updateSharedComposioConnectionAccess,
} from "@/lib/composio/client";
import {
  listActiveSharedGrantsForOwner,
  listAuthorizedSharedAccountsForUser,
} from "@/lib/db/composio-sessions";
import { getServerSession } from "@/lib/session/get-server-session";

const sharedActionSchema = z.object({
  connectedAccountId: z.string().min(1),
  action: z.enum(["grant", "revoke"]),
  targetUserId: z.string().min(1),
});

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const connectedAccountId =
    url.searchParams.get("connectedAccountId")?.trim() || undefined;

  const [grantsByMe, sharedWithMe] = await Promise.all([
    listActiveSharedGrantsForOwner(session.user.id, connectedAccountId),
    listAuthorizedSharedAccountsForUser(session.user.id),
  ]);

  return NextResponse.json({
    grantsByMe,
    sharedWithMe,
  });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof sharedActionSchema>;
  try {
    parsed = sharedActionSchema.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "Invalid shared connection grant payload" },
      { status: 400 },
    );
  }

  try {
    const res = await updateSharedComposioConnectionAccess({
      ownerUserId: session.user.id,
      connectedAccountId: parsed.connectedAccountId,
      action: parsed.action,
      targetUserId: parsed.targetUserId,
    });
    return NextResponse.json({
      ok: true,
      allowedUserIds: res.allowedUserIds,
    });
  } catch (error) {
    const status =
      error instanceof ComposioServiceError ? error.statusCode : 400;
    const message =
      error instanceof Error
        ? scrubSecretsFromText(error.message)
        : "Failed to update shared connection access";
    return NextResponse.json({ error: message }, { status });
  }
}
