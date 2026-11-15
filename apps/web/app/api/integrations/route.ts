import { NextResponse } from "next/server";
import { getIntegrationProvider } from "@/lib/integrations/registry";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? undefined;
  const providerId = searchParams.get("provider") ?? undefined;

  const provider = getIntegrationProvider(providerId);
  const result = await provider.listToolkits(session.user.id, query);
  return NextResponse.json(result);
}
