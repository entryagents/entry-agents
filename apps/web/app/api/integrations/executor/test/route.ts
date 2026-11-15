import { NextResponse } from "next/server";
import {
  recordUserExecutorCheckResult,
  resolveExecutorRuntimeAuth,
} from "@/lib/db/executor-connection";
import { testExecutorConnection } from "@/lib/integrations/providers/executor-mcp";
import { getServerSession } from "@/lib/session/get-server-session";

export async function POST() {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const auth = await resolveExecutorRuntimeAuth(session.user.id);
  if (!auth) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No Executor credential configured yet. Connect with Executor OAuth or save a personal access token.",
      },
      { status: 400 },
    );
  }

  const result = await testExecutorConnection(auth);
  await recordUserExecutorCheckResult(
    session.user.id,
    result.ok ? null : (result.error ?? "Executor check failed"),
    result.tools,
  ).catch(() => {});

  return NextResponse.json(result);
}
