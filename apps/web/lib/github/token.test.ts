import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realAuthConfig from "@/lib/auth/config";

let providerAccountId: string | null = "ba-row-1";
let getAccessTokenResult: { accessToken?: string | null } | null;
let getAccessTokenError: Error | null;

const getAccessTokenSpy = mock(
  async (_input: { body: { accountId: string; userId: string } }) => {
    if (getAccessTokenError) {
      throw getAccessTokenError;
    }

    return getAccessTokenResult;
  },
);

mock.module("server-only", () => ({}));

mock.module("next/headers", () => ({
  headers: async () => {
    throw new Error("headers should not be called");
  },
}));

mock.module("@/lib/auth/account-token", () => ({
  getProviderAccountId: async () => providerAccountId,
}));

mock.module("@/lib/auth/config", () => ({
  ...realAuthConfig,
  auth: {
    api: {
      getAccessToken: getAccessTokenSpy,
    },
  },
}));

const tokenModulePromise = import("./token");

describe("getUserGitHubToken", () => {
  beforeEach(() => {
    getAccessTokenSpy.mockClear();
    providerAccountId = "ba-row-1";
    getAccessTokenResult = { accessToken: "ghu_test" };
    getAccessTokenError = null;
  });

  test("looks up access tokens by Better Auth account row id without request headers", async () => {
    const { getUserGitHubToken } = await tokenModulePromise;

    const token = await getUserGitHubToken("user-1");

    expect(token).toBe("ghu_test");
    expect(getAccessTokenSpy).toHaveBeenCalledTimes(1);
    expect(getAccessTokenSpy.mock.calls[0]?.[0]).toEqual({
      body: { accountId: "ba-row-1", userId: "user-1" },
    });
  });

  test("returns null without calling getAccessToken when no GitHub account row exists", async () => {
    const { getUserGitHubToken } = await tokenModulePromise;
    providerAccountId = null;

    const token = await getUserGitHubToken("user-1");

    expect(token).toBeNull();
    expect(getAccessTokenSpy).not.toHaveBeenCalled();
  });

  test("returns null when better-auth token lookup fails", async () => {
    const { getUserGitHubToken } = await tokenModulePromise;
    getAccessTokenError = new Error("boom");

    const token = await getUserGitHubToken("user-1");

    expect(token).toBeNull();
  });
});

describe("getGitHubAppUserToken", () => {
  beforeEach(() => {
    getAccessTokenSpy.mockClear();
    providerAccountId = "ba-row-1";
    getAccessTokenResult = { accessToken: "ghu_test" };
    getAccessTokenError = null;
  });

  test("returns GitHub App user-to-server tokens", async () => {
    const { getGitHubAppUserToken } = await tokenModulePromise;

    const token = await getGitHubAppUserToken("user-1");

    expect(token).toBe("ghu_test");
  });
});
