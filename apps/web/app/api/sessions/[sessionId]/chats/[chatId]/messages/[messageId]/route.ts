import { getRun } from "workflow/api";
import {
  requireAuthenticatedUser,
  requireOwnedSessionChat,
} from "@/app/api/sessions/_lib/session-context";
import { isDefinitelyGoneRunError } from "@/lib/workflow-run-recovery";
import {
  deleteChatMessageAndFollowing,
  updateChatActiveStreamId,
} from "@/lib/db/sessions";

type RouteContext = {
  params: Promise<{ sessionId: string; chatId: string; messageId: string }>;
};

export async function DELETE(req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId, chatId, messageId } = await context.params;

  const chatContext = await requireOwnedSessionChat({
    userId: authResult.userId,
    sessionId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const { chat } = chatContext;

  if (chat.activeStreamId) {
    // Check if the workflow is actually still running. If it terminated
    // without cleaning up (e.g. due to a failure), clear the stale ID
    // and allow the delete to proceed.
    try {
      const run = getRun(chat.activeStreamId);
      const status = await run.status;
      if (status === "running" || status === "pending") {
        return Response.json(
          { error: "Cannot delete messages while a response is streaming" },
          { status: 409 },
        );
      }
    } catch (error) {
      // Only a definitive not-found/expired proves the id is stale. A
      // transient failure must NOT clear it: that would let this delete
      // remove messages out from under a workflow that is still writing
      // them.
      if (!isDefinitelyGoneRunError(error)) {
        return Response.json(
          {
            error:
              "Temporarily unable to verify this chat's active run. Please retry.",
          },
          { status: 503, headers: { "Retry-After": "1" } },
        );
      }
      // Definitively gone — treat as stale and fall through.
    }

    // Workflow is terminal or definitively gone — clear the stale
    // activeStreamId.
    await updateChatActiveStreamId(chatId, null);
  }

  const result = await deleteChatMessageAndFollowing(chatId, messageId);

  if (result.status === "not_found") {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  if (result.status === "not_user_message") {
    return Response.json(
      { error: "Only user messages can be deleted" },
      { status: 400 },
    );
  }

  return Response.json({
    success: true,
    deletedMessageIds: result.deletedMessageIds,
  });
}
