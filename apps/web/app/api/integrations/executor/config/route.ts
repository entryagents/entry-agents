import { NextResponse } from "next/server";
import { z } from "zod";
import {
  clearUserExecutorConnection,
  getUserExecutorStatus,
  saveUserExecutorPat,
} from "@/lib/db/executor-connection";
import { getServerSession } from "@/lib/session/get-server-session";

const updateExecutorConfigSchema = z.object({
  pat: z.string().trim().optional(),
  organization: z.string().trim().optional(),
  connectionId: z.string().trim().optional(),
  mcpUrl: z.string().trim().optional(),
});

export async function GET() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = await getUserExecutorStatus(session.user.id);
  return NextResponse.json(status);
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateExecutorConfigSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid Executor config" },
      { status: 400 },
    );
  }

  if (parsed.data.mcpUrl) {
    try {
      const url = new URL(parsed.data.mcpUrl);
      if (url.protocol !== "https:") {
        return NextResponse.json(
          { error: "Executor MCP URL must use HTTPS" },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid Executor MCP URL" },
        { status: 400 },
      );
    }
  }

  try {
    await saveUserExecutorPat(session.user.id, parsed.data);
    const status = await getUserExecutorStatus(session.user.id);
    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save Executor settings",
      },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await clearUserExecutorConnection(session.user.id);
  const status = await getUserExecutorStatus(session.user.id);
  return NextResponse.json(status);
}
