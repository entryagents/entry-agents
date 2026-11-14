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
let useShouldThrow = false;
let createShouldThrow = false;
let fakeToolkitsHandler: NonNullable<FakeSession["toolkits"]> = async () => ({
  items: [],
});
let fakeConnectedAccounts: Array<{ id: string }> = [{ id: "ca_owned_1" }];

let useResult: FakeSession | undefined;
let createResult: FakeSession = {
  sessionId: "session_new",
  mcp: {
    url: "https://mcp.composio.dev/session_new",
    headers: { "x-api-key": "ak_test" },
  },
  toolkits: (opts) => fakeToolkitsHandler(opts),
};

mock.module("@composio/core", () => ({
  Composio: class FakeComposio {
    connectedAccounts = {
      list: async () => ({
        items: fakeConnectedAccounts,
        nextCursor: null,
      }),
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
}));

const {
  ComposioAccountNotFoundError,
  disconnectComposioAccountForUser,
  getComposioMcpServerConfig,
  getConnectedComposioToolkitsForUser,
  listComposioToolkitsForUser,
} = await import("./composio");

describe("getComposioMcpServerConfig", () => {
  const originalApiKey = process.env.COMPOSIO_API_KEY;

  beforeEach(() => {
    useCalls.length = 0;
    createCalls.length = 0;
    deleteCalls.length = 0;
    useShouldThrow = false;
    createShouldThrow = false;
    fakeConnectedAccounts = [{ id: "ca_owned_1" }];
    fakeToolkitsHandler = async () => ({ items: [] });

    useResult = {
      sessionId: "session_existing",
      mcp: {
        url: "https://mcp.composio.dev/session_existing",
        headers: { "x-api-key": "ak_test" },
      },
      toolkits: (opts) => fakeToolkitsHandler(opts),
    };
    createResult = {
      sessionId: "session_new",
      mcp: {
        url: "https://mcp.composio.dev/session_new",
        headers: { "x-api-key": "ak_test" },
      },
      toolkits: (opts) => fakeToolkitsHandler(opts),
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
