import { z } from "zod";
import { requireAuthenticatedUser } from "@/app/api/sessions/_lib/session-context";
import { getAuthBaseURLFallback } from "@/lib/auth/host-config";
import {
  authorizeComposioToolkitForUser,
  ComposioAccountNotFoundError,
  ComposioApiError,
  disconnectComposioAccountForUser,
  normalizeComposioToolkitSlug,
  verifyComposioToolkitConnectionForUser,
} from "@/lib/mcp/composio";

const connectBodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("authorize"),
    toolkitSlug: z.string().trim().min(1).max(64),
  }),
  z.object({
    action: z.literal("verify"),
    toolkitSlug: z.string().trim().min(1).max(64),
  }),
  z.object({
    action: z.literal("disconnect"),
    connectedAccountId: z.string().trim().min(1).max(128),
  }),
]);

function resolveRequestOrigin(req: Request): string {
  const forwardedHost = req.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = req.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    ?.toLowerCase();

  if (forwardedHost) {
    const protocol =
      forwardedProto === "http" || forwardedProto === "https"
        ? forwardedProto
        : forwardedHost.startsWith("localhost") ||
            forwardedHost.startsWith("127.0.0.1")
          ? "http"
          : "https";
    try {
      return new URL(`${protocol}://${forwardedHost}`).origin;
    } catch {
      // Fall through to fallback resolution
    }
  }

  try {
    const reqOrigin = new URL(req.url).origin;
    const isLoopback =
      reqOrigin.startsWith("http://localhost") ||
      reqOrigin.startsWith("http://127.0.0.1");
    if (!isLoopback) {
      return reqOrigin;
    }
    const envBase = getAuthBaseURLFallback();
    if (envBase) {
      return new URL(envBase).origin;
    }
    return reqOrigin;
  } catch {
    const envBase = getAuthBaseURLFallback();
    if (envBase) {
      return new URL(envBase).origin;
    }
    return "http://localhost:3000";
  }
}

function toComposioErrorResponse(error: unknown, fallbackMessage: string) {
  if (error instanceof ComposioAccountNotFoundError) {
    return Response.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ComposioApiError) {
    return Response.json(
      {
        error: error.message,
        ...(error.requestId ? { requestId: error.requestId } : {}),
      },
      { status: error.statusCode },
    );
  }
  return Response.json(
    {
      error: error instanceof Error ? error.message : fallbackMessage,
    },
    { status: 500 },
  );
}

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
      return toComposioErrorResponse(
        error,
        "Failed to disconnect Composio account",
      );
    }
  }

  if (parsedBody.action === "verify") {
    try {
      const result = await verifyComposioToolkitConnectionForUser({
        userId: auth.userId,
        toolkitSlug: parsedBody.toolkitSlug,
      });
      return Response.json(result);
    } catch (error) {
      return toComposioErrorResponse(
        error,
        "Failed to verify Composio toolkit connection",
      );
    }
  }

  try {
    const normalizedSlug = normalizeComposioToolkitSlug(parsedBody.toolkitSlug);
    const origin = resolveRequestOrigin(req);
    const callbackUrl = `${origin}/settings/connections?composio=connected&toolkit=${encodeURIComponent(
      normalizedSlug,
    )}`;

    const result = await authorizeComposioToolkitForUser({
      userId: auth.userId,
      toolkitSlug: normalizedSlug,
      callbackUrl,
    });

    return Response.json(result);
  } catch (error) {
    return toComposioErrorResponse(
      error,
      "Failed to initiate Composio authorization",
    );
  }
}
