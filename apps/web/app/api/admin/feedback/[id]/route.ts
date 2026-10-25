import { getServerSession } from "@/lib/session/get-server-session";
import { db } from "@/lib/db/client";
import { feedback } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isUserAdmin } from "@/lib/db/users";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  const secretHeader = req.headers.get("x-audit-secret");
  const isAuditAuthorized =
    Boolean(process.env.AUDIT_ROUTE_SECRET) &&
    secretHeader === process.env.AUDIT_ROUTE_SECRET;

  const isAdmin = session?.user?.id
    ? await isUserAdmin(session.user.id).catch(() => false)
    : false;
  if (!isAuditAuthorized && !isAdmin) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const { status } = await req.json();
    if (!["new", "reviewed", "resolved", "archived"].includes(status)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    await db.update(feedback).set({ status }).where(eq(feedback.id, id));
    return Response.json({ success: true });
  } catch (error) {
    console.error("[api/admin/feedback] Error updating feedback:", error);
    return Response.json(
      { error: "Failed to update feedback" },
      { status: 500 },
    );
  }
}
