import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realComposioModule from "@/lib/mcp/composio";

let authenticatedUserId: string | null = "user_test_1";
let authorizeCalls: Array<{
  userId: string;
  toolkitSlug: string;
  callbackUrl: string;
}> = [];
let verifyCalls: Array<{ userId: string; toolkitSlug: string }> = [];
let authorizeError: Error | null = null;

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => {
    if (!authenticatedUserId) {
      return {
        ok: false as const,
        response: Response.json({ error: "Unauthorized" }, { status: 401 }),
      };
    }
    return {
      ok: true as const,
      userId: authenticatedUserId,
    };
  },
}));

mock.module("@/lib/mcp/composio", () => ({
  ...realComposioModule,
  authorizeComposioToolkitForUser: async (params: {
    userId: string;
    toolkitSlug: string;
    callbackUrl: string;
  }) => {
    authorizeCalls.push(params);
    if (authorizeError) {
      throw authorizeError;
    }
    return {
      ok: true as const,
      redirectUrl: "https://connect.composio.dev/gmail/oauth",
      connectionId: "ca_123",
    };
  },
  verifyComposioToolkitConnectionForUser: async (params: {
    userId: string;
    toolkitSlug: string;
  }) => {
    verifyCalls.push(params);
    return {
      ok: true as const,
      toolkitSlug: params.toolkitSlug,
      isConnected: true,
      status: "ACTIVE" as const,
      connectedAccountId: "ca_123",
    };
  },
}));

const { POST } = await import("./route");
const { ComposioApiError } = realComposioModule;

describe("POST /api/composio/connect", () => {
  beforeEach(() => {
    authenticatedUserId = "user_test_1";
    authorizeCalls = [];
    verifyCalls = [];
    authorizeError = null;
  });

  test("derives public callback URL from x-forwarded-proto and x-forwarded-host behind Vercel proxy", async () => {
    const req = new Request("http://127.0.0.1:3000/api/composio/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "app.entry-agents.dev",
      },
      body: JSON.stringify({
        action: "authorize",
        toolkitSlug: "Gmail",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(authorizeCalls).toEqual([
      {
        userId: "user_test_1",
        toolkitSlug: "gmail",
        callbackUrl:
          "https://app.entry-agents.dev/settings/connections?composio=connected&toolkit=gmail",
      },
    ]);
  });

  test("supports action: verify to confirm active OAuth connection after redirect", async () => {
    const req = new Request(
      "https://app.entry-agents.dev/api/composio/connect",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          toolkitSlug: "gmail",
        }),
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      isConnected: boolean;
      status: string;
    };
    expect(body).toMatchObject({
      ok: true,
      isConnected: true,
      status: "ACTIVE",
    });
    expect(verifyCalls).toEqual([
      { userId: "user_test_1", toolkitSlug: "gmail" },
    ]);
  });

  test("propagates ComposioApiError statusCode and requestId instead of masking as 500", async () => {
    authorizeError = new ComposioApiError(
      "Composio rejected COMPOSIO_API_KEY (401 Unauthorized).",
      401,
      "req_composio_99",
    );

    const req = new Request(
      "https://app.entry-agents.dev/api/composio/connect",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "authorize",
          toolkitSlug: "gmail",
        }),
      },
    );

    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string; requestId?: string };
    expect(body).toEqual({
      error: "Composio rejected COMPOSIO_API_KEY (401 Unauthorized).",
      requestId: "req_composio_99",
    });
  });
});
