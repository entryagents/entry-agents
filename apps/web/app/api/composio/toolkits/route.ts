import { NextResponse } from "next/server";
import {
  ComposioServiceError,
  listComposioToolkitsForUser,
  scrubSecretsFromText,
} from "@/lib/composio/client";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET(req: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const search = url.searchParams.get("q") ?? undefined;
  const category = url.searchParams.get("category") ?? undefined;

  try {
    const [{ getUserExternalIntegrationAccess }, result] = await Promise.all([
      import("@/lib/billing/integration-access-server"),
      listComposioToolkitsForUser(session.user.id, {
        search,
        category,
      }),
    ]);
    const access = await getUserExternalIntegrationAccess(session.user.id);
    return NextResponse.json({
      ...result,
      planRestricted: !access.allowed,
      upgradeReason: access.allowed ? null : (access.reason ?? null),
    });
  } catch (error) {
    const status =
      error instanceof ComposioServiceError ? error.statusCode : 500;
    const message =
      error instanceof Error
        ? scrubSecretsFromText(error.message)
        : "Failed to list Composio toolkits";
    return NextResponse.json({ error: message }, { status });
  }
}
