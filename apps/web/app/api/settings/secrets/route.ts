import { z } from "zod";
import {
  createUserSecret,
  InvalidSecretNameError,
  InvalidSecretValueError,
  listUserSecrets,
} from "@/lib/db/secrets";
import { getServerSession } from "@/lib/session/get-server-session";

const createSecretSchema = z.object({
  name: z.string().min(1).max(64),
  value: z.string().min(1).max(32_768),
  description: z.string().max(500).optional(),
  allowedHosts: z.array(z.string().max(255)).max(50).optional(),
  injectInSandbox: z.boolean().optional(),
});

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const secrets = await listUserSecrets(session.user.id);
  return Response.json({ secrets });
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSecretSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request payload" },
      { status: 400 },
    );
  }

  try {
    const secret = await createUserSecret({
      userId: session.user.id,
      name: parsed.data.name,
      value: parsed.data.value,
      description: parsed.data.description,
      allowedHosts: parsed.data.allowedHosts,
      injectInSandbox: parsed.data.injectInSandbox,
    });
    return Response.json({ secret }, { status: 201 });
  } catch (error) {
    if (
      error instanceof InvalidSecretNameError ||
      error instanceof InvalidSecretValueError
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof Error &&
      error.message.includes("user_secrets_user_id_name_idx")
    ) {
      return Response.json(
        { error: "You already have a secret with this name" },
        { status: 409 },
      );
    }
    console.error("Failed to create user secret:", error);
    return Response.json({ error: "Failed to save secret" }, { status: 500 });
  }
}
