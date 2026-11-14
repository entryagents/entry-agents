import { z } from "zod";
import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";
import {
  createUserSecret,
  listUserSecrets,
  updateUserSecret,
} from "@/lib/db/secrets";
import { authorizeComposioToolkitForUser } from "@/lib/mcp/composio";

const connectBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("authorize"),
    toolkitSlug: z.string().trim().min(1).max(64),
  }),
  z.object({
    action: z.literal("save_api_key"),
    apiKey: z.string().trim().min(8).max(512),
  }),
]);

export async function POST(req: Request) {
  const auth = await requireAuthenticatedUser();
  if (!auth.ok) {
    return auth.response;
  }

  let parsedBody: z.infer<typeof connectBodySchema>;
  try {
    const raw = await req.json();
    parsedBody = connectBodySchema.parse(raw);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid request payload",
      },
      { status: 400 },
    );
  }

  if (parsedBody.action === "save_api_key") {
    try {
      const existing = await listUserSecrets(auth.userId);
      const found = existing.find(
        (s) => s.name.toUpperCase() === "COMPOSIO_API_KEY",
      );
      if (found) {
        await updateUserSecret({
          userId: auth.userId,
          id: found.id,
          value: parsedBody.apiKey,
          description:
            "Composio API key for Gmail, Slack, Notion, Linear, and 500+ app integrations",
          allowedHosts: ["backend.composio.dev"],
          injectInSandbox: false,
        });
      } else {
        await createUserSecret({
          userId: auth.userId,
          name: "COMPOSIO_API_KEY",
          value: parsedBody.apiKey,
          description:
            "Composio API key for Gmail, Slack, Notion, Linear, and 500+ app integrations",
          allowedHosts: ["backend.composio.dev"],
          injectInSandbox: false,
        });
      }
      return Response.json({ ok: true });
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to save Composio API key",
        },
        { status: 500 },
      );
    }
  }

  try {
    const origin = new URL(req.url).origin;
    const callbackUrl = `${origin}/settings/connections?composio=connected&toolkit=${encodeURIComponent(
      parsedBody.toolkitSlug.toLowerCase(),
    )}`;

    const result = await authorizeComposioToolkitForUser({
      userId: auth.userId,
      toolkitSlug: parsedBody.toolkitSlug,
      callbackUrl,
    });

    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to initiate Composio authorization",
      },
      { status: 500 },
    );
  }
}
