import { type NextRequest, NextResponse } from "next/server";
import { getSql } from "./sql";

export interface DesktopUser {
  id: string;
  email: string;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * Resolve the desktop bearer token to a user via the real `auth_sessions`
 * table. Returns null for missing/expired/unknown tokens (fail closed).
 */
export async function requireDesktopUser(
  req: NextRequest,
): Promise<DesktopUser | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return null;
  }
  const token = auth.slice(7).trim();
  if (token.length < 20) {
    return null;
  }

  const sql = getSql();
  const rows = await sql`
    SELECT u.id, u.email
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ${token}
      AND s.expires_at > now()
    LIMIT 1
  `;
  if (rows.length === 0) {
    return null;
  }
  return {
    id: rows[0].id as string,
    email: rows[0].email as string,
  };
}
