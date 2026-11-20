import { createHmac } from "crypto";
import { afterEach, describe, expect, it, mock } from "bun:test";

mock.module("server-only", () => ({}));

const {
  getBachsEnvironmentStatus,
  isLiveBachsKey,
  isSandboxBachsKey,
  resolveBaseUrl,
  verifyBachsSignature,
} = await import("./bachs");

describe("Bachs sandbox vs live environment resolution", () => {
  const originalApiKey = process.env.BACHS_API_KEY;
  const originalLiveApiKey = process.env.BACHS_LIVE_API_KEY;
  const originalBaseUrl = process.env.BACHS_BASE_URL;
  const originalWebhookSecret = process.env.BACHS_WEBHOOK_SECRET;
  const originalLiveWebhookSecret = process.env.BACHS_LIVE_WEBHOOK_SECRET;

  afterEach(() => {
    process.env.BACHS_API_KEY = originalApiKey;
    process.env.BACHS_LIVE_API_KEY = originalLiveApiKey;
    process.env.BACHS_BASE_URL = originalBaseUrl;
    process.env.BACHS_WEBHOOK_SECRET = originalWebhookSecret;
    process.env.BACHS_LIVE_WEBHOOK_SECRET = originalLiveWebhookSecret;
  });

  it("detects sandbox and live key prefixes", () => {
    expect(isSandboxBachsKey("sk_sandbox_abc123")).toBe(true);
    expect(isSandboxBachsKey("sk_test_abc123")).toBe(true);
    expect(isSandboxBachsKey("sk_live_abc123")).toBe(false);
    expect(isLiveBachsKey("sk_live_abc123")).toBe(true);
    expect(isLiveBachsKey("sk_sandbox_abc123")).toBe(false);
  });

  it("routes sk_live_ keys to https://api.bachs.io even if BACHS_BASE_URL was left pointing at sandbox", () => {
    process.env.BACHS_BASE_URL = "https://sandbox-api.bachs.io";
    expect(resolveBaseUrl("sk_live_prod_key_123")).toBe("https://api.bachs.io");
  });

  it("routes sk_sandbox_ keys to https://sandbox-api.bachs.io even if BACHS_BASE_URL was left pointing at live", () => {
    process.env.BACHS_BASE_URL = "https://api.bachs.io";
    expect(resolveBaseUrl("sk_sandbox_test_key_123")).toBe(
      "https://sandbox-api.bachs.io",
    );
  });

  it("reports environment status accurately for live vs sandbox", () => {
    delete process.env.BACHS_BASE_URL;
    process.env.BACHS_API_KEY = "sk_live_1234567890abcdef";
    process.env.BACHS_WEBHOOK_SECRET = "whsec_live_secret";

    const liveStatus = getBachsEnvironmentStatus();
    expect(liveStatus.mode).toBe("live");
    expect(liveStatus.baseUrl).toBe("https://api.bachs.io");
    expect(liveStatus.webhookSecretConfigured).toBe(true);

    process.env.BACHS_API_KEY = "sk_sandbox_1234567890abcdef";
    const sandboxStatus = getBachsEnvironmentStatus();
    expect(sandboxStatus.mode).toBe("sandbox");
    expect(sandboxStatus.baseUrl).toBe("https://sandbox-api.bachs.io");
  });

  it("verifies webhook signatures against either BACHS_WEBHOOK_SECRET or BACHS_LIVE_WEBHOOK_SECRET", () => {
    process.env.BACHS_WEBHOOK_SECRET = "whsec_sandbox_111";
    process.env.BACHS_LIVE_WEBHOOK_SECRET = "whsec_live_222";

    const rawBody = JSON.stringify({ type: "invoice.paid", data: {} });
    const ts = 1_700_000_000;
    const liveDigest = createHmac("sha256", "whsec_live_222")
      .update(`${ts}.${rawBody}`, "utf8")
      .digest("hex");

    expect(
      verifyBachsSignature({
        rawBody,
        timestampHeader: String(ts),
        signatureV2Header: `t=${ts},v1=${liveDigest}`,
        nowSeconds: ts + 5,
      }),
    ).toBe(true);
  });
});
