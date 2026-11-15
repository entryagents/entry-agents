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
  const category = searchParams.get("category") ?? undefined;
  const offsetRaw = searchParams.get("offset");
  const limitRaw = searchParams.get("limit");
  const providerId = searchParams.get("provider") ?? undefined;

  const offset = offsetRaw !== null ? Number.parseInt(offsetRaw, 10) : 0;
  const limit = limitRaw !== null ? Number.parseInt(limitRaw, 10) : 48;

  const provider = getIntegrationProvider(providerId);
  const result = await provider.listToolkits(session.user.id, query, {
    category,
    offset: Number.isFinite(offset) ? offset : 0,
    limit: Number.isFinite(limit) ? limit : 48,
  });
  return NextResponse.json(result);
}
