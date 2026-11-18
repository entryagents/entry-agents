import { nanoid } from "nanoid";
import { z } from "zod";
import { createProject, getProjectsByUserId } from "@/lib/db/projects";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerSession } from "@/lib/session/get-server-session";

const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Folder name is required")
    .max(80, "Folder name must be 80 characters or fewer"),
});

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const projects = await getProjectsByUserId(session.user.id);
  return Response.json({ projects });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const limited = await checkRateLimit({
    key: rateLimitKey(["projects-create", session.user.id]),
    limit: 30,
    windowMs: 60_000,
  });
  if (limited) {
    return limited;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid folder name" },
      { status: 400 },
    );
  }

  const project = await createProject({
    id: nanoid(),
    userId: session.user.id,
    name: parsed.data.name,
  });

  return Response.json({ project }, { status: 201 });
}
