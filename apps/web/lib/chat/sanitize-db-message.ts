import type { SecretRedactor } from "@entry-agents/agent";
import type { WebAgentUIMessage } from "@/app/types";

/**
 * Strips heavy binary payloads (e.g. base64 image data URLs, binary file blobs, video streams)
 * and optionally scrubs runtime secret values before persisting messages to PostgreSQL.
 * Preserves user prompts, assistant replies, reasoning tokens, tool invocations, and tool outputs.
 */
export function sanitizeMessageForDatabase<T extends WebAgentUIMessage>(
  message: T,
  redactor?: SecretRedactor,
): T {
  if (!message || !Array.isArray(message.parts)) {
    return message;
  }

  const sanitizedParts = message.parts.map((p) => {
    const part = p as Record<string, unknown>;
    // 1. Sanitize image parts with base64 data URLs
    if (part.type === "image") {
      const img = part.image;
      if (
        typeof img === "string" &&
        (img.startsWith("data:") || img.length > 2048)
      ) {
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
    const isToolPart =
      part.type === "tool-invocation" ||
      part.type === "tool-result" ||
      part.type === "dynamic-tool" ||
      (typeof part.type === "string" && part.type.startsWith("tool-"));

    if (isToolPart) {
      let updated: Record<string, unknown> | null = null;
      const result = part.result;
      if (typeof result === "string" && result.length > 65_536) {
        updated = {
          ...(updated ?? part),
          result:
            result.slice(0, 65_536) + "\n...[output truncated for db storage]",
        };
      }
      const output = part.output;
      if (typeof output === "string" && output.length > 65_536) {
        updated = {
          ...(updated ?? part),
          output:
            output.slice(0, 65_536) + "\n...[output truncated for db storage]",
        };
      } else if (
        output !== undefined &&
        output !== null &&
        typeof output === "object"
      ) {
        try {
          const serialized = JSON.stringify(output);
          if (serialized.length > 131_072) {
            updated = {
              ...(updated ?? part),
              output: {
                truncated: true,
                preview:
                  serialized.slice(0, 65_536) +
                  "\n...[output truncated for db storage]",
              },
            };
          }
        } catch {
          // Ignore non-serializable values
        }
      }
      if (updated) {
        return updated;
      }
    }

    return part;
  }) as T["parts"];

  const redactedParts =
    redactor && redactor.hasSecrets()
      ? (redactor.redactUnknown(sanitizedParts) as T["parts"])
      : sanitizedParts;

  return {
    ...message,
    parts: redactedParts,
  };
}
