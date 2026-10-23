import type { WebAgentUIMessage } from "@/app/types";

/**
 * Strips heavy binary payloads (e.g. base64 image data URLs, binary file blobs, video streams)
 * before persisting messages to the PostgreSQL database (Neon).
 * Preserves user prompts, assistant replies, reasoning tokens, tool invocations, and tool outputs.
 */
export function sanitizeMessageForDatabase<T extends WebAgentUIMessage>(message: T): T {
  if (!message || !Array.isArray(message.parts)) {
    return message;
  }

  const sanitizedParts = message.parts.map((p) => {
    const part = p as Record<string, unknown>;
    // 1. Sanitize image parts with base64 data URLs
    if (part.type === "image") {
      const img = part.image;
      if (typeof img === "string" && (img.startsWith("data:") || img.length > 2048)) {
        return {
          ...part,
          image: "[Media attached - binary omitted from db storage]",
        };
      }
    }

    // 2. Sanitize file or video parts containing large base64 buffers
    if (part.type === "file" || part.type === "video") {
      const data = part.data;
      if (typeof data === "string" && data.length > 512) {
        return {
          ...part,
          data: "[Binary file data omitted from db storage]",
        };
      }
    }

    // 3. Sanitize tool results with massive payloads (> 64 KB)
    if (part.type === "tool-invocation" || part.type === "tool-result") {
      const result = part.result;
      if (typeof result === "string" && result.length > 65_536) {
        return {
          ...part,
          result: result.slice(0, 65_536) + "\n...[output truncated for db storage]",
        };
      }
    }

    return part;
  }) as T["parts"];

  return {
    ...message,
    parts: sanitizedParts,
  };
}
