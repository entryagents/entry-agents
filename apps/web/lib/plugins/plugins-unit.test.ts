import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { pluginManifestSchema } from "@entry-agents/agent";
import { decryptPluginConfig, encryptPluginConfig } from "./encryption";

describe("plugin config encryption", () => {
  const originalSecret = process.env.BETTER_AUTH_SECRET;

  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET =
      "test-better-auth-secret-32-chars-minimum-value";
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = originalSecret;
    }
  });

  test("encrypts and decrypts plugin config fields via AES-256-GCM", () => {
    const input = {
      WEBHOOK_TOKEN: "tok_live_123456",
      ENV: "staging",
    };

    const encrypted = encryptPluginConfig(input);
    expect(encrypted).toBeString();
    expect(encrypted).not.toContain("tok_live_123456");

    const decrypted = decryptPluginConfig(encrypted);
    expect(decrypted).toEqual(input);
  });

  test("returns null for empty config and throws on tampered ciphertext", () => {
    expect(encryptPluginConfig({})).toBeNull();
    expect(encryptPluginConfig(null)).toBeNull();
    expect(decryptPluginConfig(null)).toBeUndefined();

    const encrypted = encryptPluginConfig({ KEY: "secret" })!;
    const [iv, tag, data] = encrypted.split(":");
    const tampered = `${iv}:${tag}:${Buffer.from("corrupted").toString("base64")}`;
    expect(() => decryptPluginConfig(tampered)).toThrow();
    expect(() => decryptPluginConfig("bad-format")).toThrow();
    expect(data).toBeDefined();
  });

  test("validates custom plugin manifest schema cleanly", () => {
    const result = pluginManifestSchema.safeParse({
      slug: "custom-guard",
      name: "Custom Guard",
      description: "Enforces repo safety policy",
      hooks: ["tool.execute.before", "tool.execute.after"],
      slashCommands: [
        {
          name: "verify",
          description: "Run verification suite",
          promptTemplate: "Run pnpm check and pnpm typecheck before replying.",
        },
      ],
      rules: {
        redactOutputPatterns: ["ghp_[A-Za-z0-9]+"],
      },
    });
    expect(result.success).toBe(true);
  });
});
