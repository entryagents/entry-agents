import { and, desc, eq, sql } from "drizzle-orm";
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

export async function findRepoProjectByUserId(
  userId: string,
  repoOwner: string,
  repoName: string,
): Promise<Project | undefined> {
  const [existing] = await db
    .select()
    .from(projects)
    .where(
      and(
        eq(projects.userId, userId),
        sql`lower(${projects.repoOwner}) = ${repoOwner.toLowerCase()}`,
        sql`lower(${projects.repoName}) = ${repoName.toLowerCase()}`,
      ),
    )
    .limit(1);
  return existing;
}

export async function createProject(
  data: Pick<NewProject, "id" | "userId" | "name"> &
    Partial<Pick<NewProject, "repoOwner" | "repoName" | "defaultBranch">>,
): Promise<Project> {
  const [project] = await db.insert(projects).values(data).returning();
  if (!project) {
    throw new Error("Failed to create project");
  }
  return project;
}

export async function createOrFindRepoProject(data: {
  id: string;
  userId: string;
  repoOwner: string;
  repoName: string;
  defaultBranch?: string | null;
}): Promise<{ project: Project; created: boolean }> {
  const existing = await findRepoProjectByUserId(
    data.userId,
    data.repoOwner,
    data.repoName,
  );
  if (existing) {
    const [touched] = await db
      .update(projects)
      .set({
        updatedAt: new Date(),
        ...(data.defaultBranch ? { defaultBranch: data.defaultBranch } : {}),
      })
      .where(eq(projects.id, existing.id))
      .returning();
    return { project: touched ?? existing, created: false };
  }

  const project = await createProject({
    id: data.id,
    userId: data.userId,
    name: `${data.repoOwner}/${data.repoName}`,
    repoOwner: data.repoOwner,
    repoName: data.repoName,
    defaultBranch: data.defaultBranch ?? null,
  });
  return { project, created: true };
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
