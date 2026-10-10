import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realAuthConfig from "@/lib/auth/config";
import * as realDbClient from "@/lib/db/client";
import * as realDbSchema from "@/lib/db/schema";

let getAccessTokenResult: { accessToken?: string | null } | null;
let getAccessTokenError: Error | null;

const getAccessTokenSpy = mock(
  async (_input: { body: { providerId: string; userId: string } }) => {
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

mock.module("@/lib/auth/config", () => ({
  ...realAuthConfig,
  auth: {
    api: {
      getAccessToken: getAccessTokenSpy,
    },
  },
}));

mock.module("@/lib/db/client", () => ({
  ...realDbClient,
  db: {},
}));

mock.module("@/lib/db/schema", () => ({
  ...realDbSchema,
  accounts: {},
}));

const tokenModulePromise = import("./token");

describe("getUserGitHubToken", () => {
  beforeEach(() => {
    getAccessTokenSpy.mockClear();
    getAccessTokenResult = { accessToken: "ghu_test" };
    getAccessTokenError = null;
  });

  test("looks up access tokens by user id without request headers", async () => {
    const { getUserGitHubToken } = await tokenModulePromise;

    const token = await getUserGitHubToken("user-1");

    expect(token).toBe("ghu_test");
    expect(getAccessTokenSpy).toHaveBeenCalledTimes(1);
    expect(getAccessTokenSpy.mock.calls[0]?.[0]).toEqual({
      body: { providerId: "github", userId: "user-1" },
    });
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
    getAccessTokenResult = { accessToken: "ghu_test" };
    getAccessTokenError = null;
  });

  test("returns GitHub App user-to-server tokens", async () => {
    const { getGitHubAppUserToken } = await tokenModulePromise;

    const token = await getGitHubAppUserToken("user-1");

    expect(token).toBe("ghu_test");
  });
});
