/**
 * OpenCode-style OAuth 2.0 Device Authorization Grant Client for Entry Desktop
 * Mirrors `packages/core/src/plugin/provider/opencode.ts`.
 *
 * Connects exclusively to Entry's official domain (`https://entry-agents.dev`):
 * - POST `/api/desktop/device/code` (or `/api/desktop/device/start`)
 * - User approves at `https://entry-agents.dev/desktop/approve?code=NNNNNN`
 * - Polls POST `/api/desktop/device/token` (or `/api/desktop/device/poll`)
 * - Persists credentials in local SQLite (`account` & `account_state` tables)
 * - Supports refresh token rotation (`grant_type: "refresh_token"`)
 */
import type { EntryDesktopDatabase, AccountRow } from "../database/database";

export const DEFAULT_ENTRY_URL =
  process.env.ENTRY_BACKEND_URL ?? "https://entry-agents.dev";

export interface DeviceAuthorizeResponse {
  device_code: string;
  user_code: string;
  code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenPollResult {
  status: "pending" | "approved" | "expired" | "error";
  account?: AccountRow;
  error?: string;
}

export class EntryDeviceAuthService {
  readonly baseUrl: string;

  constructor(
    private readonly db: EntryDesktopDatabase,
    baseUrl: string = DEFAULT_ENTRY_URL,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Step 1: Request a device code & 6-digit user verification code from Entry.
   */
  async startDeviceAuthorization(): Promise<DeviceAuthorizeResponse> {
    const endpoints = [
      `${this.baseUrl}/api/desktop/device/code`,
      `${this.baseUrl}/api/desktop/device/start`,
    ];

    let lastError = "Failed to initiate device authorization";
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: "entry-desktop" }),
        });
        if (!res.ok) {
          lastError = `HTTP ${res.status} from ${url}`;
          continue;
        }
        const data = (await res.json()) as Partial<DeviceAuthorizeResponse> & {
          poll_interval_seconds?: number;
        };
        const code = data.user_code ?? data.code ?? "";
        const deviceCode = data.device_code ?? "";
        if (!code || !deviceCode) {
          lastError = "Invalid device authorization payload";
          continue;
        }
        return {
          device_code: deviceCode,
          user_code: code,
          code,
          verification_uri:
            data.verification_uri ?? `${this.baseUrl}/desktop/approve`,
          verification_uri_complete:
            data.verification_uri_complete ??
            `${this.baseUrl}/desktop/approve?code=${encodeURIComponent(code)}`,
          expires_in: data.expires_in ?? 600,
          interval: data.interval ?? data.poll_interval_seconds ?? 3,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    throw new Error(lastError);
  }

  /**
   * Step 2: Poll Entry's device token endpoint once for a given `device_code`.
   * If approved, fetches `/api/desktop/usage` to hydrate email/plan/balance and
   * persists the account in local SQLite.
   */
  async pollDeviceToken(deviceCode: string): Promise<DeviceTokenPollResult> {
    const endpoints = [
      `${this.baseUrl}/api/desktop/device/token`,
      `${this.baseUrl}/api/desktop/device/poll`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            device_code: deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            client_id: "entry-desktop",
          }),
        });

        if (res.status === 404) {
          return { status: "expired", error: "Device code not found" };
        }
        const data = (await res.json()) as {
          status?: string;
          error?: string;
          session_token?: string;
          access_token?: string;
          refresh_token?: string;
          user_id?: string;
          email?: string;
          expires_in?: number;
        };

        if (data.status === "expired" || data.error === "expired_token") {
          return { status: "expired", error: "Verification code expired" };
        }

        const token = data.access_token ?? data.session_token;
        if (data.status === "approved" && token && data.user_id) {
          const usageInfo = await this.fetchUsageWithToken(token);
          const account = this.db.upsertAccount({
            id: data.user_id,
            email:
              data.email ??
              usageInfo?.email ??
              `user-${data.user_id.slice(0, 6)}@entry-agents.dev`,
            url: this.baseUrl,
            access_token: token,
            refresh_token: data.refresh_token ?? token,
            token_expiry: data.expires_in
              ? Date.now() + data.expires_in * 1000
              : Date.now() + 30 * 24 * 60 * 60 * 1000,
            plan: usageInfo?.plan ?? "free",
            plan_name: usageInfo?.planName ?? "Entry",
            credit_balance_cents: usageInfo?.creditBalanceCents ?? 0,
          });
          return { status: "approved", account };
        }

        return { status: "pending" };
      } catch {
        // try next endpoint
      }
    }

    return { status: "pending" };
  }

  /**
   * Direct session token login (e.g. from deep link `entry://auth/complete` or manual token paste).
   */
  async setSessionToken(
    token: string,
    emailHint?: string,
  ): Promise<AccountRow> {
    const cleanToken = token.trim();
    const usageInfo = await this.fetchUsageWithToken(cleanToken);
    const userId = usageInfo?.userId ?? `user-${cleanToken.slice(0, 8)}`;
    return this.db.upsertAccount({
      id: userId,
      email: emailHint ?? usageInfo?.email ?? "signed-in@entry-agents.dev",
      url: this.baseUrl,
      access_token: cleanToken,
      refresh_token: cleanToken,
      token_expiry: Date.now() + 30 * 24 * 60 * 60 * 1000,
      plan: usageInfo?.plan ?? "goat",
      plan_name: usageInfo?.planName ?? "Entry",
      credit_balance_cents: usageInfo?.creditBalanceCents ?? 0,
    });
  }

  async refreshAccountStatus(): Promise<AccountRow | null> {
    const account = this.db.getActiveAccount();
    if (!account) return null;
    const usage = await this.fetchUsageWithToken(account.access_token);
    if (!usage) return account;
    return this.db.upsertAccount({
      id: account.id,
      email: usage.email ?? account.email,
      url: account.url,
      access_token: account.access_token,
      refresh_token: account.refresh_token,
      token_expiry: account.token_expiry,
      plan: usage.plan ?? account.plan,
      plan_name: usage.planName ?? account.plan_name,
      credit_balance_cents:
        typeof usage.creditBalanceCents === "number"
          ? usage.creditBalanceCents
          : account.credit_balance_cents,
    });
  }

  private async fetchUsageWithToken(token: string): Promise<{
    userId?: string;
    email?: string;
    plan?: string;
    planName?: string;
    creditBalanceCents?: number;
  } | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/desktop/usage`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return (await res.json()) as {
        userId?: string;
        email?: string;
        plan?: string;
        planName?: string;
        creditBalanceCents?: number;
      };
    } catch {
      return null;
    }
  }
}
