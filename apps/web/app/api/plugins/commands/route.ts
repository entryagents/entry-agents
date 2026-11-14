import { getEnabledPluginSlashCommands } from "@/lib/db/plugins";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const commands = await getEnabledPluginSlashCommands(session.user.id);
  return Response.json({ commands });
}
