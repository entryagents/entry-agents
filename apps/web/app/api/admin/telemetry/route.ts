import { NextResponse } from "next/server";
import {
  getAdminTelemetry,
  parseAdminTelemetryWindow,
} from "@/lib/db/admin-telemetry";
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
    if (isAdmin) {
      return true;
    }
  }

  return false;
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const window = parseAdminTelemetryWindow(url.searchParams.get("window"));
    const telemetry = await getAdminTelemetry(window);
    return NextResponse.json(telemetry, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    console.error("[admin/telemetry] Failed to load admin telemetry:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load admin telemetry",
      },
      { status: 500 },
    );
  }
}
