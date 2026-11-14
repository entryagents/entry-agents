import { z } from "zod";
import {
  deleteUserSecret,
  InvalidSecretNameError,
  InvalidSecretValueError,
  updateUserSecret,
} from "@/lib/db/secrets";
import { getServerSession } from "@/lib/session/get-server-session";

const updateSecretSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  value: z.string().min(1).max(32_768).optional(),
  description: z.string().max(500).nullable().optional(),
  allowedHosts: z.array(z.string().max(255)).max(50).optional(),
  injectInSandbox: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSecretSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      { status: 400 },
    );
  }

  try {
    const updated = await updateUserSecret({
      userId: session.user.id,
      id,
      name: parsed.data.name,
      value: parsed.data.value,
      description: parsed.data.description,
      allowedHosts: parsed.data.allowedHosts,
      injectInSandbox: parsed.data.injectInSandbox,
    });
    if (!updated) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ secret: updated });
  } catch (error) {
    if (
      error instanceof InvalidSecretNameError ||
      error instanceof InvalidSecretValueError
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof Error &&
      error.message.includes("user_secrets_user_id_name_idx")
    ) {
      return Response.json(
        { error: "You already have a secret with this name" },
        { status: 409 },
      );
    }
    console.error("Failed to update user secret:", error);
    return Response.json({ error: "Failed to update secret" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await deleteUserSecret(session.user.id, id);
  if (!deleted) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
