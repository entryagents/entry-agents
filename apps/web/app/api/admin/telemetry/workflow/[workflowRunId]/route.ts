import { NextResponse } from "next/server";
import { getWorkflowRunLifecycle } from "@/lib/db/workflow-telemetry";
import { isUserAdmin } from "@/lib/db/users";
import { getServerSession } from "@/lib/session/get-server-session";

export const dynamic = "force-dynamic";

async function isAuthorized(req: Request): Promise<boolean> {
  const suppliedSecret = req.headers.get("x-audit-secret");
  const expectedSecret = process.env.AUDIT_ROUTE_SECRET;
  const expectedSecretLive = process.env.AUDIT_ROUTE_SECRET_LIVE;

  if (
    suppliedSecret &&
    ((expectedSecret && suppliedSecret === expectedSecret) ||
      (expectedSecretLive && suppliedSecret === expectedSecretLive))
  ) {
    return true;
  }

  const session = await getServerSession();
  if (session?.user?.id) {
    const isAdmin = await isUserAdmin(session.user.id).catch(() => false);
    if (isAdmin) return true;
  }

  return false;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ workflowRunId: string }> },
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workflowRunId } = await context.params;
  if (!workflowRunId?.trim()) {
    return NextResponse.json(
      { error: "workflowRunId is required" },
      { status: 400 },
    );
  }

  try {
    const lifecycle = await getWorkflowRunLifecycle(workflowRunId.trim());
    if (!lifecycle) {
      return NextResponse.json(
        { error: "Workflow run not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(lifecycle, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error(
      "[admin/telemetry/workflow/[workflowRunId]] Failed to load lifecycle:",
      error,
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load workflow lifecycle",
      },
      { status: 500 },
    );
  }
}
