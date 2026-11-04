import { shell } from "electron";

export interface DesktopAuthSession {
  sessionToken: string;
  userId: string;
}

interface StartResponse {
  device_code: string;
  code: string;
  expires_at: string;
  poll_interval_seconds?: number;
}

interface PollResponse {
  status: "pending" | "approved" | "expired";
  session_token?: string;
  user_id?: string;
}

/** Entry's browser-assisted desktop sign-in. The session token stays in the
 * Electron main process and is never put in an environment variable. */
export async function signInDesktop(
  backendBaseUrl: string,
  webBaseUrl: string,
): Promise<DesktopAuthSession> {
  const start = await fetch(`${backendBaseUrl}/api/desktop/device/start`, {
    method: "POST",
  });
  if (!start.ok)
    throw new Error(`Desktop sign-in could not start (${start.status})`);
  const request = (await start.json()) as StartResponse;

  await shell.openExternal(
    `${webBaseUrl}/desktop/approve?code=${encodeURIComponent(request.code)}`,
  );

  const deadline = Date.parse(request.expires_at);
  const interval = Math.max(1000, (request.poll_interval_seconds ?? 3) * 1000);
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, interval));
    const poll = await fetch(`${backendBaseUrl}/api/desktop/device/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_code: request.device_code }),
    });
    if (!poll.ok)
      throw new Error(`Desktop sign-in polling failed (${poll.status})`);
    const result = (await poll.json()) as PollResponse;
    if (
      result.status === "approved" &&
      result.session_token &&
      result.user_id
    ) {
      return { sessionToken: result.session_token, userId: result.user_id };
    }
    if (result.status === "expired") throw new Error("Desktop sign-in expired");
  }
  throw new Error("Desktop sign-in expired");
}
