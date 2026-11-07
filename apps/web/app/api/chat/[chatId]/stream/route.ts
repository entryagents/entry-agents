import { createUIMessageStreamResponse, type InferUIMessageChunk } from "ai";
import { getRun } from "workflow/api";
import {
  requireAuthenticatedUser,
  requireOwnedChatById,
} from "@/app/api/chat/_lib/chat-context";
import type { WebAgentUIMessage } from "@/app/types";
import {
  compareAndSetChatActiveStreamId,
  updateChatActiveStreamId,
} from "@/lib/db/sessions";
import { getLatestCompletedWorkflowRunIdForChat } from "@/lib/db/workflow-runs";
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

async function openReadableStreamResponse(
  runId: string,
  startIndex: number | undefined,
): Promise<Response | null> {
  try {
    const readable = getRun(runId).getReadable<WebAgentUIMessageChunk>({
      startIndex,
    });
    const tailIndex = await readable.getTailIndex();
    const stream = createCancelableReadableStream(readable);

    return createUIMessageStreamResponse({
      stream,
      headers: {
        "x-workflow-run-id": runId,
        "x-workflow-stream-tail-index": String(tailIndex),
      },
    });
  } catch (error) {
    console.error("[chat-stream] readable open failed:", error);
    return null;
  }
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
  const { startIndex } = parsedStartIndex;
  const isMidStreamReconnect = typeof startIndex === "number" && startIndex > 0;

  if (!chat.activeStreamId) {
    // When a client was already reading a live stream (startIndex > 0) and
    // lost connectivity while the workflow finished and cleared activeStreamId,
    // replay the remaining chunks (startIndex..end) from the completed run so
    // the client receives the tail and real finish event without truncation.
    if (isMidStreamReconnect) {
      const completedRunId = await getLatestCompletedWorkflowRunIdForChat(
        chatId,
      ).catch(() => null);
      if (completedRunId) {
        const tailResponse = await openReadableStreamResponse(
          completedRunId,
          startIndex,
        );
        if (tailResponse) {
          return tailResponse;
        }
      }
    }
    return new Response(null, { status: 204 });
  }

  const runId = chat.activeStreamId;

  const outcome = await verifyRunState(runId);

  // "gone" covers both terminal runs and definitive not-found/expired:
  // the workflow is done — clear the stale activeStreamId using CAS so we
  // never clobber a newly claimed runId.
  if (outcome === "gone") {
    await compareAndSetChatActiveStreamId(chatId, runId, null).catch(() =>
      updateChatActiveStreamId(chatId, null),
    );
    if (isMidStreamReconnect) {
      const tailResponse = await openReadableStreamResponse(runId, startIndex);
      if (tailResponse) {
        return tailResponse;
      }
    }
    return new Response(null, { status: 204 });
  }
  // "unknown" (the probe itself kept failing transiently) hands back 204
  // WITHOUT clearing: the client's dead-turn recovery can regenerate, and
  // that new submit reconciles the stored id with fresh platform calls.
  if (outcome === "unknown") {
    return new Response(null, { status: 204 });
  }

  const liveResponse = await openReadableStreamResponse(runId, startIndex);
  if (liveResponse) {
    return liveResponse;
  }

  return new Response(null, { status: 204 });
}
