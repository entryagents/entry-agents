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
    const result = await listComposioToolkitsForUser(session.user.id, {
      search,
      category,
    });
    return NextResponse.json(result);
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
