import { getSql } from "./sql";

export const runtime = "nodejs";

/**
 * Desktop sign-in infrastructure (OAuth 2.0 Device Authorization Grant + Entry approve flow).
 * Creates `desktop_device_codes` idempotently in the shared production Postgres database.
 */
export async function ensureDeviceTable(): Promise<void> {
  const sql = getSql();
  await sql`
    CREATE TABLE IF NOT EXISTS desktop_device_codes (
      device_code TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      session_token TEXT,
      user_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      approved_at TIMESTAMPTZ
    )`;
}
