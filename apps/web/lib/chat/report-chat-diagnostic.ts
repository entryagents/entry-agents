"use client";

export type ChatDiagnosticEventType =
  | "stream-divergence"
  | "stream-reconnect"
  | "message-rollback"
  | "snapshot-reconcile"
  | "stream-error";

const CLIENT_THROTTLE_MS = 10_000;
const lastSentByKey = new Map<string, number>();

/**
 * Fire-and-forget client beacon for streaming/UI anomalies (glitches,
 * divergence, rollbacks). Client-throttled AND server-capped so it never
 * floods the network or Postgres.
 */
export function reportChatDiagnostic(params: {
  sessionId: string;
  chatId: string;
  eventType: ChatDiagnosticEventType;
  workflowRunId?: string | null;
  details?: Record<string, unknown>;
}): void {
  const key = `${params.chatId}:${params.eventType}`;
  const now = Date.now();
  const prev = lastSentByKey.get(key) ?? 0;
  if (now - prev < CLIENT_THROTTLE_MS) {
    return;
  }
  lastSentByKey.set(key, now);

  void fetch(
    `/api/sessions/${encodeURIComponent(params.sessionId)}/chats/${encodeURIComponent(params.chatId)}/diagnostics`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: params.eventType,
        workflowRunId: params.workflowRunId ?? null,
        details: params.details ?? {},
      }),
      keepalive: true,
    },
  ).catch(() => {
    // Diagnostics must never disrupt chat execution
  });
}
