import { z } from "zod";
import {
  createCustomPlugin,
  listUserPlugins,
  PluginValidationError,
  upsertBuiltinPluginState,
} from "@/lib/db/plugins";
import { getServerSession } from "@/lib/session/get-server-session";

const postPluginBodySchema = z.union([
  z.object({
    mode: z.literal("builtin"),
    slug: z.string().trim().min(1).max(40),
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    mode: z.literal("custom").optional(),
    manifest: z.unknown(),
    enabled: z.boolean().optional(),
    config: z.record(z.string(), z.string()).optional(),
  }),
]);

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const data = await listUserPlugins(session.user.id);
  return Response.json(data);
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postPluginBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid plugin payload" },
      { status: 400 },
    );
  }

  try {
    if ("mode" in parsed.data && parsed.data.mode === "builtin") {
      const plugin = await upsertBuiltinPluginState(
        session.user.id,
        parsed.data.slug,
        {
          enabled: parsed.data.enabled,
          config: parsed.data.config,
        },
      );
      return Response.json({ plugin }, { status: 200 });
    }

    const plugin = await createCustomPlugin(session.user.id, {
      manifest: "manifest" in parsed.data ? parsed.data.manifest : rawBody,
      enabled: parsed.data.enabled,
      config: parsed.data.config,
    });
    return Response.json({ plugin }, { status: 201 });
  } catch (error) {
    if (error instanceof PluginValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof Error &&
      error.message.includes("user_plugins_user_id_slug_idx")
    ) {
      return Response.json(
        { error: "A plugin with this slug already exists" },
        { status: 409 },
      );
    }
    console.error("Failed to save plugin:", error);
    return Response.json({ error: "Failed to save plugin" }, { status: 500 });
  }
}
