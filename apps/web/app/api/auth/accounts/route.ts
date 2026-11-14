import { auth } from "@/lib/auth/config";
import { getServerSession } from "@/lib/session/get-server-session";

export async function GET(request: Request) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return Response.json(
      { error: "Not authenticated", providers: [] },
      { status: 401 },
    );
  }

  try {
    const accounts = await auth.api.listUserAccounts({
      headers: request.headers,
    });

    return Response.json({
      providers: accounts.map((account) => account.providerId),
    });
  } catch (error) {
    console.error("Failed to list user accounts:", error);
    return Response.json(
      { error: "Failed to load linked accounts", providers: [] },
      { status: 500 },
    );
  }
}
