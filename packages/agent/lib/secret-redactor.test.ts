import { describe, expect, test } from "bun:test";
import {
  createSecretRedactor,
  isHostAllowedForSecret,
  resolveSecretRecordTemplates,
  resolveSecretTemplates,
  SecretTemplateError,
  type RuntimeSecret,
} from "./secret-redactor";

const SAMPLE_SECRETS: RuntimeSecret[] = [
  {
    name: "STRIPE_SECRET_KEY",
    value: "sk_live_51NxSecretValue+/=",
    allowedHosts: ["api.stripe.com", "*.stripe.dev"],
  },
  {
    name: "GITHUB_TOKEN",
    value: "ghp_1234567890abcdef1234",
  },
  {
    name: "LINE_SECRET",
    value: 'line1\nline2"quoted',
  },
];

describe("isHostAllowedForSecret", () => {
  test("allows any host when allowedHosts is empty", () => {
    expect(isHostAllowedForSecret("example.com", [])).toBe(true);
  });

  test("matches exact hostnames and wildcard subdomains case-insensitively", () => {
    expect(isHostAllowedForSecret("API.STRIPE.COM", ["api.stripe.com"])).toBe(
      true,
    );
    expect(isHostAllowedForSecret("sub.stripe.dev", ["*.stripe.dev"])).toBe(
      true,
    );
    expect(isHostAllowedForSecret("stripe.dev", ["*.stripe.dev"])).toBe(true);
    expect(isHostAllowedForSecret("evil-stripe.dev", ["*.stripe.dev"])).toBe(
      false,
    );
    expect(isHostAllowedForSecret("", ["*.stripe.dev"])).toBe(false);
  });
});

describe("createSecretRedactor", () => {
  test("redacts literal, url-encoded, base64, and json-escaped secret forms", () => {
    const redactor = createSecretRedactor(SAMPLE_SECRETS);
    expect(redactor.hasSecrets()).toBe(true);

    const raw = SAMPLE_SECRETS[0]!.value;
    const urlEncoded = encodeURIComponent(raw);
    const base64 = Buffer.from(raw, "utf8").toString("base64");
    const jsonEscaped = JSON.stringify(SAMPLE_SECRETS[2]!.value).slice(1, -1);

    const input = `raw=${raw} url=${urlEncoded} b64=${base64} json=${jsonEscaped}`;
    const output = redactor.redact(input);

    expect(output).not.toContain(raw);
    expect(output).not.toContain(urlEncoded);
    expect(output).not.toContain(base64);
    expect(output).not.toContain(jsonEscaped);
    expect(output).toContain("[REDACTED:STRIPE_SECRET_KEY]");
    expect(output).toContain("[REDACTED:LINE_SECRET]");
  });

  test("redacts nested objects and arrays via redactUnknown", () => {
    const redactor = createSecretRedactor(SAMPLE_SECRETS);
    const cleaned = redactor.redactUnknown({
      token: SAMPLE_SECRETS[1]!.value,
      nested: ["ok", { auth: `Bearer ${SAMPLE_SECRETS[1]!.value}` }],
      count: 3,
    });

    expect(cleaned).toEqual({
      token: "[REDACTED:GITHUB_TOKEN]",
      nested: ["ok", { auth: "Bearer [REDACTED:GITHUB_TOKEN]" }],
      count: 3,
    });
  });

  test("skips redaction when no secrets >= 6 chars exist", () => {
    const redactor = createSecretRedactor([{ name: "SHORT", value: "abc" }]);
    expect(redactor.hasSecrets()).toBe(false);
    expect(redactor.redact("abc xyz")).toBe("abc xyz");
  });
});

describe("resolveSecretTemplates & resolveSecretRecordTemplates", () => {
  test("resolves allowed template and reports used secret names once", () => {
    const used: string[] = [];
    const resolved = resolveSecretTemplates(
      "Bearer {{SECRET:STRIPE_SECRET_KEY}}",
      SAMPLE_SECRETS,
      {
        targetHost: "api.stripe.com",
        onSecretUsed: (names) => used.push(...names),
      },
    );

    expect(resolved).toBe("Bearer sk_live_51NxSecretValue+/=");
    expect(used).toEqual(["STRIPE_SECRET_KEY"]);
  });

  test("throws SecretTemplateError when host is not in allowedHosts", () => {
    expect(() =>
      resolveSecretTemplates(
        "Bearer {{SECRET:STRIPE_SECRET_KEY}}",
        SAMPLE_SECRETS,
        { targetHost: "evil.example.com" },
      ),
    ).toThrow(SecretTemplateError);

    expect(() =>
      resolveSecretTemplates(
        "Bearer {{SECRET:STRIPE_SECRET_KEY}}",
        SAMPLE_SECRETS,
      ),
    ).toThrow(SecretTemplateError);
  });

  test("throws SecretTemplateError when referenced secret does not exist", () => {
    expect(() =>
      resolveSecretTemplates(
        "Bearer {{SECRET:DOES_NOT_EXIST}}",
        SAMPLE_SECRETS,
      ),
    ).toThrow(SecretTemplateError);
  });

  test("resolves record headers/env values cleanly", () => {
    const headers = resolveSecretRecordTemplates(
      {
        Authorization: "token {{SECRET:GITHUB_TOKEN}}",
        Accept: "application/json",
      },
      SAMPLE_SECRETS,
    );

    expect(headers).toEqual({
      Authorization: "token ghp_1234567890abcdef1234",
      Accept: "application/json",
    });
  });
});
