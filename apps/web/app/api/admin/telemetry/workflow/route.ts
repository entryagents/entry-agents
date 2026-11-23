import { NextResponse } from "next/server";
import { getWorkflowTelemetrySummary } from "@/lib/db/workflow-telemetry";
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

function resolveWindowSince(rawWindow: string | null): Date {
  const days = rawWindow === "24h" ? 1 : rawWindow === "30d" ? 30 : 7;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const windowParam = url.searchParams.get("window") ?? "7d";
    const since = resolveWindowSince(windowParam);
    const summary = await getWorkflowTelemetrySummary(since);
    return NextResponse.json(
      { window: windowParam, since: since.toISOString(), ...summary },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    console.error(
      "[admin/telemetry/workflow] Failed to load workflow telemetry:",
      error,
    );
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load workflow telemetry",
      },
      { status: 500 },
    );
  }
}
