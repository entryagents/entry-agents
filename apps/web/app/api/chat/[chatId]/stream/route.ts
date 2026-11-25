import { createUIMessageStreamResponse, type InferUIMessageChunk } from "ai";
import { getRun } from "workflow/api";
import {
  requireAuthenticatedUser,
  requireOwnedChatById,
} from "@/app/api/chat/_lib/chat-context";
import type { WebAgentUIMessage } from "@/app/types";
import {
  ACTIVE_CHAT_RUN_STATUSES,
  compareAndSetChatActiveStreamId,
} from "@/lib/db/sessions";
import { getLatestCompletedWorkflowRunIdForChat } from "@/lib/db/workflow-runs";
import { createCancelableReadableStream } from "@/lib/chat/create-cancelable-readable-stream";
import { withSseHeartbeat } from "@/lib/chat/sse-heartbeat";
import { verifyRunState } from "@/lib/workflow-run-recovery";

export const maxDuration = 300;

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
    const tailIndex =
      typeof startIndex === "number" && startIndex < 0
        ? await readable.getTailIndex()
        : undefined;
    const stream = createCancelableReadableStream(readable);

    return withSseHeartbeat(
      createUIMessageStreamResponse({
        stream,
        headers: {
          "x-workflow-run-id": runId,
          ...(tailIndex !== undefined
            ? { "x-workflow-stream-tail-index": String(tailIndex) }
            : {}),
        },
      }),
    );
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
  const isMidTurnHeader = request.headers.get("x-entry-mid-turn") === "1";
  const isMidStreamReconnect =
    (typeof startIndex === "number" && startIndex > 0) || isMidTurnHeader;

  if (!chat.activeStreamId) {
    // If DB status shows a freshly started/active run whose workflow step
    // hasn't claimed activeStreamId yet, tell the client to retry regardless
    // of request headers instead of returning 204 and terminating the turn.
    const isRecentlyActive =
      ACTIVE_CHAT_RUN_STATUSES.some((s) => s === chat.status) &&
      (!chat.runStatusUpdatedAt ||
        Date.now() - new Date(chat.runStatusUpdatedAt).getTime() < 45_000);
    if (isRecentlyActive) {
      return new Response("Stream initializing", {
        status: 503,
        headers: { "Retry-After": "1" },
      });
    }

    // When a client was already reading a live stream (startIndex > 0 or active mid-turn)
    // and lost connectivity while the workflow finished and cleared activeStreamId,
    // replay the remaining chunks from the completed run so the client receives the
    // complete output and real finish event without losing its turn.
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
    await compareAndSetChatActiveStreamId(chatId, runId, null).catch((err) => {
      console.error(
        `[chat-stream] Failed to clear stale activeStreamId ${runId} for chat ${chatId}:`,
        err,
      );
    });
    if (isMidStreamReconnect) {
      const tailResponse = await openReadableStreamResponse(runId, startIndex);
      if (tailResponse) {
        return tailResponse;
      }
    }
    return new Response(null, { status: 204 });
  }

  // "unknown" means the Workflow API probe itself kept failing transiently.
  // Never clear activeStreamId and NEVER return 204 (which kills an active turn):
  // signal 503 so AbortableChatTransport cleanly waits and retries.
  if (outcome === "unknown") {
    return new Response("Workflow status temporarily unavailable", {
      status: 503,
      headers: { "Retry-After": "2" },
    });
  }

  const liveResponse = await openReadableStreamResponse(runId, startIndex);
  if (liveResponse) {
    return liveResponse;
  }

  // An active run failed transiently to open its readable stream; retry instead
  // of terminating the turn early with 204.
  return new Response("Stream temporarily unavailable", {
    status: 503,
    headers: { "Retry-After": "2" },
  });
}
