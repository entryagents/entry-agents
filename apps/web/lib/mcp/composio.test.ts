import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import * as realDbComposioSessions from "@/lib/db/composio-sessions";

type FakeSession = {
  sessionId: string;
  mcp?: { url: string; headers?: Record<string, string> };
  toolkits?: (opts?: {
    toolkits?: string[];
    limit?: number;
    isConnected?: boolean;
    search?: string;
  }) => Promise<{
    items: Array<{
      slug: string;
      name?: string;
      logo?: string;
      connection?: {
        isActive?: boolean;
        connectedAccount?: { id?: string; status?: string };
      };
    }>;
  }>;
  authorize?: (
    toolkitSlug: string,
    options?: { callbackUrl?: string },
  ) => Promise<{ id?: string; redirectUrl?: string }>;
};

const useCalls: string[] = [];
const createCalls: string[] = [];
const deleteCalls: string[] = [];
const deletedSessionUserIds: string[] = [];
const authConfigCreateCalls: string[] = [];
const authConfigEnableCalls: string[] = [];
const linkCalls: Array<{
  userId: string;
  authConfigId: string;
  callbackUrl?: string;
}> = [];
let useShouldThrow = false;
let createShouldThrow = false;
let fakeToolkitsHandler: NonNullable<FakeSession["toolkits"]> = async () => ({
  items: [],
});
let fakeAuthorizeHandler: NonNullable<FakeSession["authorize"]> = async (
  slug,
  opts,
) => ({
  id: `conn_${slug}`,
  redirectUrl: `https://connect.composio.dev/${slug}?cb=${encodeURIComponent(opts?.callbackUrl ?? "")}`,
});
let fakeConnectedAccounts: Array<{ id: string; status?: string }> = [
  { id: "ca_owned_1", status: "ACTIVE" },
];
let fakeAuthConfigs: Array<{
  id: string;
  status?: string;
  isComposioManaged?: boolean;
  isEnabledForToolRouter?: boolean;
}> = [];

let useResult: FakeSession | undefined;
let createResult: FakeSession = {
  sessionId: "session_new",
  mcp: {
    url: "https://mcp.composio.dev/session_new",
    headers: { "x-api-key": "ak_test" },
  },
  toolkits: (opts) => fakeToolkitsHandler(opts),
  authorize: (slug, opts) => fakeAuthorizeHandler(slug, opts),
};

mock.module("@composio/core", () => ({
  Composio: class FakeComposio {
    authConfigs = {
      list: async () => ({
        items: fakeAuthConfigs,
        nextCursor: null,
      }),
      enable: async (nanoid: string) => {
        authConfigEnableCalls.push(nanoid);
        return { id: nanoid, status: "ENABLED" };
      },
      create: async (toolkit: string) => {
        authConfigCreateCalls.push(toolkit);
        return { id: `ac_created_${toolkit}`, toolkit };
      },
    };
    connectedAccounts = {
      list: async () => ({
        items: fakeConnectedAccounts,
        nextCursor: null,
      }),
      link: async (
        userId: string,
        authConfigId: string,
        options?: { callbackUrl?: string },
      ) => {
        linkCalls.push({
          userId,
          authConfigId,
          callbackUrl: options?.callbackUrl,
        });
        return {
          id: `ca_linked_${authConfigId}`,
          redirectUrl: `https://connect.composio.dev/linked/${authConfigId}`,
        };
      },
      delete: async (id: string) => {
        deleteCalls.push(id);
        return { success: true };
      },
    };
    use(sessionId: string) {
      useCalls.push(sessionId);
      if (useShouldThrow) {
        return Promise.reject(new Error("session expired"));
      }
      return Promise.resolve(useResult);
    }
    create(userId: string) {
      createCalls.push(userId);
      if (createShouldThrow) {
        return Promise.reject(new Error("network error"));
      }
      return Promise.resolve(createResult);
    }
  },
}));

const storedSessionIds = new Map<string, string>();
mock.module("@/lib/db/composio-sessions", () => ({
  ...realDbComposioSessions,
  getComposioSessionId: async (userId: string) =>
    storedSessionIds.get(userId) ?? null,
  setComposioSessionId: async (userId: string, sessionId: string) => {
    storedSessionIds.set(userId, sessionId);
  },
  deleteComposioSessionId: async (userId: string) => {
    deletedSessionUserIds.push(userId);
    storedSessionIds.delete(userId);
  },
}));

const {
  authorizeComposioToolkitForUser,
  ComposioAccountNotFoundError,
  ComposioApiError,
  disconnectComposioAccountForUser,
  getComposioMcpServerConfig,
  getConnectedComposioToolkitsForUser,
  listComposioToolkitsForUser,
  resolveComposioRuntimeContext,
  verifyComposioToolkitConnectionForUser,
} = await import("./composio");

describe("getComposioMcpServerConfig", () => {
  const originalApiKey = process.env.COMPOSIO_API_KEY;

  beforeEach(() => {
    useCalls.length = 0;
    createCalls.length = 0;
    deleteCalls.length = 0;
    deletedSessionUserIds.length = 0;
    authConfigCreateCalls.length = 0;
    authConfigEnableCalls.length = 0;
    linkCalls.length = 0;
    useShouldThrow = false;
    createShouldThrow = false;
    fakeConnectedAccounts = [{ id: "ca_owned_1", status: "ACTIVE" }];
    fakeAuthConfigs = [];
    fakeToolkitsHandler = async () => ({ items: [] });
    fakeAuthorizeHandler = async (slug, opts) => ({
      id: `conn_${slug}`,
      redirectUrl: `https://connect.composio.dev/${slug}?cb=${encodeURIComponent(opts?.callbackUrl ?? "")}`,
    });

    useResult = {
      sessionId: "session_existing",
      mcp: {
        url: "https://mcp.composio.dev/session_existing",
        headers: { "x-api-key": "ak_test" },
      },
      toolkits: (opts) => fakeToolkitsHandler(opts),
      authorize: (slug, opts) => fakeAuthorizeHandler(slug, opts),
    };
    createResult = {
      sessionId: "session_new",
      mcp: {
        url: "https://mcp.composio.dev/session_new",
        headers: { "x-api-key": "ak_test" },
      },
      toolkits: (opts) => fakeToolkitsHandler(opts),
      authorize: (slug, opts) => fakeAuthorizeHandler(slug, opts),
    };
    storedSessionIds.clear();
    process.env.COMPOSIO_API_KEY = "ak_test";
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.COMPOSIO_API_KEY;
    } else {
      process.env.COMPOSIO_API_KEY = originalApiKey;
    }
  });

  test("returns null when COMPOSIO_API_KEY is not set", async () => {
    delete process.env.COMPOSIO_API_KEY;
    const config = await getComposioMcpServerConfig("user_1");
    expect(config).toBeNull();
    expect(useCalls).toHaveLength(0);
    expect(createCalls).toHaveLength(0);
  });

  test("mints a fresh session and persists it when none is stored", async () => {
    const config = await getComposioMcpServerConfig("user_1");
    expect(createCalls).toEqual(["user_1"]);
    expect(useCalls).toHaveLength(0);
    expect(config).toEqual({
      name: "composio",
      transport: "http",
      url: "https://mcp.composio.dev/session_new",
      headers: { "x-api-key": "ak_test" },
    });
    expect(storedSessionIds.get("user_1")).toBe("session_new");
  });

  test("resumes a stored session instead of creating a new one", async () => {
    storedSessionIds.set("user_1", "session_existing");
    const config = await getComposioMcpServerConfig("user_1");
    expect(useCalls).toEqual(["session_existing"]);
    expect(createCalls).toHaveLength(0);
    expect(config).toEqual({
      name: "composio",
      transport: "http",
      url: "https://mcp.composio.dev/session_existing",
      headers: { "x-api-key": "ak_test" },
    });
  });

  test("falls back to minting a new session when the stored one can't be resumed", async () => {
    storedSessionIds.set("user_1", "session_stale");
    useShouldThrow = true;
    const config = await getComposioMcpServerConfig("user_1");
    expect(useCalls).toEqual(["session_stale"]);
    expect(createCalls).toEqual(["user_1"]);
    expect(deletedSessionUserIds).toContain("user_1");
    expect(config).toMatchObject({
      transport: "http",
      url: "https://mcp.composio.dev/session_new",
    });
    expect(storedSessionIds.get("user_1")).toBe("session_new");
  });

  test("returns null (never throws) when the SDK call fails entirely", async () => {
    createShouldThrow = true;
    const config = await getComposioMcpServerConfig("user_1");
    expect(config).toBeNull();
    expect(createCalls).toEqual(["user_1"]);
  });

  test("coalesces concurrent session creations for the same user into a single create call", async () => {
    const [ctxA, ctxB] = await Promise.all([
      resolveComposioRuntimeContext("user_concurrent"),
      resolveComposioRuntimeContext("user_concurrent"),
    ]);
    expect(createCalls).toEqual(["user_concurrent"]);
    expect(ctxA.mcpServer).toMatchObject({
      transport: "http",
      url: "https://mcp.composio.dev/session_new",
    });
    expect(ctxB.mcpServer).toMatchObject({
      transport: "http",
      url: "https://mcp.composio.dev/session_new",
    });
  });

  test("recreates a stale stored session when session.authorize fails with 404 session not found", async () => {
    storedSessionIds.set("user_1", "session_from_old_key");
    let attempts = 0;
    fakeAuthorizeHandler = async (slug) => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Error("Tool router session not found") as Error & {
          status?: number;
        };
        err.status = 404;
        throw err;
      }
      return {
        id: "conn_fresh_gmail",
        redirectUrl: `https://connect.composio.dev/${slug}/fresh`,
      };
    };

    const authorized = await authorizeComposioToolkitForUser({
      userId: "user_1",
      toolkitSlug: "gmail",
      callbackUrl:
        "https://entry.dev/settings/connections?composio=connected&toolkit=gmail",
    });

    expect(useCalls).toEqual(["session_from_old_key"]);
    expect(createCalls).toEqual(["user_1"]);
    expect(deletedSessionUserIds).toContain("user_1");
    expect(storedSessionIds.get("user_1")).toBe("session_new");
    expect(authorized).toEqual({
      ok: true,
      redirectUrl: "https://connect.composio.dev/gmail/fresh",
      connectionId: "conn_fresh_gmail",
    });
  });

  test("auto-provisions Composio-managed auth config and falls back to connectedAccounts.link when session.authorize fails with missing auth config", async () => {
    fakeAuthorizeHandler = async () => {
      const err = new Error(
        "No auth config enabled for tool router for toolkit gmail",
      ) as Error & { status?: number };
      err.status = 400;
      throw err;
    };

    const authorized = await authorizeComposioToolkitForUser({
      userId: "user_1",
      toolkitSlug: "gmail",
      callbackUrl:
        "https://entry.dev/settings/connections?composio=connected&toolkit=gmail",
    });

    expect(authConfigCreateCalls).toEqual(["gmail"]);
    expect(linkCalls).toEqual([
      {
        userId: "user_1",
        authConfigId: "ac_created_gmail",
        callbackUrl:
          "https://entry.dev/settings/connections?composio=connected&toolkit=gmail",
      },
    ]);
    expect(authorized).toEqual({
      ok: true,
      redirectUrl: "https://connect.composio.dev/linked/ac_created_gmail",
      connectionId: "ca_linked_ac_created_gmail",
    });
  });

  test("surfaces 401 ComposioApiError and scrubs API key from error text", async () => {
    fakeAuthorizeHandler = async () => {
      const err = new Error("Unauthorized key ak_test rejected") as Error & {
        status?: number;
      };
      err.status = 401;
      throw err;
    };

    let caught: unknown;
    try {
      await authorizeComposioToolkitForUser({
        userId: "user_1",
        toolkitSlug: "gmail",
        callbackUrl: "https://entry.dev/settings/connections",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ComposioApiError);
    expect((caught as InstanceType<typeof ComposioApiError>).statusCode).toBe(
      401,
    );
    expect((caught as Error).message).not.toContain("ak_test");
  });

  test("verifies toolkit connection status via session.toolkits and connectedAccounts fallback", async () => {
    fakeToolkitsHandler = async () => ({
      items: [
        {
          slug: "gmail",
          name: "Gmail",
          connection: {
            isActive: true,
            connectedAccount: { id: "ca_gmail_live", status: "ACTIVE" },
          },
        },
      ],
    });

    const verified = await verifyComposioToolkitConnectionForUser({
      userId: "user_1",
      toolkitSlug: "gmail",
    });
    expect(verified).toEqual({
      ok: true,
      toolkitSlug: "gmail",
      isConnected: true,
      status: "ACTIVE",
      connectedAccountId: "ca_gmail_live",
    });
  });

  test("lists popular toolkits plus connected non-preset integrations and searches 500+ catalog", async () => {
    fakeToolkitsHandler = async (opts) => {
      if (opts?.search === "stripe") {
        return {
          items: [
            {
              slug: "stripe",
              name: "Stripe",
              logo: "https://cdn.example/stripe.png",
              connection: { isActive: false },
            },
          ],
        };
      }
      if (opts?.isConnected) {
        return {
          items: [
            {
              slug: "gmail",
              name: "Gmail",
              connection: {
                isActive: true,
                connectedAccount: { id: "ca_gmail", status: "ACTIVE" },
              },
            },
            {
              slug: "airtable",
              name: "Airtable",
              logo: "https://cdn.example/airtable.png",
              connection: {
                isActive: true,
                connectedAccount: { id: "ca_airtable", status: "ACTIVE" },
              },
            },
          ],
        };
      }
      return { items: [] };
    };

    const defaultRes = await listComposioToolkitsForUser("user_1");
    expect(defaultRes.configured).toBe(true);
    expect(
      defaultRes.toolkits.some((t) => t.slug === "airtable" && t.isConnected),
    ).toBe(true);
    expect(
      defaultRes.toolkits.find((t) => t.slug === "gmail")?.connectedAccountId,
    ).toBe("ca_gmail");

    const searchRes = await listComposioToolkitsForUser("user_1", {
      search: "stripe",
    });
    expect(searchRes.toolkits).toHaveLength(1);
    expect(searchRes.toolkits[0]).toMatchObject({
      slug: "stripe",
      name: "Stripe",
      category: "Integration",
      logo: "https://cdn.example/stripe.png",
    });

    const connectedSlugs = await getConnectedComposioToolkitsForUser("user_1");
    expect(connectedSlugs).toEqual(["airtable", "gmail"]);
  });

  test("disconnects an owned connected account and rejects unowned IDs", async () => {
    await expect(
      disconnectComposioAccountForUser({
        userId: "user_1",
        connectedAccountId: "ca_not_owned",
      }),
    ).rejects.toBeInstanceOf(ComposioAccountNotFoundError);
    expect(deleteCalls).toHaveLength(0);

    const res = await disconnectComposioAccountForUser({
      userId: "user_1",
      connectedAccountId: "ca_owned_1",
    });
    expect(res).toEqual({ ok: true });
    expect(deleteCalls).toEqual(["ca_owned_1"]);
  });
});
