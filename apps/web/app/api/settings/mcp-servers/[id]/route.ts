import { z } from "zod";
import {
  deleteMcpServer,
  InvalidMcpServerConfigError,
  InvalidMcpServerNameError,
  updateMcpServer,
} from "@/lib/db/mcp-servers";
import { UnsafeMcpServerUrlError } from "@/lib/mcp/url-safety";
import { getServerSession } from "@/lib/session/get-server-session";

const stringRecordSchema = z.record(z.string(), z.string());

const updateMcpServerSchema = z.object({
  name: z.string().trim().min(1).optional(),
  transport: z.enum(["http", "sse", "stdio"]).optional(),
  url: z.string().trim().optional(),
  headers: stringRecordSchema.optional(),
  command: z.string().trim().optional(),
  args: z.array(z.string()).optional(),
  env: stringRecordSchema.optional(),
  enabled: z.boolean().optional(),
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

  const parsed = updateMcpServerSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      {
        error: parsed.error.issues[0]?.message ?? "Invalid MCP update payload",
      },
      { status: 400 },
    );
  }

  try {
    const updated = await updateMcpServer({
      userId: session.user.id,
      id,
      name: parsed.data.name,
      transport: parsed.data.transport,
      url: parsed.data.url,
      headers: parsed.data.headers,
      command: parsed.data.command,
      args: parsed.data.args,
      env: parsed.data.env,
      enabled: parsed.data.enabled,
    });

    if (!updated) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return Response.json({ server: updated });
  } catch (error) {
    if (
      error instanceof InvalidMcpServerNameError ||
      error instanceof InvalidMcpServerConfigError ||
      error instanceof UnsafeMcpServerUrlError
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof Error &&
      error.message.includes("mcp_servers_user_id_name_idx")
    ) {
      return Response.json(
        { error: "You already have a server with this name" },
        { status: 409 },
      );
    }
    console.error("Failed to update MCP server:", error);
    return Response.json(
      { error: "Failed to update MCP server" },
      { status: 500 },
    );
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
  const deleted = await deleteMcpServer(session.user.id, id);

  if (!deleted) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
