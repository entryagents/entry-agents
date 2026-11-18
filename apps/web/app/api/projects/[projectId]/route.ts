import { z } from "zod";
import {
  deleteProject,
  getProjectById,
  updateProject,
} from "@/lib/db/projects";
import { getServerSession } from "@/lib/session/get-server-session";

const updateProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Folder name is required")
    .max(80, "Folder name must be 80 characters or fewer"),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { projectId } = await params;
  const existing = await getProjectById(projectId);
  if (!existing) {
    return Response.json({ error: "Folder not found" }, { status: 404 });
  }

  if (existing.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateProjectSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid folder name" },
      { status: 400 },
    );
  }

  const project = await updateProject(projectId, { name: parsed.data.name });
  if (!project) {
    return Response.json({ error: "Folder not found" }, { status: 404 });
  }

  return Response.json({ project });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { projectId } = await params;
  const existing = await getProjectById(projectId);
  if (!existing) {
    return Response.json({ error: "Folder not found" }, { status: 404 });
  }

  if (existing.userId !== session.user.id) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await deleteProject(projectId);
  return Response.json({ success: true });
}
