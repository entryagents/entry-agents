import { createUIMessageStreamResponse, type InferUIMessageChunk } from "ai";
import { getRun } from "workflow/api";
import {
  requireAuthenticatedUser,
  requireOwnedChatById,
} from "@/app/api/chat/_lib/chat-context";
import type { WebAgentUIMessage } from "@/app/types";
import { updateChatActiveStreamId } from "@/lib/db/sessions";
import { createCancelableReadableStream } from "@/lib/chat/create-cancelable-readable-stream";
import { verifyRunState } from "@/lib/workflow-run-recovery";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

type WebAgentUIMessageChunk = InferUIMessageChunk<WebAgentUIMessage>;

type ParseStartIndexResult =
  | {
      ok: true;
      startIndex: number | undefined;
    }
  | {
      ok: false;
      response: Response;
    };

function parseStartIndex(request: Request): ParseStartIndexResult {
  const startIndexParam = new URL(request.url).searchParams.get("startIndex");
  if (startIndexParam === null) {
    return { ok: true, startIndex: undefined };
  }

  const startIndex = Number.parseInt(startIndexParam, 10);
  if (Number.isNaN(startIndex)) {
    return {
      ok: false,
      response: new Response("Invalid startIndex", { status: 400 }),
    };
  }

  return { ok: true, startIndex };
}

export async function GET(request: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser("text");
  if (!authResult.ok) {
    return authResult.response;
  }

  const parsedStartIndex = parseStartIndex(request);
  if (!parsedStartIndex.ok) {
    return parsedStartIndex.response;
  }

  const { chatId } = await context.params;

  const chatContext = await requireOwnedChatById({
    userId: authResult.userId,
    chatId,
    format: "text",
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const { chat } = chatContext;

  if (!chat.activeStreamId) {
    return new Response(null, { status: 204 });
  }

  const runId = chat.activeStreamId;

  const outcome = await verifyRunState(runId);

  // "gone" covers both terminal runs and definitive not-found/expired:
  // the workflow is done — clear the stale activeStreamId. A reconnecting
  // client hydrates the persisted messages instead of a resumed stream.
  if (outcome === "gone") {
    await updateChatActiveStreamId(chatId, null);
    return new Response(null, { status: 204 });
  }
  // "unknown" (the probe itself kept failing transiently) hands back 204
  // WITHOUT clearing: the client's dead-turn recovery can regenerate, and
  // that new submit reconciles the stored id with fresh platform calls.
  if (outcome === "unknown") {
    return new Response(null, { status: 204 });
  }

  try {
    const readable = getRun(runId).getReadable<WebAgentUIMessageChunk>({
      startIndex: parsedStartIndex.startIndex,
    });
    const tailIndex = await readable.getTailIndex();
    const stream = createCancelableReadableStream(readable);

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "x-workflow-stream-tail-index": String(tailIndex),
      },
    });
  } catch (error) {
    // The verify step above already filtered out an alive run; a lookup
    // hiccup here is momentary, so hand back 204 (no state cleared) and let
    // the client's recovevery loop retry rather than dropping the id.
    console.error("[chat-stream] readable open failed:", error);
    return new Response(null, { status: 204 });
  }
}
