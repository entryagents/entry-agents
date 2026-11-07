import { NextResponse } from "next/server";
import { fetchAvailableLanguageModelsWithContext } from "@/lib/models-with-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const models = await fetchAvailableLanguageModelsWithContext();

    return NextResponse.json({
      provider: "entry",
      models: models.map((m) => ({
        id: m.id,
        name: m.name,
        context_window: m.context_window || 1_000_000,
        max_output_tokens: m.max_output_tokens || 64_000,
        pricing: m.cost,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to fetch desktop models" },
      { status: 500 }
    );
  }
}
