import { z } from "zod";
import {
  createMcpServer,
  InvalidMcpServerConfigError,
  InvalidMcpServerNameError,
  listMcpServers,
} from "@/lib/db/mcp-servers";
import { UnsafeMcpServerUrlError } from "@/lib/mcp/url-safety";
import { getServerSession } from "@/lib/session/get-server-session";

const stringRecordSchema = z.record(z.string(), z.string());

const createMcpServerSchema = z.discriminatedUnion("transport", [
  z.object({
    name: z.string().trim().min(1, "name is required"),
    transport: z.enum(["http", "sse"]),
    url: z.string().trim().min(1, "url is required"),
    headers: stringRecordSchema.optional(),
  }),
  z.object({
    name: z.string().trim().min(1, "name is required"),
    transport: z.literal("stdio"),
    command: z.string().trim().min(1, "command is required"),
    args: z.array(z.string()).optional(),
    env: stringRecordSchema.optional(),
  }),
]);

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const servers = await listMcpServers(session.user.id);
  return Response.json({ servers });
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

  const parsed = createMcpServerSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid MCP server config" },
      { status: 400 },
    );
  }

  try {
    const created =
      parsed.data.transport === "stdio"
        ? await createMcpServer({
            userId: session.user.id,
            name: parsed.data.name,
            transport: "stdio",
            command: parsed.data.command,
            args: parsed.data.args,
            env: parsed.data.env,
          })
        : await createMcpServer({
            userId: session.user.id,
            name: parsed.data.name,
            transport: parsed.data.transport,
            url: parsed.data.url,
            headers: parsed.data.headers,
          });
    return Response.json({ server: created }, { status: 201 });
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
    console.error("Failed to create MCP server:", error);
    return Response.json(
      { error: "Failed to create MCP server" },
      { status: 500 },
    );
  }
}
