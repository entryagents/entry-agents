import { z } from "zod";
import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";
import {
  authorizeComposioToolkitForUser,
  ComposioAccountNotFoundError,
  disconnectComposioAccountForUser,
} from "@/lib/mcp/composio";

const connectBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("authorize"),
    toolkitSlug: z.string().trim().min(1).max(64),
  }),
  z.object({
    action: z.literal("disconnect"),
    connectedAccountId: z.string().trim().min(1).max(128),
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

  if (parsedBody.action === "disconnect") {
    try {
      const result = await disconnectComposioAccountForUser({
        userId: auth.userId,
        connectedAccountId: parsedBody.connectedAccountId,
      });
      return Response.json(result);
    } catch (error) {
      if (error instanceof ComposioAccountNotFoundError) {
        return Response.json({ error: error.message }, { status: 404 });
      }
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to disconnect Composio account",
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
