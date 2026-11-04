export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({
    ok: true,
    service: "entry-desktop-backend",
    domain: "https://entry-agents.dev",
    source: "apps/web",
  });
}
