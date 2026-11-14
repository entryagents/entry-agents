import { z } from "zod";
import {
  deleteCustomPlugin,
  PluginValidationError,
  updateUserPlugin,
} from "@/lib/db/plugins";
import { getServerSession } from "@/lib/session/get-server-session";

const patchPluginBodySchema = z.object({
  enabled: z.boolean().optional(),
  manifest: z.unknown().optional(),
  config: z.record(z.string(), z.string()).optional(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ pluginId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { pluginId } = await context.params;
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchPluginBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid patch payload" },
      { status: 400 },
    );
  }

  try {
    const plugin = await updateUserPlugin(
      session.user.id,
      pluginId,
      parsed.data,
    );
    if (!plugin) {
      return Response.json({ error: "Plugin not found" }, { status: 404 });
    }
    return Response.json({ plugin });
  } catch (error) {
    if (error instanceof PluginValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("Failed to update plugin:", error);
    return Response.json({ error: "Failed to update plugin" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ pluginId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { pluginId } = await context.params;
  const deleted = await deleteCustomPlugin(session.user.id, pluginId);
  if (!deleted) {
    return Response.json(
      { error: "Custom plugin not found or cannot be deleted" },
      { status: 404 },
    );
  }
  return Response.json({ deleted: true });
}
