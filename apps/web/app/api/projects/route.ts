import { nanoid } from "nanoid";
import { z } from "zod";
import {
  createOrFindRepoProject,
  createProject,
  getProjectsByUserId,
} from "@/lib/db/projects";
import { getSessionById, updateSession } from "@/lib/db/sessions";
import {
  isValidGitHubRepoName,
  isValidGitHubRepoOwner,
} from "@/lib/github/urls";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerSession } from "@/lib/session/get-server-session";

const createFolderProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(80, "Project name must be 80 characters or fewer"),
  assignSessionId: z.string().trim().min(1).optional().nullable(),
});

const createRepoProjectSchema = z.object({
  repoOwner: z.string().trim().min(1),
  repoName: z.string().trim().min(1),
  defaultBranch: z.string().trim().min(1).max(120).optional().nullable(),
  assignSessionId: z.string().trim().min(1).optional().nullable(),
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

  const repoParsed = createRepoProjectSchema.safeParse(body);
  if (repoParsed.success) {
    const { repoOwner, repoName, defaultBranch, assignSessionId } =
      repoParsed.data;
    if (
      !isValidGitHubRepoOwner(repoOwner) ||
      !isValidGitHubRepoName(repoName)
    ) {
      return Response.json(
        { error: "Invalid GitHub repository owner or name" },
        { status: 400 },
      );
    }

    const { project, created } = await createOrFindRepoProject({
      id: nanoid(),
      userId: session.user.id,
      repoOwner,
      repoName,
      defaultBranch: defaultBranch ?? null,
    });

    if (assignSessionId) {
      const targetSession = await getSessionById(assignSessionId);
      if (targetSession && targetSession.userId === session.user.id) {
        await updateSession(targetSession.id, { projectId: project.id });
      }
    }

    return Response.json({ project, created }, { status: created ? 201 : 200 });
  }

  const folderParsed = createFolderProjectSchema.safeParse(body);
  if (!folderParsed.success) {
    return Response.json(
      { error: folderParsed.error.issues[0]?.message ?? "Invalid project" },
      { status: 400 },
    );
  }

  const project = await createProject({
    id: nanoid(),
    userId: session.user.id,
    name: folderParsed.data.name,
  });

  if (folderParsed.data.assignSessionId) {
    const targetSession = await getSessionById(
      folderParsed.data.assignSessionId,
    );
    if (targetSession && targetSession.userId === session.user.id) {
      await updateSession(targetSession.id, { projectId: project.id });
    }
  }

  return Response.json({ project, created: true }, { status: 201 });
}
