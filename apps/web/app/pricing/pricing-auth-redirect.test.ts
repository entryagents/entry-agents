import { describe, expect, it } from "bun:test";
import {
  buildPricingLoginRedirectUrl,
  parsePricingSubscribeIntent,
} from "./pricing-auth-redirect";

describe("pricing-auth-redirect", () => {
  it("builds login redirect URL for Plus plan", () => {
    expect(buildPricingLoginRedirectUrl("plus")).toBe(
      "/login?next=%2Fpricing%3Fsubscribe%3Dplus",
    );
  });

  it("builds login redirect URL for Builder plan with window mode", () => {
    expect(buildPricingLoginRedirectUrl("entry", "rolling")).toBe(
      "/login?next=%2Fpricing%3Fsubscribe%3Dentry%26windowMode%3Drolling",
    );
    expect(buildPricingLoginRedirectUrl("entry", "fixed")).toBe(
      "/login?next=%2Fpricing%3Fsubscribe%3Dentry%26windowMode%3Dfixed",
    );
  });

  it("falls back to /pricing for unknown plan IDs", () => {
    expect(buildPricingLoginRedirectUrl("free")).toBe("/login?next=%2Fpricing");
  });

  it("parses subscribe intent from query string", () => {
    expect(parsePricingSubscribeIntent("?subscribe=plus")).toEqual({
      planId: "plus",
      windowMode: null,
    });
    expect(
      parsePricingSubscribeIntent("?subscribe=entry&windowMode=fixed"),
    ).toEqual({
      planId: "entry",
      windowMode: "fixed",
    });
    expect(parsePricingSubscribeIntent("?subscribe=invalid")).toEqual({
      planId: null,
      windowMode: null,
    });
  });
});
