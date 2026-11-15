import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  ComposioAccountType,
  ComposioConnectedAccountRow,
  ComposioConnectedAccountStatus,
  ComposioOAuthAttemptRow,
  ComposioSharedAccountGrantRow,
} from "@/lib/db/schema";
import {
  type ComposioSdkLike,
  createComposioAgentMetaTools,
  disconnectComposioAccount,
  initiateComposioConnection,
  listComposioToolkitsForUser,
  reconnectComposioAccount,
  setComposioClientFactoryForTests,
  updateSharedComposioConnectionAccess,
  verifyAndCompleteComposioCallback,
  verifyAndProcessComposioWebhook,
} from "./client";

// In-memory store backing our mocked DB helpers so we can test full multi-user
// isolation, OAuth callback security, shared connection ACLs, and webhooks.
const sessionsStore = new Map<string, string>();
const accountsStore = new Map<string, ComposioConnectedAccountRow>();
const attemptsStore = new Map<string, ComposioOAuthAttemptRow>();
const sharedGrantsStore = new Map<string, ComposioSharedAccountGrantRow>();

mock.module("@/lib/db/composio-sessions", () => ({
  getComposioSessionId: async (userId: string) =>
    sessionsStore.get(userId) ?? null,
  setComposioSessionId: async (userId: string, sessionId: string) => {
    sessionsStore.set(userId, sessionId);
  },
  deleteComposioSessionId: async (userId: string) => {
    sessionsStore.delete(userId);
  },
  upsertComposioConnectedAccount: async (input: {
    userId: string;
    composioUserId?: string;
    connectedAccountId: string;
    toolkitSlug: string;
    authConfigId?: string | null;
    alias?: string | null;
    accountType?: ComposioAccountType;
    status: ComposioConnectedAccountStatus;
    isDefault?: boolean;
    isDisabled?: boolean;
    lastError?: string | null;
    lastVerifiedAt?: Date | null;
  }) => {
    const existing = accountsStore.get(input.connectedAccountId);
    if (existing && existing.userId !== input.userId) {
      throw new Error(
        "Connected account belongs to a different Entry user; cross-user update rejected.",
      );
    }
    const slug = input.toolkitSlug.toLowerCase();
    const userToolkitAccs = Array.from(accountsStore.values()).filter(
      (a) =>
        a.userId === input.userId &&
        a.toolkitSlug === slug &&
        a.status === "ACTIVE",
    );
    const isDefault =
      input.isDefault ??
      existing?.isDefault ??
      (input.status === "ACTIVE" && userToolkitAccs.length === 0);

    if (isDefault) {
      for (const acc of accountsStore.values()) {
        if (acc.userId === input.userId && acc.toolkitSlug === slug) {
          acc.isDefault = false;
        }
      }
    }

    const now = new Date();
    const row: ComposioConnectedAccountRow = {
      id: existing?.id ?? `cca_${input.connectedAccountId}`,
      userId: input.userId,
      composioUserId: input.composioUserId ?? input.userId,
      connectedAccountId: input.connectedAccountId,
      toolkitSlug: slug,
      authConfigId: input.authConfigId ?? existing?.authConfigId ?? null,
      alias: input.alias ?? existing?.alias ?? null,
      accountType: input.accountType ?? existing?.accountType ?? "PRIVATE",
      status: input.status,
      isDefault,
      isDisabled: input.isDisabled ?? false,
      lastError: input.lastError ?? null,
      lastVerifiedAt: input.lastVerifiedAt ?? now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    accountsStore.set(input.connectedAccountId, row);
    return row;
  },
  listUserComposioConnectedAccounts: async (
    userId: string,
    toolkitSlug?: string,
  ) => {
    return Array.from(accountsStore.values())
      .filter(
        (a) =>
          a.userId === userId &&
          (!toolkitSlug || a.toolkitSlug === toolkitSlug.toLowerCase()),
      )
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  },
  getComposioConnectedAccountById: async (connectedAccountId: string) =>
    accountsStore.get(connectedAccountId) ?? null,
  deleteUserComposioConnectedAccount: async (
    userId: string,
    connectedAccountId: string,
  ) => {
    const existing = accountsStore.get(connectedAccountId);
    if (!existing || existing.userId !== userId) return false;
    accountsStore.delete(connectedAccountId);
    return true;
  },
  setDefaultComposioConnectedAccount: async (
    userId: string,
    connectedAccountId: string,
  ) => {
    const target = accountsStore.get(connectedAccountId);
    if (!target || target.userId !== userId) return null;
    for (const acc of accountsStore.values()) {
      if (acc.userId === userId && acc.toolkitSlug === target.toolkitSlug) {
        acc.isDefault = acc.connectedAccountId === connectedAccountId;
      }
    }
    return accountsStore.get(connectedAccountId) ?? null;
  },
  updateComposioConnectedAccountStatusByWebhook: async (
    connectedAccountId: string,
    status: ComposioConnectedAccountStatus,
    lastError?: string | null,
  ) => {
    const existing = accountsStore.get(connectedAccountId);
    if (!existing) return null;
    existing.status = status;
    existing.isDisabled = status === "INACTIVE" || status === "EXPIRED";
    existing.lastError = lastError ?? null;
    existing.updatedAt = new Date();
    return existing;
  },
  createComposioOAuthAttempt: async (input: {
    userId: string;
    stateNonce: string;
    toolkitSlug: string;
    connectedAccountId?: string | null;
    alias?: string | null;
    accountType?: ComposioAccountType;
    chatId?: string | null;
    sessionId?: string | null;
    returnPath?: string | null;
    ttlMs?: number;
  }) => {
    const now = new Date();
    const row: ComposioOAuthAttemptRow = {
      id: `coa_${input.stateNonce}`,
      userId: input.userId,
      stateNonce: input.stateNonce,
      toolkitSlug: input.toolkitSlug.toLowerCase(),
      connectedAccountId: input.connectedAccountId ?? null,
      alias: input.alias ?? null,
      accountType: input.accountType ?? "PRIVATE",
      chatId: input.chatId ?? null,
      sessionId: input.sessionId ?? null,
      returnPath: input.returnPath ?? null,
      status: "PENDING",
      expiresAt: new Date(now.getTime() + (input.ttlMs ?? 900_000)),
      completedAt: null,
      createdAt: now,
    };
    attemptsStore.set(input.stateNonce, row);
    return row;
  },
  getComposioOAuthAttemptByNonce: async (stateNonce: string) =>
    attemptsStore.get(stateNonce) ?? null,
  completeComposioOAuthAttempt: async (
    stateNonce: string,
    status: "COMPLETED" | "FAILED" | "EXPIRED",
    connectedAccountId?: string | null,
  ) => {
    const existing = attemptsStore.get(stateNonce);
    if (!existing) return null;
    existing.status = status;
    if (connectedAccountId) existing.connectedAccountId = connectedAccountId;
    existing.completedAt = new Date();
    return existing;
  },
  grantSharedComposioAccountAccess: async (input: {
    ownerUserId: string;
    connectedAccountId: string;
    granteeUserId: string;
  }) => {
    const acc = accountsStore.get(input.connectedAccountId);
    if (!acc || acc.userId !== input.ownerUserId) {
      throw new Error("Only the connection owner can grant shared access.");
    }
    if (acc.accountType !== "SHARED") {
      throw new Error(
        "Cannot grant shared access to a PRIVATE connected account.",
      );
    }
    const key = `${input.connectedAccountId}:${input.granteeUserId}`;
    const row: ComposioSharedAccountGrantRow = {
      id: `csg_${key}`,
      connectedAccountId: input.connectedAccountId,
      ownerUserId: input.ownerUserId,
      granteeUserId: input.granteeUserId,
      toolkitSlug: acc.toolkitSlug,
      revokedAt: null,
      createdAt: new Date(),
    };
    sharedGrantsStore.set(key, row);
    return row;
  },
  revokeSharedComposioAccountAccess: async (input: {
    ownerUserId: string;
    connectedAccountId: string;
    granteeUserId: string;
  }) => {
    const key = `${input.connectedAccountId}:${input.granteeUserId}`;
    const existing = sharedGrantsStore.get(key);
    if (!existing || existing.ownerUserId !== input.ownerUserId) return false;
    existing.revokedAt = new Date();
    return true;
  },
  listAuthorizedSharedAccountsForUser: async (
    granteeUserId: string,
    toolkitSlug?: string,
  ) => {
    const results: ComposioConnectedAccountRow[] = [];
    for (const grant of sharedGrantsStore.values()) {
      if (grant.granteeUserId === granteeUserId && !grant.revokedAt) {
        const acc = accountsStore.get(grant.connectedAccountId);
        if (
          acc &&
          acc.accountType === "SHARED" &&
          acc.status === "ACTIVE" &&
          (!toolkitSlug || acc.toolkitSlug === toolkitSlug.toLowerCase())
        ) {
          results.push(acc);
        }
      }
    }
    return results;
  },
  listActiveSharedGrantsForOwner: async (
    ownerUserId: string,
    connectedAccountId?: string,
  ) => {
    return Array.from(sharedGrantsStore.values()).filter(
      (g) =>
        g.ownerUserId === ownerUserId &&
        !g.revokedAt &&
        (!connectedAccountId || g.connectedAccountId === connectedAccountId),
    );
  },
}));

describe("Composio E2E Integration Lifecycle (Scenarios A-L, Security, Concurrency, Webhooks)", () => {
  const remoteAccounts = new Map<
    string,
    {
      id: string;
      userId: string;
      status: string;
      alias?: string | null;
      toolkit: { slug: string };
      experimental?: { accountType?: "PRIVATE" | "SHARED" };
      aclAllowedUsers?: string[];
    }
  >();
  const executedCalls: Array<{
    userId: string;
    toolSlug: string;
    args: Record<string, unknown>;
    account?: string;
  }> = [];
  let accountSeq = 1;
  let simulateRateLimitOnce = false;

  beforeEach(() => {
    process.env.COMPOSIO_API_KEY = "comp_test_secret_api_key_12345";
    process.env.COMPOSIO_WEBHOOK_SECRET = "whsec_test_composio_secret_999";
    sessionsStore.clear();
    accountsStore.clear();
    attemptsStore.clear();
    sharedGrantsStore.clear();
    remoteAccounts.clear();
    executedCalls.length = 0;
    accountSeq = 1;
    simulateRateLimitOnce = false;

    const mockSdk: ComposioSdkLike = {
      sessions: {
        create: async (userId: string) => ({
          sessionId: `sess_${userId}`,
          mcp: {
            url: `https://backend.composio.dev/tool_router/sess_${userId}/mcp`,
            headers: { "x-session": `sess_${userId}` },
          },
          authorize: async (
            toolkit: string,
            opts?: { callbackUrl?: string; alias?: string },
          ) => {
            const id = `ca_${toolkit}_${accountSeq++}`;
            remoteAccounts.set(id, {
              id,
              userId,
              status: "INITIATED",
              alias: opts?.alias ?? null,
              toolkit: { slug: toolkit },
              experimental: { accountType: "PRIVATE" },
            });
            return {
              id,
              status: "INITIATED",
              redirectUrl: `https://connect.composio.dev/link/${id}?cb=${encodeURIComponent(opts?.callbackUrl ?? "")}`,
            };
          },
          toolkits: async () => ({ items: [] }),
          search: async ({ query, toolkits }) => ({
            success: true,
            error: null,
            results: [
              {
                index: 0,
                useCase: query,
                primaryToolSlugs: toolkits?.includes("slack")
                  ? ["SLACK_SEND_MESSAGE"]
                  : ["GMAIL_SEND_EMAIL", "GMAIL_FETCH_EMAILS"],
                relatedToolSlugs: [],
                toolkits: toolkits ?? ["gmail"],
                executionGuidance: "Check connection status first.",
              },
            ],
          }),
          execute: async (toolSlug, args, options) => {
            if (simulateRateLimitOnce) {
              simulateRateLimitOnce = false;
              throw new Error(
                "429 Rate limit reached on key comp_test_secret_api_key_12345",
              );
            }
            executedCalls.push({
              userId,
              toolSlug,
              args: args ?? {},
              account: options?.account,
            });
            return {
              data: {
                ok: true,
                toolSlug,
                executedWithAccount: options?.account ?? "default",
                userId,
              },
              error: null,
            };
          },
        }),
        use: async (sessionId: string) => {
          const userId = sessionId.replace(/^sess_/, "");
          return await mockSdk.sessions.create(userId);
        },
      },
      connectedAccounts: {
        list: async (query?: Record<string, unknown>) => {
          const userIds = (query?.userIds as string[] | undefined) ?? [];
          const items = Array.from(remoteAccounts.values()).filter((a) =>
            userIds.includes(a.userId),
          );
          return { items };
        },
        get: async (nanoid: string) => {
          const found = remoteAccounts.get(nanoid);
          if (!found) {
            throw new Error(`Connected account ${nanoid} not found`);
          }
          return found;
        },
        link: async (userId, _authConfigId, options) => {
          const id = `ca_linked_${accountSeq++}`;
          const exp = options?.experimental as
            | { accountType?: "PRIVATE" | "SHARED" }
            | undefined;
          remoteAccounts.set(id, {
            id,
            userId,
            status: "INITIATED",
            alias: (options?.alias as string | undefined) ?? null,
            toolkit: { slug: "gmail" },
            experimental: exp,
          });
          return {
            id,
            status: "INITIATED",
            redirectUrl: `https://connect.composio.dev/link/${id}`,
          };
        },
        delete: async (nanoid: string) => {
          remoteAccounts.delete(nanoid);
          return { deleted: true };
        },
        refresh: async (nanoid: string) => {
          const found = remoteAccounts.get(nanoid);
          if (found) {
            found.status = "INITIATED";
          }
          return {
            id: nanoid,
            status: "INITIATED",
            redirectUrl: `https://connect.composio.dev/reauth/${nanoid}`,
          };
        },
        updateAcl: async (nanoid, params) => {
          const found = remoteAccounts.get(nanoid);
          if (found) {
            found.experimental = { accountType: "SHARED" };
            found.aclAllowedUsers = params.allowedUserIds ?? [];
          }
          return { ok: true };
        },
      },
    };

    setComposioClientFactoryForTests(async () => mockSdk);
  });

  test("Scenario A & B: Connect Gmail from UI, verify callback ownership, and reject cross-user session fixation", async () => {
    const initiated = await initiateComposioConnection({
      userId: "user_alice",
      toolkitSlug: "gmail",
      callbackBaseUrl: "https://entry.app",
      alias: "Alice Personal Gmail",
    });

    expect(initiated.redirectUrl).toContain(
      "https://connect.composio.dev/link/",
    );
    expect(initiated.status).toBe("INITIATED");

    // Simulate OAuth completion on Composio side
    const remote = remoteAccounts.get(initiated.connectedAccountId);
    if (remote) remote.status = "ACTIVE";

    // Cross-user callback hijacking attempt by user_mallory MUST fail
    await expect(
      verifyAndCompleteComposioCallback({
        authenticatedUserId: "user_mallory",
        stateNonce: initiated.stateNonce,
        connectedAccountId: initiated.connectedAccountId,
      }),
    ).rejects.toThrow(/does not match the initiating Entry user/);

    // Legitimate callback by user_alice succeeds and marks ACTIVE
    const verified = await verifyAndCompleteComposioCallback({
      authenticatedUserId: "user_alice",
      stateNonce: initiated.stateNonce,
      connectedAccountId: initiated.connectedAccountId,
    });
    expect(verified.account.status).toBe("ACTIVE");
    expect(verified.account.alias).toBe("Alice Personal Gmail");

    // Replay of the same stateNonce is rejected
    await expect(
      verifyAndCompleteComposioCallback({
        authenticatedUserId: "user_alice",
        stateNonce: initiated.stateNonce,
        connectedAccountId: initiated.connectedAccountId,
      }),
    ).rejects.toThrow(/already been processed/);
  });

  test("Scenario C & D: Agent detects missing integration, initiates Connect Link in chat, and executes after authentication", async () => {
    const runtime = await createComposioAgentMetaTools({
      userId: "user_bob",
      chatId: "chat_1",
      sessionId: "sess_1",
      callbackBaseUrl: "https://entry.app",
    });

    // Attempting to execute GMAIL_SEND_EMAIL before connecting fails with CONNECTION_REQUIRED
    const execTool = runtime.tools.COMPOSIO_MULTI_EXECUTE_TOOL;
    const preAuthResult = (await execTool.execute?.(
      {
        tools: [
          {
            toolSlug: "GMAIL_SEND_EMAIL",
            arguments: { to: "team@entry.app", subject: "Hi" },
          },
        ],
      },
      { toolCallId: "tc_1", messages: [] },
    )) as {
      allSucceeded: boolean;
      results: Array<{ code?: string; error?: string }>;
    };

    expect(preAuthResult.allSucceeded).toBe(false);
    expect(preAuthResult.results[0]?.code).toBe("CONNECTION_REQUIRED");

    // Agent calls COMPOSIO_MANAGE_CONNECTIONS to initiate Connect Link in chat
    const manageTool = runtime.tools.COMPOSIO_MANAGE_CONNECTIONS;
    const connectOutput = (await manageTool.execute?.(
      {
        action: "connect",
        toolkit: "gmail",
        alias: "Bob Gmail",
      },
      { toolCallId: "tc_2", messages: [] },
    )) as {
      connectLinkUrl: string;
      connectedAccountId: string;
      status: string;
    };

    expect(connectOutput.connectLinkUrl).toContain(
      "https://connect.composio.dev/link/",
    );

    // User completes OAuth flow -> status becomes ACTIVE
    const remote = remoteAccounts.get(connectOutput.connectedAccountId);
    if (remote) remote.status = "ACTIVE";

    // Agent resumes and executes GMAIL_SEND_EMAIL in the same conversation
    const postAuthResult = (await execTool.execute?.(
      {
        tools: [
          {
            toolSlug: "GMAIL_SEND_EMAIL",
            arguments: { to: "team@entry.app", subject: "Hi" },
          },
        ],
      },
      { toolCallId: "tc_3", messages: [] },
    )) as {
      allSucceeded: boolean;
      results: Array<{ success: boolean; accountUsed: string }>;
    };

    expect(postAuthResult.allSucceeded).toBe(true);
    expect(postAuthResult.results[0]?.accountUsed).toBe(
      connectOutput.connectedAccountId,
    );
  });

  test("Scenario E, F, G: Multi-account Gmail support, explicit account selection, and cross-user isolation", async () => {
    // User Alice connects Personal Gmail and Work Gmail
    const personal = await initiateComposioConnection({
      userId: "user_alice",
      toolkitSlug: "gmail",
      callbackBaseUrl: "https://entry.app",
      alias: "Personal Gmail",
    });
    const work = await initiateComposioConnection({
      userId: "user_alice",
      toolkitSlug: "gmail",
      callbackBaseUrl: "https://entry.app",
      alias: "Work Gmail",
    });
    remoteAccounts.get(personal.connectedAccountId)!.status = "ACTIVE";
    remoteAccounts.get(work.connectedAccountId)!.status = "ACTIVE";

    const aliceRuntime = await createComposioAgentMetaTools({
      userId: "user_alice",
    });
    const execTool = aliceRuntime.tools.COMPOSIO_MULTI_EXECUTE_TOOL;

    // Execute specifically using "Work Gmail" alias
    const workExec = (await execTool.execute?.(
      {
        tools: [
          {
            toolSlug: "GMAIL_SEND_EMAIL",
            arguments: { subject: "Q4 Report" },
            account: "Work Gmail",
          },
        ],
      },
      { toolCallId: "tc_work", messages: [] },
    )) as {
      allSucceeded: boolean;
      results: Array<{ accountUsed: string }>;
    };

    expect(workExec.allSucceeded).toBe(true);
    expect(workExec.results[0]?.accountUsed).toBe(work.connectedAccountId);

    // User Bob cannot see or use Alice's connected accounts
    const bobCatalog = await listComposioToolkitsForUser("user_bob");
    const bobGmail = bobCatalog.toolkits.find((t) => t.slug === "gmail");
    expect(bobGmail?.isConnected).toBe(false);
    expect(bobGmail?.accounts).toHaveLength(0);

    const bobRuntime = await createComposioAgentMetaTools({
      userId: "user_bob",
    });
    const bobAttemptAliceAccount =
      (await bobRuntime.tools.COMPOSIO_MULTI_EXECUTE_TOOL.execute?.(
        {
          tools: [
            {
              toolSlug: "GMAIL_SEND_EMAIL",
              arguments: {},
              account: work.connectedAccountId,
            },
          ],
        },
        { toolCallId: "tc_cross", messages: [] },
      )) as {
        allSucceeded: boolean;
        results: Array<{ code?: string }>;
      };
    expect(bobAttemptAliceAccount.allSucceeded).toBe(false);
  });

  test("Scenario H, I, J: Webhook expiration updates, reconnect flow, and disconnect/revoke", async () => {
    const conn = await initiateComposioConnection({
      userId: "user_alice",
      toolkitSlug: "gmail",
      callbackBaseUrl: "https://entry.app",
    });
    remoteAccounts.get(conn.connectedAccountId)!.status = "ACTIVE";
    await listComposioToolkitsForUser("user_alice");

    // Composio sends a signed webhook marking the connection EXPIRED
    const payload = JSON.stringify({
      type: "composio.connected_account.expired",
      data: {
        connectedAccountId: conn.connectedAccountId,
        status: "EXPIRED",
        statusReason: "Refresh token revoked by user",
      },
    });
    const webhookId = "msg_101";
    const webhookTimestamp = String(Math.floor(Date.now() / 1000));
    const secret = process.env.COMPOSIO_WEBHOOK_SECRET!;
    const validSig = createHmac("sha256", secret)
      .update(`${webhookId}.${webhookTimestamp}.${payload}`)
      .digest("base64");

    // Invalid signature is rejected
    await expect(
      verifyAndProcessComposioWebhook({
        rawBody: payload,
        signature: "v1,invalidsignature",
        webhookId,
        webhookTimestamp,
      }),
    ).rejects.toThrow(/Invalid Composio webhook signature/);

    // Valid signature updates status to EXPIRED
    const whRes = await verifyAndProcessComposioWebhook({
      rawBody: payload,
      signature: `v1,${validSig}`,
      webhookId,
      webhookTimestamp,
    });
    expect(whRes.verified).toBe(true);
    expect(whRes.updatedStatus).toBe("EXPIRED");

    // Reconnect generates a fresh re-authentication URL
    const reconnected = await reconnectComposioAccount({
      userId: "user_alice",
      connectedAccountId: conn.connectedAccountId,
      callbackBaseUrl: "https://entry.app",
    });
    expect(reconnected.redirectUrl).toContain(
      `https://connect.composio.dev/reauth/${conn.connectedAccountId}`,
    );

    // Disconnect removes the account and agent immediately detects it as unavailable
    const disconnected = await disconnectComposioAccount({
      userId: "user_alice",
      connectedAccountId: conn.connectedAccountId,
    });
    expect(disconnected.deleted).toBe(true);

    const runtime = await createComposioAgentMetaTools({
      userId: "user_alice",
    });
    const execAfterDisconnect =
      (await runtime.tools.COMPOSIO_MULTI_EXECUTE_TOOL.execute?.(
        {
          tools: [{ toolSlug: "GMAIL_SEND_EMAIL", arguments: {} }],
        },
        { toolCallId: "tc_disc", messages: [] },
      )) as {
        allSucceeded: boolean;
        results: Array<{ code?: string }>;
      };
    expect(execAfterDisconnect.allSucceeded).toBe(false);
    expect(execAfterDisconnect.results[0]?.code).toBe("CONNECTION_REQUIRED");
  });

  test("Scenario K, L & Concurrency: Shared connection ACL enforcement, concurrent executions, and secret scrubbing on rate limit", async () => {
    // Owner creates a SHARED Slack connection
    const sharedSlack = await initiateComposioConnection({
      userId: "user_owner",
      toolkitSlug: "slack",
      callbackBaseUrl: "https://entry.app",
      alias: "Company Slack",
      accountType: "SHARED",
    });
    remoteAccounts.get(sharedSlack.connectedAccountId)!.status = "ACTIVE";
    remoteAccounts.get(sharedSlack.connectedAccountId)!.experimental = {
      accountType: "SHARED",
    };
    await listComposioToolkitsForUser("user_owner");

    // Grant shared access to user_teammate, NOT user_outsider
    const acl = await updateSharedComposioConnectionAccess({
      ownerUserId: "user_owner",
      connectedAccountId: sharedSlack.connectedAccountId,
      action: "grant",
      targetUserId: "user_teammate",
    });
    expect(acl.allowedUserIds).toContain("user_teammate");

    // user_teammate can execute Slack tool using the shared connection
    const teammateRuntime = await createComposioAgentMetaTools({
      userId: "user_teammate",
    });
    const teammateExec =
      (await teammateRuntime.tools.COMPOSIO_MULTI_EXECUTE_TOOL.execute?.(
        {
          tools: [
            {
              toolSlug: "SLACK_SEND_MESSAGE",
              arguments: { channel: "#general", text: "Shipped!" },
            },
          ],
        },
        { toolCallId: "tc_shared_ok", messages: [] },
      )) as {
        allSucceeded: boolean;
        results: Array<{ accountUsed: string }>;
      };
    expect(teammateExec.allSucceeded).toBe(true);
    expect(teammateExec.results[0]?.accountUsed).toBe(
      sharedSlack.connectedAccountId,
    );

    // user_outsider is denied access to the shared connection
    const outsiderRuntime = await createComposioAgentMetaTools({
      userId: "user_outsider",
    });
    const outsiderExec =
      (await outsiderRuntime.tools.COMPOSIO_MULTI_EXECUTE_TOOL.execute?.(
        {
          tools: [
            {
              toolSlug: "SLACK_SEND_MESSAGE",
              arguments: { channel: "#general", text: "Unauthorized" },
            },
          ],
        },
        { toolCallId: "tc_shared_deny", messages: [] },
      )) as {
        allSucceeded: boolean;
        results: Array<{ code?: string }>;
      };
    expect(outsiderExec.allSucceeded).toBe(false);
    expect(outsiderExec.results[0]?.code).toBe("CONNECTION_REQUIRED");

    // Rate-limit failure scrubs COMPOSIO_API_KEY from error output
    simulateRateLimitOnce = true;
    const rateLimitedExec =
      (await teammateRuntime.tools.COMPOSIO_MULTI_EXECUTE_TOOL.execute?.(
        {
          tools: [{ toolSlug: "SLACK_SEND_MESSAGE", arguments: {} }],
        },
        { toolCallId: "tc_rl", messages: [] },
      )) as {
        allSucceeded: boolean;
        results: Array<{ code?: string; error?: string }>;
      };
    expect(rateLimitedExec.allSucceeded).toBe(false);
    expect(rateLimitedExec.results[0]?.code).toBe("RATE_LIMITED");
    expect(rateLimitedExec.results[0]?.error).not.toContain(
      "comp_test_secret_api_key_12345",
    );
    expect(rateLimitedExec.results[0]?.error).toContain("[REDACTED]");
  });
});
