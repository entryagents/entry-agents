import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";
import { listComposioToolkitsForUser } from "@/lib/mcp/composio";

export async function GET(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    return auth.response;
  }

  const url = new URL(req.url);
  const search = url.searchParams.get("q")?.trim() || undefined;
  const result = await listComposioToolkitsForUser(
    auth.userId,
    search ? { search } : undefined,
  );
  return Response.json(result);
}
