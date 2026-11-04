import { randomBytes } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { ensureDeviceTable } from "@/lib/desktop/device-codes";
import { getSql } from "@/lib/desktop/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  await ensureDeviceTable();
  const sql = getSql();

  const deviceCode = randomBytes(32).toString("base64url");
  const code = String(
    Number.parseInt(randomBytes(3).toString("hex"), 16) % 1_000_000,
  ).padStart(6, "0");
  const expiresIn = 600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const baseUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://entry-agents.dev"
  ).replace(/\/$/, "");

  await sql`
    INSERT INTO desktop_device_codes (device_code, code, expires_at)
    VALUES (${deviceCode}, ${code}, ${expiresAt})`;

  return NextResponse.json({
    device_code: deviceCode,
    user_code: code,
    code,
    verification_uri: `${baseUrl}/desktop/approve`,
    verification_uri_complete: `${baseUrl}/desktop/approve?code=${code}`,
    expires_in: expiresIn,
    expires_at: expiresAt.toISOString(),
    interval: 3,
    poll_interval_seconds: 3,
  });
}
