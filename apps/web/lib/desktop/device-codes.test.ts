import { describe, expect, test } from "bun:test";
import {
  createDeviceAuthorization,
  getPendingDeviceAuthorization,
  approveDeviceAuthorization,
  pollAndConsumeDeviceToken,
} from "./device-codes";

describe("Web Device Authorization Flow", () => {
  test("creates pending authorization with valid codes and expiry", () => {
    const auth = createDeviceAuthorization();
    expect(auth.deviceCode).toMatch(/^dev_[a-f0-9]{48}$/);
    expect(auth.userCode).toMatch(/^\d{6}$/);
    expect(auth.expiresIn).toBe(600);
    expect(auth.expiresAt).toBeGreaterThan(Date.now());
  });

  test("validates pending user code correctly", () => {
    const auth = createDeviceAuthorization();
    const pending = getPendingDeviceAuthorization(auth.userCode);
    expect(pending).not.toBeNull();
    expect(pending?.deviceCode).toBe(auth.deviceCode);
    expect(pending?.status).toBe("pending");
  });

  test("approves device code with active user session and delivers token atomically once", () => {
    const auth = createDeviceAuthorization();

    // 1. Initial poll returns pending
    const poll1 = pollAndConsumeDeviceToken(auth.deviceCode);
    expect(poll1.status).toBe("pending");

    // 2. User approves in browser
    const approved = approveDeviceAuthorization(
      auth.userCode,
      "user_12345",
      "ba_session_token_xyz987",
      "developer@entry.dev"
    );
    expect(approved.success).toBe(true);

    // 3. First poll consumes the session token
    const poll2 = pollAndConsumeDeviceToken(auth.deviceCode);
    expect(poll2.status).toBe("approved");
    expect(poll2.sessionToken).toBe("ba_session_token_xyz987");
    expect(poll2.userId).toBe("user_12345");
    expect(poll2.email).toBe("developer@entry.dev");

    // 4. Subsequent concurrent poll CANNOT receive the token again (one-time delivery)
    const poll3 = pollAndConsumeDeviceToken(auth.deviceCode);
    expect(poll3.status).toBe("expired");
    expect(poll3.sessionToken).toBeUndefined();
  });

  test("rejects invalid or unknown user codes", () => {
    const res = approveDeviceAuthorization("000000", "u1", "tok");
    expect(res.success).toBe(false);
  });
});
