import { describe, expect, test } from "bun:test";
import { evaluateExternalIntegrationAccess } from "./integration-access";

describe("evaluateExternalIntegrationAccess", () => {
  test("blocks free non-admin users with PLAN_UPGRADE_REQUIRED", () => {
    const res = evaluateExternalIntegrationAccess({
      plan: "free",
      isAdmin: false,
    });
    expect(res.allowed).toBe(false);
    expect(res.planId).toBe("free");
    expect(res.code).toBe("PLAN_UPGRADE_REQUIRED");
    expect(res.reason).toContain("paid plan");
  });

  test("blocks users with null/unknown plan", () => {
    const res = evaluateExternalIntegrationAccess({
      plan: null,
      isAdmin: false,
    });
    expect(res.allowed).toBe(false);
    expect(res.planId).toBe("free");
  });

  test("allows free admin users", () => {
    const res = evaluateExternalIntegrationAccess({
      plan: "free",
      isAdmin: true,
    });
    expect(res.allowed).toBe(true);
  });

  test("allows all paid plans (plus, entry, pro, max, legacy goat)", () => {
    for (const plan of ["plus", "entry", "goat", "pro", "max"]) {
      const res = evaluateExternalIntegrationAccess({ plan, isAdmin: false });
      expect(res.allowed).toBe(true);
    }
  });
});
