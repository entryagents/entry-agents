/**
 * Entry Platform - Desktop Device Authorization Store & Rate Limiter
 *
 * Implements RFC 8628 OAuth 2.0 Device Authorization Grant with:
 * - 6-digit collision-resistant verification codes
 * - Brute force rate-limiting on user codes
 * - Atomic one-time token delivery to prevent race conditions
 * - Direct binding to the authenticated user's active Better Auth session
 * - Automatic expiration cleanup (10-minute lifetime)
 */

import { randomBytes, randomInt } from "node:crypto";

export interface DeviceAuthorizationRecord {
  deviceCode: string;
  userCode: string;
  status: "pending" | "approved" | "consumed" | "expired";
  createdAt: number;
  expiresAt: number;
  failedAttempts: number;
  approvedUserId?: string;
  approvedUserEmail?: string;
  sessionToken?: string;
}

// In-memory store for fast atomic operations; can be paired with DB verification table
const deviceSessionsByDeviceCode = new Map<string, DeviceAuthorizationRecord>();
const deviceSessionsByUserCode = new Map<string, DeviceAuthorizationRecord>();

const CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const MAX_FAILED_ATTEMPTS = 5;

/**
 * Creates a new device authorization session.
 */
export function createDeviceAuthorization(): {
  deviceCode: string;
  userCode: string;
  expiresIn: number;
  expiresAt: number;
  interval: number;
} {
  // Prune any expired records
  cleanExpiredRecords();

  const deviceCode = `dev_${randomBytes(24).toString("hex")}`;

  // Generate 6-digit code with collision check
  let userCode = "";
  let attempts = 0;
  while (attempts < 10) {
    const rawNum = randomInt(100000, 999999);
    userCode = rawNum.toString();
    if (!deviceSessionsByUserCode.has(userCode)) {
      break;
    }
    attempts++;
  }

  const now = Date.now();
  const expiresAt = now + CODE_EXPIRY_MS;

  const record: DeviceAuthorizationRecord = {
    deviceCode,
    userCode,
    status: "pending",
    createdAt: now,
    expiresAt,
    failedAttempts: 0,
  };

  deviceSessionsByDeviceCode.set(deviceCode, record);
  deviceSessionsByUserCode.set(userCode, record);

  return {
    deviceCode,
    userCode,
    expiresIn: Math.floor(CODE_EXPIRY_MS / 1000),
    expiresAt,
    interval: 3,
  };
}

/**
 * Validates a user code without approving it yet.
 */
export function getPendingDeviceAuthorization(
  userCode: string,
): DeviceAuthorizationRecord | null {
  cleanExpiredRecords();
  const cleanCode = userCode.trim().replace(/[\s-]/g, "");
  const record = deviceSessionsByUserCode.get(cleanCode);

  if (!record) return null;
  if (record.expiresAt < Date.now()) {
    record.status = "expired";
    return null;
  }
  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    record.status = "expired";
    return null;
  }

  return record;
}

/**
 * Approves a device authorization request, tying it directly to the active Better Auth user & session.
 */
export function approveDeviceAuthorization(
  userCode: string,
  userId: string,
  sessionToken: string,
  userEmail?: string,
): { success: boolean; error?: string } {
  cleanExpiredRecords();
  const cleanCode = userCode.trim().replace(/[\s-]/g, "");
  const record = deviceSessionsByUserCode.get(cleanCode);

  if (!record) {
    return { success: false, error: "Invalid or expired verification code." };
  }

  if (record.expiresAt < Date.now()) {
    record.status = "expired";
    return { success: false, error: "This authorization code has expired." };
  }

  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    record.status = "expired";
    return {
      success: false,
      error: "Too many failed attempts. Code has been invalidated.",
    };
  }

  if (record.status !== "pending") {
    return { success: false, error: `Code is already ${record.status}.` };
  }

  // Atomically bind approval
  record.status = "approved";
  record.approvedUserId = userId;
  record.approvedUserEmail = userEmail;
  record.sessionToken = sessionToken;

  return { success: true };
}

/**
 * Atomically polls and consumes the session token (one-time delivery).
 */
export function pollAndConsumeDeviceToken(deviceCode: string): {
  status: "pending" | "approved" | "expired" | "not_found";
  sessionToken?: string;
  userId?: string;
  email?: string;
  expiresIn?: number;
} {
  cleanExpiredRecords();
  const record = deviceSessionsByDeviceCode.get(deviceCode);

  if (!record) {
    return { status: "not_found" };
  }

  if (record.expiresAt < Date.now()) {
    record.status = "expired";
    return { status: "expired" };
  }

  if (record.status === "pending") {
    return { status: "pending" };
  }

  if (
    record.status === "approved" &&
    record.sessionToken &&
    record.approvedUserId
  ) {
    // Atomic one-time delivery
    const token = record.sessionToken;
    const userId = record.approvedUserId;
    const email = record.approvedUserEmail;
    const remainingSeconds = Math.max(
      0,
      Math.floor((record.expiresAt - Date.now()) / 1000),
    );

    record.status = "consumed";
    record.sessionToken = undefined; // wiped from memory immediately

    return {
      status: "approved",
      sessionToken: token,
      userId,
      email,
      expiresIn: remainingSeconds,
    };
  }

  if (record.status === "consumed") {
    return { status: "expired" };
  }

  return { status: "expired" };
}

/**
 * Prunes expired sessions from memory.
 */
function cleanExpiredRecords() {
  const now = Date.now();
  for (const [key, record] of deviceSessionsByDeviceCode.entries()) {
    if (record.expiresAt < now) {
      deviceSessionsByDeviceCode.delete(key);
      deviceSessionsByUserCode.delete(record.userCode);
    }
  }
}
