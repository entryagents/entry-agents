const WORKFLOW_HOOKS_REGISTERED_KEY = Symbol.for(
  "entry-agents.workflow.lifecycleHooksRegistered",
);

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const g = globalThis as Record<PropertyKey, unknown>;
  if (g[WORKFLOW_HOOKS_REGISTERED_KEY]) {
    return;
  }
  g[WORKFLOW_HOOKS_REGISTERED_KEY] = true;

  const { registerLifecycleHooks } = await import("workflow/api");

  registerLifecycleHooks({
    async onRunFailed({ run, workflowName, error }) {
      if (!workflowName.includes("runAgentWorkflow")) {
        return;
      }

      const workflowRunId = run.runId;
      const errorCode = error.errorCode ?? "UNKNOWN";
      const causeMessage =
        error.cause instanceof Error
          ? error.cause.message
          : typeof error.cause === "string"
            ? error.cause
            : error.message;

      console.error(
        `[workflow-lifecycle] runAgentWorkflow failed (${errorCode}) for run ${workflowRunId}: ${causeMessage}`,
      );

      try {
        const [{ db }, { chatDiagnosticEvents, chats, sessions }, { eq }] =
          await Promise.all([
            import("@/lib/db/client"),
            import("@/lib/db/schema"),
            import("drizzle-orm"),
          ]);

        const [stuckChat] = await db
          .select({
            id: chats.id,
            sessionId: chats.sessionId,
            activeStreamId: chats.activeStreamId,
            userId: sessions.userId,
          })
          .from(chats)
          .innerJoin(sessions, eq(sessions.id, chats.sessionId))
          .where(eq(chats.activeStreamId, workflowRunId))
          .limit(1);

        if (!stuckChat) {
          return;
        }

        const [
          { compareAndSetChatActiveStreamId, setChatRunStatus },
          { releaseUserBillingTurn },
        ] = await Promise.all([
          import("@/lib/db/sessions"),
          import("@/lib/billing/credit-ledger"),
        ]);

        await Promise.allSettled([
          setChatRunStatus(stuckChat.id, "failed", {
            onlyIfActiveStreamId: workflowRunId,
          }),
          compareAndSetChatActiveStreamId(stuckChat.id, workflowRunId, null),
          releaseUserBillingTurn(stuckChat.userId, workflowRunId),
          db.insert(chatDiagnosticEvents).values({
            id: crypto.randomUUID(),
            chatId: stuckChat.id,
            sessionId: stuckChat.sessionId,
            workflowRunId,
            userId: stuckChat.userId,
            eventType: "workflow-runtime-failed",
            detailsJson: {
              errorCode,
              workflowName,
              message: causeMessage.slice(0, 500),
            },
          }),
        ]);
      } catch (cleanupErr) {
        console.error(
          `[workflow-lifecycle] Failed to clean up after run ${workflowRunId}:`,
          cleanupErr,
        );
      }
    },
  });
}
