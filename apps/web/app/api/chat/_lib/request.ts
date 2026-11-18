import { z } from "zod";
import type { WebAgentUIMessage } from "@/app/types";

export interface ChatRequestBody {
  messages: WebAgentUIMessage[];
  sessionId?: string;
  chatId?: string;
  teamRoleModels?: Record<string, string>;
}

const chatMessageSchema = z
  .object({
    id: z.string().min(1),
    role: z.enum(["user", "assistant", "system"]),
    parts: z.array(z.record(z.string(), z.unknown())),
  })
  .passthrough();

const chatRequestBodySchema = z
  .object({
    messages: z.array(chatMessageSchema),
    sessionId: z.string().min(1).optional(),
    chatId: z.string().min(1).optional(),
    teamRoleModels: z.record(z.string(), z.string()).optional(),
  })
  .passthrough();

type ParseChatRequestResult =
  | {
      ok: true;
      body: ChatRequestBody;
    }
  | {
      ok: false;
      response: Response;
    };

type RequireChatIdentifiersResult =
  | {
      ok: true;
      sessionId: string;
      chatId: string;
    }
  | {
      ok: false;
      response: Response;
    };

export async function parseChatRequestBody(
  req: Request,
): Promise<ParseChatRequestResult> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
    };
  }

  const parsed = chatRequestBodySchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: Response.json(
        { error: "Invalid request body" },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    body: parsed.data as unknown as ChatRequestBody,
  };
}

export function requireChatIdentifiers(
  body: ChatRequestBody,
): RequireChatIdentifiersResult {
  if (!body.sessionId || !body.chatId) {
    return {
      ok: false,
      response: Response.json(
        { error: "sessionId and chatId are required" },
        { status: 400 },
      ),
    };
  }

  return {
    ok: true,
    sessionId: body.sessionId,
    chatId: body.chatId,
  };
}
