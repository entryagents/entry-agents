import { posix } from "node:path";
import type { WebAgentUIMessage, WebAgentUIMessagePart } from "@/app/types";

const REDACTED_READ_LINE = "[redacted from shared page]";
const REDACTED_WRITE_LINE = "[content redacted from shared page]";
const REDACTED_EDIT_OLD_LINE = "[previous content redacted from shared page]";
const REDACTED_EDIT_NEW_LINE = "[updated content redacted from shared page]";
const REDACTED_SECRET_LINE =
  "[line redacted from shared page -- looked like a secret]";

// SECURITY FIX (2026-08-27, pentest finding): this file only ever
// redacted structured read/write/edit/task tool parts, matched by
// ".env"-looking file paths. A shared session's raw `bash` tool
// stdout/stderr was never touched at all -- so a chat where the agent
// (or the user prompting it) ran something like `env`, `cat .env`, or
// `cat ~/.ssh/id_rsa` would show that output in full, unredacted, on
// the PUBLIC share page. This can't be scoped by filename the way
// read/write/edit can (a shell command's output has no single
// "filePath"), so instead scan line-by-line for common secret shapes
// and drop just those lines. Deliberately broad/heuristic (better to
// over-redact a line that merely looks like a secret than to leak a
// real one) rather than a blanket redaction of all bash output, which
// would gut the feature's main use (showing real command/test output).
const SECRET_LOOKING_LINE_PATTERNS: RegExp[] = [
  // KEY=value / export KEY=value style env-var lines.
  /^\s*(export\s+)?[A-Z][A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|API_KEY|ACCESS_KEY)\w*\s*=\s*\S+/i,
  // Common vendor-prefixed API key/token formats.
  /\b(sk-[a-zA-Z0-9]{16,}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{20,}|AKIA[0-9A-Z]{16}|ak_[a-zA-Z0-9]{16,}|xox[baprs]-[a-zA-Z0-9-]{10,})\b/,
  // PEM-style private key headers/footers.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /-----END [A-Z ]*PRIVATE KEY-----/,
  // Bearer/Authorization header echoes.
  /\bAuthorization:\s*Bearer\s+\S+/i,
  // Connection strings with embedded credentials (postgres://user:pass@host).
  /\b(postgres|postgresql|mysql|mariadb|mongodb(\+srv)?|redis|amqp|ftp):\/\/[^:\s/]+:[^@\s/]+@/i,
];

function redactSecretLookingText(text: string): string {
  if (text.length === 0) {
    return "";
  }

  return text
    .split("\n")
    .map((line) =>
      SECRET_LOOKING_LINE_PATTERNS.some((pattern) => pattern.test(line))
        ? REDACTED_SECRET_LINE
        : line,
    )
    .join("\n");
}

/**
 * Same line scan as redactSecretLookingText, but for read-tool output
 * whose lines carry a "123: " prefix: the prefix is preserved and only
 * the body is tested, so a secret on line 42 still redacts that line.
 */
function redactSecretLookingReadContent(content: string): string {
  if (content.length === 0) {
    return "";
  }

  return content
    .split("\n")
    .map((line) => {
      const prefix = line.match(/^(\d+:\s)/);
      const body = prefix ? line.slice(prefix[0].length) : line;
      return redactSecretLookingText(body) === body
        ? line
        : `${prefix ? prefix[0] : ""}${REDACTED_SECRET_LINE}`;
    })
    .join("\n");
}

function sanitizeBashOutput(output: unknown): unknown {
  if (!isRecord(output)) {
    return output;
  }

  return {
    ...output,
    stdout:
      typeof output.stdout === "string"
        ? redactSecretLookingText(output.stdout)
        : output.stdout,
    stderr:
      typeof output.stderr === "string"
        ? redactSecretLookingText(output.stderr)
        : output.stderr,
  };
}

type SensitiveToolName = "read" | "write" | "edit";
type NestedSensitiveToolName = SensitiveToolName | "task" | "bash";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEnvFilePath(filePath: unknown): filePath is string {
  if (typeof filePath !== "string") {
    return false;
  }

  const basename = posix.basename(filePath.replaceAll("\\", "/")).toLowerCase();
  return basename.startsWith(".env");
}

function redactText(text: string, linePlaceholder: string): string {
  if (text.length === 0) {
    return "";
  }

  return text
    .split("\n")
    .map(() => linePlaceholder)
    .join("\n");
}

function redactReadContent(content: string): string {
  if (content.length === 0) {
    return "";
  }

  return content
    .split("\n")
    .map((line) => {
      const linePrefixMatch = line.match(/^(\d+:\s).*/);
      return linePrefixMatch
        ? `${linePrefixMatch[1]}${REDACTED_READ_LINE}`
        : REDACTED_READ_LINE;
    })
    .join("\n");
}

function sanitizeReadOutput(output: unknown, fullRedact: boolean): unknown {
  if (!isRecord(output) || typeof output.content !== "string") {
    return output;
  }

  return {
    ...output,
    content: fullRedact
      ? redactReadContent(output.content)
      : redactSecretLookingReadContent(output.content),
  };
}

function sanitizeTaskOutput(output: unknown): unknown {
  if (!isRecord(output)) {
    return output;
  }

  if (output.type === "json" && isRecord(output.value)) {
    return {
      ...output,
      value: sanitizeTaskOutput(output.value),
    };
  }

  if (!Array.isArray(output.final)) {
    return output;
  }

  return {
    ...output,
    final: sanitizeSubagentFinalMessages(output.final),
  };
}

function sanitizeToolOutput(
  toolName: NestedSensitiveToolName,
  output: unknown,
  fullRedact: boolean,
): unknown {
  if (isRecord(output) && output.type === "json" && isRecord(output.value)) {
    return {
      ...output,
      value: sanitizeToolOutput(toolName, output.value, fullRedact),
    };
  }

  switch (toolName) {
    case "read":
      return sanitizeReadOutput(output, fullRedact);
    case "task":
      return sanitizeTaskOutput(output);
    case "bash":
      return sanitizeBashOutput(output);
    default:
      return output;
  }
}

function getSensitiveToolName(
  toolName: unknown,
  input: unknown,
): SensitiveToolName | null {
  if (
    (toolName === "read" || toolName === "write" || toolName === "edit") &&
    isRecord(input)
  ) {
    return toolName;
  }

  return null;
}

/** .env-style paths get whole-content redaction; everything else is line-scanned. */
function isFullRedactFilePath(input: unknown): boolean {
  return isRecord(input) && isEnvFilePath(input.filePath);
}

function sanitizeToolCallInput(
  toolName: SensitiveToolName,
  input: unknown,
  fullRedact: boolean,
): unknown {
  if (!isRecord(input)) {
    return input;
  }

  const redactString = (text: string, placeholder: string): string =>
    fullRedact ? redactText(text, placeholder) : redactSecretLookingText(text);

  switch (toolName) {
    case "read":
      return input;
    case "write":
      return {
        ...input,
        content:
          typeof input.content === "string"
            ? redactString(input.content, REDACTED_WRITE_LINE)
            : input.content,
      };
    case "edit":
      return {
        ...input,
        oldString:
          typeof input.oldString === "string"
            ? redactString(input.oldString, REDACTED_EDIT_OLD_LINE)
            : input.oldString,
        newString:
          typeof input.newString === "string"
            ? redactString(input.newString, REDACTED_EDIT_NEW_LINE)
            : input.newString,
      };
  }
}

function sanitizeSubagentFinalMessages(messages: unknown): unknown {
  if (!Array.isArray(messages)) {
    return messages;
  }

  const nestedSensitiveToolCalls = new Map<
    string,
    { tool: NestedSensitiveToolName; fullRedact: boolean }
  >();

  for (const message of messages) {
    if (!isRecord(message) || message.role !== "assistant") {
      continue;
    }

    const content = message.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!isRecord(part) || part.type !== "tool-call") {
        continue;
      }

      if (typeof part.toolCallId !== "string") {
        continue;
      }

      const sensitiveToolName = getSensitiveToolName(part.toolName, part.input);
      if (sensitiveToolName) {
        nestedSensitiveToolCalls.set(part.toolCallId, {
          tool: sensitiveToolName,
          fullRedact: isFullRedactFilePath(part.input),
        });
        continue;
      }

      if (part.toolName === "task") {
        nestedSensitiveToolCalls.set(part.toolCallId, {
          tool: "task",
          fullRedact: false,
        });
        continue;
      }

      // SECURITY FIX (2026-08-27, pentest finding): a sub-agent's own
      // bash calls inside a task's final message log were never
      // secret-scanned, unlike the top-level tool-bash handling above.
      if (part.toolName === "bash") {
        nestedSensitiveToolCalls.set(part.toolCallId, {
          tool: "bash",
          fullRedact: false,
        });
      }
    }
  }

  return messages.map((message) => {
    if (!isRecord(message) || !Array.isArray(message.content)) {
      return message;
    }

    return {
      ...message,
      content: message.content.map((part) => {
        if (!isRecord(part)) {
          return part;
        }

        if (part.type === "tool-call") {
          const sensitiveToolName = getSensitiveToolName(
            part.toolName,
            part.input,
          );
          if (!sensitiveToolName) {
            return part;
          }

          return {
            ...part,
            input: sanitizeToolCallInput(
              sensitiveToolName,
              part.input,
              isFullRedactFilePath(part.input),
            ),
          };
        }

        if (
          part.type === "tool-result" &&
          typeof part.toolCallId === "string" &&
          nestedSensitiveToolCalls.has(part.toolCallId)
        ) {
          const nested = nestedSensitiveToolCalls.get(part.toolCallId);
          if (!nested) {
            return part;
          }

          return {
            ...part,
            output: sanitizeToolOutput(
              nested.tool,
              part.output,
              nested.fullRedact,
            ),
          };
        }

        return part;
      }),
    };
  });
}

function sanitizeMessagePart(
  part: WebAgentUIMessagePart,
): WebAgentUIMessagePart {
  switch (part.type) {
    case "tool-read":
      if (part.state !== "output-available") {
        return part;
      }

      return {
        ...part,
        output: sanitizeReadOutput(
          part.output,
          isFullRedactFilePath(part.input),
        ) as typeof part.output,
      } as WebAgentUIMessagePart;
    case "tool-write":
      return {
        ...part,
        input: sanitizeToolCallInput(
          "write",
          part.input,
          isFullRedactFilePath(part.input),
        ) as typeof part.input,
      } as WebAgentUIMessagePart;
    case "tool-edit":
      return {
        ...part,
        input: sanitizeToolCallInput(
          "edit",
          part.input,
          isFullRedactFilePath(part.input),
        ) as typeof part.input,
      } as WebAgentUIMessagePart;
    case "tool-task":
      if (part.state !== "output-available") {
        return part;
      }

      return {
        ...part,
        output: sanitizeTaskOutput(part.output) as typeof part.output,
      } as WebAgentUIMessagePart;
    case "tool-bash":
      if (part.state !== "output-available") {
        return part;
      }

      return {
        ...part,
        output: sanitizeBashOutput(part.output) as typeof part.output,
      } as WebAgentUIMessagePart;
    default:
      return part;
  }
}

export function redactSharedEnvContent(
  message: WebAgentUIMessage,
): WebAgentUIMessage {
  return {
    ...message,
    parts: message.parts.map(sanitizeMessagePart),
  };
}
