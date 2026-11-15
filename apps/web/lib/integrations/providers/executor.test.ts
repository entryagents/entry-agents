import { describe, expect, test } from "bun:test";
import { mergeCatalogAndConnectedApps } from "./executor-catalog";
import {
  buildExecutorAuthHeaders,
  buildExecutorMcpUrl,
  buildExecutorWhoamiUrl,
  parseExecutorErrorBody,
  parseExecutorUrlDefaults,
  parseMcpResponseBody,
} from "./executor-mcp";
import {
  buildExecutorAuthorizeUrl,
  createPkcePair,
  signExecutorOAuthState,
  verifyExecutorOAuthState,
} from "./executor-oauth";

describe("Executor MCP URL & protocol helpers", () => {
  test("never duplicates ?connection= and extracts embedded connection ID", () => {
    const parsed = parseExecutorUrlDefaults(
      "https://mcp.executor.sh/mcp?connection=conn_123",
    );
    expect(parsed.baseUrl).toBe("https://mcp.executor.sh/mcp");
    expect(parsed.connectionId).toBe("conn_123");

    const oauthUrl = buildExecutorMcpUrl({
      baseUrl: "https://mcp.executor.sh/mcp?connection=conn_123",
      authMode: "oauth",
      connectionId: "conn_456",
    });
    expect(oauthUrl).toBe("https://mcp.executor.sh/mcp?connection=conn_456");
  });

  test("strips ?connection= when authenticating with a PAT", () => {
    const patUrl = buildExecutorMcpUrl({
      baseUrl: "https://mcp.executor.sh/mcp?connection=conn_123",
      authMode: "pat",
      connectionId: "conn_456",
    });
    expect(patUrl).toBe("https://mcp.executor.sh/mcp");
  });

  test("builds /mcp/whoami URL and X-Executor-Organization header", () => {
    const auth = {
      token: "exp_test_token",
      authMode: "pat" as const,
      mcpUrl: "https://mcp.executor.sh/mcp?connection=conn_123",
      organization: "acme-org",
      source: "pat" as const,
    };
    expect(buildExecutorWhoamiUrl(auth)).toBe(
      "https://mcp.executor.sh/mcp/whoami",
    );
    expect(buildExecutorAuthHeaders(auth)).toEqual({
      Authorization: "Bearer exp_test_token",
      "X-Executor-Organization": "acme-org",
    });
  });

  test("parses Streamable HTTP SSE and JSON-RPC responses", () => {
    const sse = [
      "event: message",
      'data: {"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"search"}]}}',
      "",
    ].join("\n");
    const parsed = parseMcpResponseBody(sse, "text/event-stream");
    expect(parsed).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "search" }] },
    });
  });

  test("extracts Executor recovery instructions from McpForbidden error envelope", () => {
    const raw = JSON.stringify({
      error: {
        message: "McpForbidden (HTTP 403)",
        data: {
          code: "McpForbidden",
          status: 403,
          message: "This full-account token does not name an organization.",
          recovery: {
            action: "Send the X-Executor-Organization header, then retry.",
            instructions: "Provide organization slug or connect via OAuth.",
          },
        },
      },
    });
    const extracted = parseExecutorErrorBody(403, raw);
    expect(extracted.message).toBe(
      "This full-account token does not name an organization.",
    );
    expect(extracted.recovery?.action).toContain("X-Executor-Organization");
  });
});

describe("Executor OAuth PKCE + state helpers", () => {
  test("creates valid S256 PKCE verifier/challenge pairs and builds authorize URL", () => {
    const { codeVerifier, codeChallenge } = createPkcePair();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeChallenge).not.toContain("=");
    expect(codeChallenge).not.toBe(codeVerifier);

    const url = new URL(
      buildExecutorAuthorizeUrl({
        clientId: "client_abc",
        redirectUri:
          "https://entry-agents.dev/api/integrations/executor/oauth/callback",
        state: "state_xyz",
        codeChallenge,
        connectionId: "5850f2fd-331c-470e-a004-b3fb28e4f3e9",
      }),
    );
    expect(url.searchParams.get("client_id")).toBe("client_abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("resource")).toBe(
      "https://mcp.executor.sh/mcp?connection=5850f2fd-331c-470e-a004-b3fb28e4f3e9",
    );
  });

  test("signs and verifies HMAC OAuth state cookie payload and rejects tampering", () => {
    const prevSecret = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET =
      "test_secret_key_for_executor_oauth_signing";
    try {
      const signed = signExecutorOAuthState({
        userId: "user_1",
        state: "nonce_1",
        codeVerifier: "verifier_1",
        clientId: "client_1",
        redirectUri: "https://entry-agents.dev/callback",
        mcpUrl: "https://mcp.executor.sh/mcp",
        createdAt: Date.now(),
      });
      const verified = verifyExecutorOAuthState(signed);
      expect(verified?.userId).toBe("user_1");
      expect(verified?.state).toBe("nonce_1");
      expect(verifyExecutorOAuthState(`${signed}tampered`)).toBeNull();
    } finally {
      if (prevSecret === undefined) {
        delete process.env.BETTER_AUTH_SECRET;
      } else {
        process.env.BETTER_AUTH_SECRET = prevSecret;
      }
    }
  });
});

describe("Executor catalog merge, search, and pagination", () => {
  const catalog = {
    apps: [
      {
        slug: "gmail",
        name: "Gmail",
        description: "Email client",
        category: "email",
        iconUrl: "https://catalog.executor.sh/icons/gmail.svg",
        authKind: "OAuth 2.0",
      },
      {
        slug: "linear",
        name: "Linear",
        description: "Issue tracker",
        category: "project management",
        authKind: "OAuth 2.0",
      },
      {
        slug: "stripe",
        name: "Stripe",
        description: "Payments platform",
        category: "ecommerce",
        authKind: "API Key",
      },
    ],
    categories: [
      { name: "email", count: 1 },
      { name: "project management", count: 1 },
      { name: "ecommerce", count: 1 },
    ],
    fetchedAt: Date.now(),
    liveLoaded: true,
  };

  test("sorts connected apps first, includes private apps, filters, and paginates", () => {
    const connectedSlugs = new Map([
      ["stripe", { accountLabel: "prod" }],
      ["my-internal-app", { description: "Internal workspace CRM" }],
    ]);

    const all = mergeCatalogAndConnectedApps({
      catalog,
      connectedSlugs,
      limit: 10,
      offset: 0,
    });
    expect(all.catalogCount).toBe(3);
    expect(all.connectedCount).toBe(2);
    expect(all.items.slice(0, 2).map((i) => i.slug)).toEqual([
      "stripe",
      "my-internal-app",
    ]);

    const filtered = mergeCatalogAndConnectedApps({
      catalog,
      connectedSlugs,
      query: "gmail",
      category: "email",
    });
    expect(filtered.totalCount).toBe(1);
    expect(filtered.items[0]?.slug).toBe("gmail");
  });
});
