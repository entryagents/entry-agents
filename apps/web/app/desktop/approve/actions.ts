"use server";

import { headers } from "next/headers";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth/config";
import {
  approveDeviceAuthorization as approveInMemory,
  getPendingDeviceAuthorization as getPendingInMemory,
} from "@/lib/desktop/device-codes";

export async function ensureDeviceTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS desktop_device_codes (
      device_code TEXT PRIMARY KEY,
      code TEXT UNIQUE,
      session_token TEXT,
      user_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      approved_at TIMESTAMPTZ
    )`);
}

export type ApproveResult =
  | {
      ok: true;
      user?: { id: string; email?: string | null; name?: string | null };
    }
  | { ok: false; error: string };

export async function checkDeviceCode(
  code: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!code || typeof code !== "string") {
    return { valid: false, error: "Code is required" };
  }
  const cleanCode = code.replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(cleanCode)) {
    return { valid: false, error: "Invalid code format (expected 6 digits)" };
  }

  // Check in-memory first
  const memRecord = getPendingInMemory(cleanCode);
  if (memRecord) {
    return { valid: true };
  }

  // Check database table
  try {
    await ensureDeviceTable();
    const rows = await db.execute(sql`
      SELECT device_code, status, expires_at
      FROM desktop_device_codes
      WHERE code = ${cleanCode}
      LIMIT 1`);
    const row = (
      rows as unknown as {
        device_code: string;
        status: string;
        expires_at: Date | string;
      }[]
    )[0];
    if (!row) return { valid: false, error: "Code not found" };
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return { valid: false, error: "Code has expired" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Could not verify code" };
  }
}

export async function approveDesktopDevice(
  code: string,
): Promise<ApproveResult> {
  const cleanCode = code.replace(/\D/g, "").slice(0, 6);
  if (!/^\d{6}$/.test(cleanCode)) {
    return { ok: false, error: "Invalid confirmation code format." };
  }

  // Tie approval explicitly to the active authenticated browser session
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });

  if (!session?.user?.id) {
    return { ok: false, error: "You must be signed in to authorize Desktop." };
  }

  const sessionToken = session.session?.token;
  if (!sessionToken) {
    return {
      ok: false,
      error: "Active browser session token could not be verified.",
    };
  }

  // Update in-memory store if active
  approveInMemory(
    cleanCode,
    session.user.id,
    sessionToken,
    session.user.email ?? undefined,
  );

  // Update database table for desktop-backend polling
  try {
    await ensureDeviceTable();
    const rows = await db.execute(sql`
      SELECT device_code, status, expires_at
      FROM desktop_device_codes
      WHERE code = ${cleanCode}
      LIMIT 1`);

    const row = (
      rows as unknown as {
        device_code: string;
        status: string;
        expires_at: Date | string;
      }[]
    )[0];
    if (!row) {
      // If code was found in-memory, that's fine; otherwise return error
      if (!getPendingInMemory(cleanCode)) {
        return { ok: false, error: "Authorization code not found or expired." };
      }
    } else {
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return { ok: false, error: "Authorization code has expired." };
      }

      await db.execute(sql`
        UPDATE desktop_device_codes
        SET status = 'approved',
            session_token = ${sessionToken},
            user_id = ${session.user.id},
            approved_at = now()
        WHERE device_code = ${row.device_code}`);
    }

    return {
      ok: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
    };
  } catch (err) {
    return {
      ok: false,
      error:
        (err as Error).message || "Database update failed during approval.",
    };
  }
}
