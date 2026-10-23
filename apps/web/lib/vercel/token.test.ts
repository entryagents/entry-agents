import { describe, expect, test } from "bun:test";
import { isVercelAuthFailure } from "./token";

describe("isVercelAuthFailure", () => {
  test("detects HTTP 401 and 403 auth status codes", () => {
    expect(isVercelAuthFailure({ status: 401 })).toBe(true);
    expect(isVercelAuthFailure({ status: 403, text: "invalid token" })).toBe(
      true,
    );
    expect(isVercelAuthFailure({ status: 200, text: "ok" })).toBe(false);
  });

  test("detects CLI and API invalid token messages", () => {
    expect(
      isVercelAuthFailure({
        text: "Error: The specified token is not valid. Use `vercel login` to generate a new token.",
      }),
    ).toBe(true);
    expect(
      isVercelAuthFailure({
        text: '{"error":{"code":"forbidden","message":"Not authorized: invalid token"}}',
      }),
    ).toBe(true);
    expect(
      isVercelAuthFailure({
        text: "Invalid credentials provided for request",
      }),
    ).toBe(true);
    expect(
      isVercelAuthFailure({
        text: "Deployment succeeded at https://my-app.vercel.app",
      }),
    ).toBe(false);
  });
});
