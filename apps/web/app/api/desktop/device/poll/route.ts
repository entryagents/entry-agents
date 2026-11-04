import { type NextRequest, NextResponse } from "next/server";
import { ensureDeviceTable } from "@/lib/desktop/device-codes";
import { getSql } from "@/lib/desktop/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  await ensureDeviceTable();
  const sql = getSql();

  let body: {
    device_code?: string;
    grant_type?: string;
    refresh_token?: string;
  };
  try {
    body = (await req.json()) as {
      device_code?: string;
      grant_type?: string;
      refresh_token?: string;
    };
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  // Support RFC 8628 refresh_token flow (checks if Better Auth session is still active)
  if (
    body.grant_type === "refresh_token" &&
    typeof body.refresh_token === "string"
  ) {
    const token = body.refresh_token.trim();
    if (token.length < 20) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }
    const sessionRows = await sql`
      SELECT s.token, u.id AS user_id, u.email
      FROM auth_sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token = ${token}
        AND s.expires_at > now()
      LIMIT 1`;
    if (sessionRows.length === 0) {
      return NextResponse.json({ error: "invalid_grant" }, { status: 400 });
    }
    const s = sessionRows[0] as {
      token: string;
      user_id: string;
      email: string;
    };
    return NextResponse.json({
      status: "approved",
      access_token: s.token,
      refresh_token: s.token,
      session_token: s.token,
      user_id: s.user_id,
      email: s.email,
      token_type: "Bearer",
      expires_in: 60 * 60 * 24 * 30,
    });
  }

  const deviceCode = body.device_code;
  if (
    typeof deviceCode !== "string" ||
    deviceCode.length < 16 ||
    deviceCode.length > 128
  ) {
    return NextResponse.json({ error: "invalid_device_code" }, { status: 400 });
  }

  const rows = await sql`
    SELECT d.status, d.session_token, d.user_id, d.expires_at, u.email
    FROM desktop_device_codes d
    LEFT JOIN users u ON u.id = d.user_id
    WHERE d.device_code = ${deviceCode}
    LIMIT 1`;

  if (rows.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const row = rows[0] as {
    status: string;
    session_token: string | null;
    user_id: string | null;
    expires_at: Date;
    email: string | null;
  };

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json({
      status: "expired",
      error: "expired_token",
    });
  }
  if (row.status !== "approved" || !row.session_token || !row.user_id) {
    return NextResponse.json({
      status: "pending",
      error: "authorization_pending",
    });
  }

  // Deliver token once, then wipe from the device code row
  await sql`
    UPDATE desktop_device_codes
    SET session_token = NULL
    WHERE device_code = ${deviceCode}`;

  return NextResponse.json({
    status: "approved",
    session_token: row.session_token,
    access_token: row.session_token,
    refresh_token: row.session_token,
    user_id: row.user_id,
    email: row.email ?? undefined,
    token_type: "Bearer",
    expires_in: 60 * 60 * 24 * 30,
  });
}
