import { NextResponse } from "next/server";
import { z } from "zod";
import { getIntegrationProvider } from "@/lib/integrations/registry";
import { getServerSession } from "@/lib/session/get-server-session";

const ConnectBodySchema = z.object({
  slug: z.string().min(1),
  providerId: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = ConnectBodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const callbackUrl = `${origin}/settings/connections?integration=connected&slug=${encodeURIComponent(parsed.data.slug)}`;
  const provider = getIntegrationProvider(parsed.data.providerId);
  const result = await provider.connect(
    session.user.id,
    parsed.data.slug,
    callbackUrl,
  );

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(result);
}
