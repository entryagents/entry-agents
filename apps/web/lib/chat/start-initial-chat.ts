import type { BuiltComposerMessage } from "@/app/sessions/[sessionId]/chats/[chatId]/components/chat-composer";
import { buildUserMessageFromComposerPayload } from "./build-user-message";

const MAX_KEEPALIVE_BODY_BYTES = 60_000;

interface StartInitialChatOnServerParams {
  sessionId: string;
  chatId: string;
  built: BuiltComposerMessage;
  fetchImpl?: typeof fetch;
}

export async function startInitialChatOnServer({
  sessionId,
  chatId,
  built,
  fetchImpl = globalThis.fetch,
}: StartInitialChatOnServerParams): Promise<void> {
  const userMessage = buildUserMessageFromComposerPayload(built.payload);
  const serializedBody = JSON.stringify({
    sessionId,
    chatId,
    messages: [userMessage],
  });

  const res = await fetchImpl("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: serializedBody,
    keepalive: serializedBody.length <= MAX_KEEPALIVE_BODY_BYTES,
  });

  if (!res.ok) {
    const errPayload = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(errPayload?.error ?? "Failed to start chat workflow");
  }

  // Handshake completed (`start(runAgentWorkflow)` & `claimChatActiveStreamId`
  // finished on the server). Cancel the local SSE reader so navigation does not
  // hold an unused response body; server execution continues durably.
  void res.body?.cancel().catch(() => {});
}

interface GenerateAndApplyInitialTitleParams {
  sessionId: string;
  chatId: string;
  displayText: string;
  onTitleResolved?: (title: string) => void;
  fetchImpl?: typeof fetch;
}

export async function generateAndApplyInitialTitle({
  sessionId,
  chatId,
  displayText,
  onTitleResolved,
  fetchImpl = globalThis.fetch,
}: GenerateAndApplyInitialTitleParams): Promise<void> {
  const trimmedText = displayText.trim();
  if (!trimmedText) {
    return;
  }

  const fallbackTitle =
    trimmedText.length > 50 ? `${trimmedText.slice(0, 50)}...` : trimmedText;

  let generatedTitle: string | null = null;
  try {
    const res = await fetchImpl("/api/generate-title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: trimmedText }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => null)) as {
        title?: unknown;
      } | null;
      if (typeof data?.title === "string") {
        const candidate = data.title.trim();
        if (candidate.length > 0) {
          generatedTitle = candidate;
        }
      }
    }
  } catch {
    // Fall back to truncated prompt title
  }

  const finalTitle = generatedTitle ?? fallbackTitle;
  onTitleResolved?.(finalTitle);

  await Promise.all([
    fetchImpl(`/api/sessions/${sessionId}/chats/${chatId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: finalTitle }),
      keepalive: true,
    }).catch(() => {}),
    fetchImpl(`/api/sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: finalTitle }),
      keepalive: true,
    }).catch(() => {}),
  ]);
}
