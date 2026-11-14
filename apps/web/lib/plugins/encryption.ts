import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const HKDF_INFO = "entry-agents:plugin-config:v1";

function deriveKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required to encrypt/decrypt plugin configuration",
    );
  }
  return Buffer.from(hkdfSync("sha256", secret, "", HKDF_INFO, KEY_LENGTH));
}

export function encryptPluginConfig(
  config: Record<string, string> | null | undefined,
): string | null {
  if (!config || Object.keys(config).length === 0) {
    return null;
  }

  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(config), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext]
    .map((buf) => buf.toString("base64"))
    .join(":");
}

export function decryptPluginConfig(
  encrypted: string | null | undefined,
): Record<string, string> | undefined {
  if (!encrypted) return undefined;

  const [ivB64, authTagB64, ciphertextB64] = encrypted.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted plugin config payload");
  }

  const key = deriveKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  const parsed: unknown = JSON.parse(plaintext.toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return undefined;
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === "string") {
      out[k] = v;
    }
  }
  return out;
}
