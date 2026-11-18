import { desc, eq } from "drizzle-orm";
import { db } from "./client";
import { projects, type NewProject, type Project } from "./schema";

export async function getProjectsByUserId(userId: string): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt), desc(projects.createdAt));
}

export async function getProjectById(
  projectId: string,
): Promise<Project | undefined> {
  return db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
}

export async function createProject(
  data: Pick<NewProject, "id" | "userId" | "name">,
): Promise<Project> {
  const [project] = await db.insert(projects).values(data).returning();
  if (!project) {
    throw new Error("Failed to create project");
  }
  return project;
}

export async function updateProject(
  projectId: string,
  data: { name: string },
): Promise<Project | undefined> {
  const [project] = await db
    .update(projects)
    .set({ name: data.name, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning();
  return project;
}

export async function deleteProject(projectId: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, projectId));
}
