import { getServerSession } from "@/lib/session/get-server-session";
import { db } from "@/lib/db/client";
import { feedback } from "@/lib/db/schema";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  try {
    const session = await getServerSession();
    const body = await req.json();
    const { category, sentiment, title, message } = body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const id = "fb_" + nanoid(16);
    await db.insert(feedback).values({
      id,
      userId: session?.user?.id ?? null,
      userEmail: session?.user?.email ?? null,
      userName: session?.user?.name ?? session?.user?.username ?? null,
      category: category ?? "general",
      sentiment: sentiment ?? "good",
      title: title ? String(title).slice(0, 200) : null,
      message: String(message).slice(0, 5000),
      status: "new",
    });

    return Response.json({ success: true, id });
  } catch (error) {
    console.error("[api/feedback] Error submitting feedback:", error);
    return Response.json({ error: "Failed to submit feedback" }, { status: 500 });
  }
}
