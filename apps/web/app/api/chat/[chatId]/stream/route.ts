import { createUIMessageStreamResponse, type InferUIMessageChunk } from "ai";
import { getRun } from "workflow/api";
import {
  requireAuthenticatedUser,
  requireOwnedChatById,
} from "@/app/api/chat/_lib/chat-context";
import type { WebAgentUIMessage } from "@/app/types";
import { updateChatActiveStreamId } from "@/lib/db/sessions";
import { createCancelableReadableStream } from "@/lib/chat/create-cancelable-readable-stream";
import { isDefinitelyGoneRunError } from "@/lib/workflow-run-recovery";

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

  try {
    const run = getRun(runId);
    const status = await run.status;

    if (
      status === "completed" ||
      status === "cancelled" ||
      status === "failed"
    ) {
      // Workflow is done — clear the stale activeStreamId.
      await updateChatActiveStreamId(chatId, null);
      return new Response(null, { status: 204 });
    }

    const readable = run.getReadable<WebAgentUIMessageChunk>({
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
    // Only a definitive "run does not exist / aged out" proves the stored
    // id is stale. A transient failure (network, throttling, world error)
    // must be retryable: answering 204 here tells the client the stream is
    // gone for good, so a reconnecting client gives up on a run that is
    // very much alive.
    if (!isDefinitelyGoneRunError(error)) {
      return new Response(null, {
        status: 503,
        headers: { "Retry-After": "1" },
      });
    }

    await updateChatActiveStreamId(chatId, null);
    return new Response(null, { status: 204 });
  }
}
