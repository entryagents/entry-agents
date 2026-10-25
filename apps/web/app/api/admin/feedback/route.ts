import { getServerSession } from "@/lib/session/get-server-session";
import { db } from "@/lib/db/client";
import { feedback } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { isUserAdmin } from "@/lib/db/users";

export async function GET(req: Request) {
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

  try {
    const items = await db
      .select()
      .from(feedback)
      .orderBy(desc(feedback.createdAt))
      .limit(200);

    const stats = {
      total: items.length,
      new: items.filter((f) => f.status === "new").length,
      bugs: items.filter((f) => f.category === "bug").length,
      features: items.filter((f) => f.category === "feature").length,
    };

    return Response.json({ success: true, feedback: items, stats });
  } catch (error) {
    console.error("[api/admin/feedback] Error fetching feedback:", error);
    return Response.json(
      { error: "Failed to fetch feedback" },
      { status: 500 },
    );
  }
}
