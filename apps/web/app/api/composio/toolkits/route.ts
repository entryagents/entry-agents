import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";
import { listComposioToolkitsForUser } from "@/lib/mcp/composio";

export async function GET() {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    return auth.response;
  }

  const result = await listComposioToolkitsForUser(auth.userId);
  return Response.json(result);
}
