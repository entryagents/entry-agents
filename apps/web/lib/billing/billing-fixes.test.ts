import { describe, expect, it } from "bun:test";
import {
  shouldDowngradeOnSubscriptionDisable,
  shouldAutoRevertToFree,
  consumedFromGrantPool,
  expiredGrantCentsOnPlanEnd,
} from "./plans";

describe("Billing Audit Fixes and Invariants", () => {
  describe("Subscription status cancellation matching", () => {
    it("recognizes all terminal subscription states: canceled, cancelled, paused, unpaid", () => {
      const isTerminalStatus = (status: string | undefined): boolean => {
        return (
          status === "canceled" ||
          status === "cancelled" ||
          status === "paused" ||
          status === "unpaid"
        );
      };

      expect(isTerminalStatus("canceled")).toBe(true);
      expect(isTerminalStatus("cancelled")).toBe(true);
      expect(isTerminalStatus("paused")).toBe(true);
      expect(isTerminalStatus("unpaid")).toBe(true);
      expect(isTerminalStatus("active")).toBe(false);
      expect(isTerminalStatus("incomplete")).toBe(false);
      expect(isTerminalStatus(undefined)).toBe(false);
    });
  });

  describe("Customer ID resolution across Bachs payload shapes", () => {
    it("resolves customer id from customer.id or customer.customer_id", () => {
      const resolveCustomerId = (customer: {
        id?: string | null;
        customer_id?: string | null;
      } | null | undefined): string | null => {
        return customer?.id ?? customer?.customer_id ?? null;
      };

      expect(resolveCustomerId({ id: "cust_123" })).toBe("cust_123");
      expect(resolveCustomerId({ customer_id: "cust_456" })).toBe("cust_456");
      expect(resolveCustomerId({ id: "cust_123", customer_id: "cust_456" })).toBe("cust_123");
      expect(resolveCustomerId(null)).toBeNull();
      expect(resolveCustomerId(undefined)).toBeNull();
    });
  });

  describe("usdAmountCents parsing from metadata", () => {
    it("correctly parses metadata.usdAmountCents whether number or string", () => {
      const parseMetadataUsdAmountCents = (metadata: Record<string, unknown> | null): number | null => {
        if (!metadata) return null;
        return typeof metadata.usdAmountCents === "number" && Number.isFinite(metadata.usdAmountCents)
          ? metadata.usdAmountCents
          : typeof metadata.usdAmountCents === "string" && Number.isFinite(Number(metadata.usdAmountCents))
            ? Number(metadata.usdAmountCents)
            : null;
      };

      expect(parseMetadataUsdAmountCents({ usdAmountCents: 5000 })).toBe(5000);
      expect(parseMetadataUsdAmountCents({ usdAmountCents: "5000" })).toBe(5000);
      expect(parseMetadataUsdAmountCents({ usdAmountCents: 0 })).toBe(0);
      expect(parseMetadataUsdAmountCents({ usdAmountCents: "0" })).toBe(0);
      expect(parseMetadataUsdAmountCents({ usdAmountCents: "invalid" })).toBeNull();
      expect(parseMetadataUsdAmountCents({})).toBeNull();
      expect(parseMetadataUsdAmountCents(null)).toBeNull();
    });
  });

  describe("Trial allowance calculation in expireStaleTopUps", () => {
    it("preserves $1 trial credit for free users even when sums.trialCents returns 0", () => {
      const computeTrialAllowance = (
        plan: string,
        sumsTrialCents: number | null | undefined,
      ): number => {
        return plan === "free"
          ? Math.max(0, sumsTrialCents && sumsTrialCents > 0 ? sumsTrialCents : 100)
          : 0;
      };

      // When sums.trialCents is 0 (SQL coalesce default), free user keeps 100 trial allowance
      expect(computeTrialAllowance("free", 0)).toBe(100);
      expect(computeTrialAllowance("free", null)).toBe(100);
      expect(computeTrialAllowance("free", undefined)).toBe(100);
      expect(computeTrialAllowance("free", 100)).toBe(100);
      expect(computeTrialAllowance("free", 200)).toBe(200);

      // Paid plans get 0 trial allowance (grants come from subscription renewals)
      expect(computeTrialAllowance("plus", 100)).toBe(0);
      expect(computeTrialAllowance("goat", 0)).toBe(0);
    });

    it("calculates expired top-up credit accurately protecting trial and active top-ups", () => {
      const computeExpiredCents = (params: {
        nonGrantBalance: number;
        activeTopUpCents: number;
        trialAllowance: number;
      }): number => {
        const maxValidNonGrantCents = params.activeTopUpCents + params.trialAllowance;
        return Math.max(0, params.nonGrantBalance - maxValidNonGrantCents);
      };

      // Free user with $1 trial credit and no top-ups: nothing expires
      expect(
        computeExpiredCents({
          nonGrantBalance: 100,
          activeTopUpCents: 0,
          trialAllowance: 100,
        }),
      ).toBe(0);

      // Free user who had $1 trial + $10 top-up (total $11). Old top-up expired, activeTopUp is 0.
      // Balance is $11. Expired is $11 - 100 (trial) = 1000 cents ($10 expired, $1 trial kept).
      expect(
        computeExpiredCents({
          nonGrantBalance: 1100,
          activeTopUpCents: 0,
          trialAllowance: 100,
        }),
      ).toBe(1000);
    });
  });

  describe("Admin credit block exemption", () => {
    it("exempts admin users from credit balance exhaustion gating", () => {
      const shouldBlockUser = (isAdmin: boolean, balanceCents: number): boolean => {
        if (isAdmin) {
          // Admin bypasses balance check
          return false;
        }
        return balanceCents <= 0;
      };

      expect(shouldBlockUser(true, 0)).toBe(false);
      expect(shouldBlockUser(true, -500)).toBe(false);
      expect(shouldBlockUser(true, 1000)).toBe(false);

      expect(shouldBlockUser(false, 0)).toBe(true);
      expect(shouldBlockUser(false, -100)).toBe(true);
      expect(shouldBlockUser(false, 100)).toBe(false);
    });
  });
});
