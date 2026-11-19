import type { ComposerMessagePayload } from "@/app/sessions/[sessionId]/chats/[chatId]/components/chat-composer";
import type { WebAgentUIMessage } from "@/app/types";

export function buildUserMessageFromComposerPayload(
  payload: ComposerMessagePayload,
  messageId: string = crypto.randomUUID(),
): WebAgentUIMessage {
  const parts: WebAgentUIMessage["parts"] = [];

  if ("parts" in payload) {
    parts.push(...payload.parts);
  } else {
    if (payload.text.length > 0) {
      parts.push({ type: "text", text: payload.text });
    }
    if (payload.files?.length) {
      parts.push(...payload.files);
    }
  }

  return {
    id: messageId,
    role: "user",
    parts,
  };
}
