import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { buildExecutorMcpUrl, DEFAULT_EXECUTOR_MCP_URL } from "./executor-mcp";

export const EXECUTOR_OAUTH_ISSUER = "https://executor.sh/api/auth";
export const EXECUTOR_OAUTH_AUTHORIZE_URL =
  "https://app.executor.sh/api/auth/oauth2/authorize";
export const EXECUTOR_OAUTH_TOKEN_URL =
  "https://app.executor.sh/api/auth/oauth2/token";
export const EXECUTOR_OAUTH_REGISTER_URL =
  "https://app.executor.sh/api/auth/oauth2/register";
export const EXECUTOR_OAUTH_COOKIE_NAME = "entry_executor_oauth";

const EXECUTOR_OAUTH_SCOPES = "mcp offline_access";
const STATE_TTL_MS = 10 * 60 * 1000;

interface RegisteredOAuthClient {
  clientId: string;
  clientSecret?: string;
}

const dcrClientCache = new Map<string, RegisteredOAuthClient>();

export interface ExecutorOAuthStatePayload {
  userId: string;
  state: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  mcpUrl: string;
  connectionId?: string;
  createdAt: number;
}

export interface ExecutorOAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

function getSigningSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required for Executor OAuth state");
  }
  return secret;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(`${normalized}${"=".repeat(padding)}`, "base64").toString(
    "utf8",
  );
}

export function createPkcePair(): {
  codeVerifier: string;
  codeChallenge: string;
} {
  const codeVerifier = base64UrlEncode(randomBytes(32));
  const digest = createHash("sha256").update(codeVerifier).digest();
  return {
    codeVerifier,
    codeChallenge: base64UrlEncode(digest),
  };
}

export function signExecutorOAuthState(
  payload: ExecutorOAuthStatePayload,
): string {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", getSigningSecret()).update(encoded).digest();
  return `${encoded}.${base64UrlEncode(sig)}`;
}

export function verifyExecutorOAuthState(
  token: string | undefined,
): ExecutorOAuthStatePayload | null {
  if (!token) return null;
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;

  const expected = createHmac("sha256", getSigningSecret())
    .update(encoded)
    .digest();
  const actual = Buffer.from(
    sig.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      base64UrlDecode(encoded),
    ) as ExecutorOAuthStatePayload;
    if (
      !parsed.userId ||
      !parsed.state ||
      !parsed.codeVerifier ||
      !parsed.clientId ||
      !parsed.redirectUri
    ) {
      return null;
    }
    if (Date.now() - parsed.createdAt > STATE_TTL_MS) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function ensureExecutorOAuthClient(
  redirectUri: string,
): Promise<RegisteredOAuthClient> {
  const envClientId = process.env.EXECUTOR_OAUTH_CLIENT_ID?.trim();
  const envClientSecret = process.env.EXECUTOR_OAUTH_CLIENT_SECRET?.trim();
  if (envClientId) {
    return {
      clientId: envClientId,
      clientSecret: envClientSecret || undefined,
    };
  }

  const cached = dcrClientCache.get(redirectUri);
  if (cached) {
    return cached;
  }

  const res = await fetch(EXECUTOR_OAUTH_REGISTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_name: "Entry Agents",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: EXECUTOR_OAUTH_SCOPES,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Executor OAuth client registration failed (${res.status}): ${bodyText.slice(0, 180)}`,
    );
  }

  const data = JSON.parse(bodyText) as {
    client_id?: string;
    client_secret?: string;
  };
  if (!data.client_id) {
    throw new Error("Executor OAuth DCR response omitted client_id");
  }

  const client: RegisteredOAuthClient = {
    clientId: data.client_id,
    clientSecret: data.client_secret || undefined,
  };
  dcrClientCache.set(redirectUri, client);
  return client;
}

export function buildExecutorAuthorizeUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  mcpUrl?: string;
  connectionId?: string;
}): string {
  const resource = buildExecutorMcpUrl({
    baseUrl: options.mcpUrl || DEFAULT_EXECUTOR_MCP_URL,
    authMode: "oauth",
    connectionId: options.connectionId,
  });

  const url = new URL(EXECUTOR_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", options.clientId);
  url.searchParams.set("redirect_uri", options.redirectUri);
  url.searchParams.set("scope", EXECUTOR_OAUTH_SCOPES);
  url.searchParams.set("state", options.state);
  url.searchParams.set("code_challenge", options.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", resource);
  return url.toString();
}

export async function exchangeExecutorOAuthCode(options: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  clientId: string;
  clientSecret?: string;
  mcpUrl?: string;
  connectionId?: string;
}): Promise<ExecutorOAuthTokenResponse> {
  const resource = buildExecutorMcpUrl({
    baseUrl: options.mcpUrl || DEFAULT_EXECUTOR_MCP_URL,
    authMode: "oauth",
    connectionId: options.connectionId,
  });

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: options.codeVerifier,
    client_id: options.clientId,
    resource,
  });
  if (options.clientSecret) {
    form.set("client_secret", options.clientSecret);
  }

  const res = await fetch(EXECUTOR_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  const rawText = await res.text();
  if (!res.ok) {
    throw new Error(
      `Executor OAuth token exchange failed (${res.status}): ${rawText.slice(0, 200)}`,
    );
  }

  const data = JSON.parse(rawText) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("Executor OAuth token response omitted access_token");
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:
      typeof data.expires_in === "number"
        ? Date.now() + data.expires_in * 1000
        : undefined,
  };
}

export async function refreshExecutorOAuthToken(options: {
  refreshToken: string;
  clientId: string;
  clientSecret?: string;
}): Promise<ExecutorOAuthTokenResponse | null> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: options.refreshToken,
    client_id: options.clientId,
  });
  if (options.clientSecret) {
    form.set("client_secret", options.clientSecret);
  }

  try {
    const res = await fetch(EXECUTOR_OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!data.access_token) return null;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? options.refreshToken,
      expiresAt:
        typeof data.expires_in === "number"
          ? Date.now() + data.expires_in * 1000
          : undefined,
    };
  } catch {
    return null;
  }
}
