import { beforeEach, describe, expect, mock, test } from "bun:test";
import * as realDbSchema from "@/lib/db/schema";

let selectedFields: Record<string, unknown> | null = null;
let queryRows: Array<{ id?: string; accountId?: string }> = [];

mock.module("@/lib/db/schema", () => ({
  ...realDbSchema,
  accounts: {
    id: "accounts.id",
    accountId: "accounts.accountId",
    userId: "accounts.userId",
    providerId: "accounts.providerId",
  },
}));

mock.module("@/lib/db/client", () => ({
  db: {
    select: (fields: Record<string, unknown>) => {
      selectedFields = fields;
      return {
        from: () => ({
          where: () => ({
            limit: async () => queryRows,
          }),
        }),
      };
    },
  },
}));

const modulePromise = import("./account-token");

describe("getProviderAccountId", () => {
  beforeEach(() => {
    selectedFields = null;
    queryRows = [];
  });

  test("selects internal accounts.id primary key rather than external accounts.accountId", async () => {
    const { getProviderAccountId } = await modulePromise;
    queryRows = [{ id: "ba-internal-id" }];

    const result = await getProviderAccountId("user-1", "github");

    expect(result).toBe("ba-internal-id");
    expect(selectedFields).toEqual({ id: "accounts.id" });
  });

  test("returns null when no row matches", async () => {
    const { getProviderAccountId } = await modulePromise;
    queryRows = [];

    const result = await getProviderAccountId("user-1", "vercel");

    expect(result).toBeNull();
  });
});
