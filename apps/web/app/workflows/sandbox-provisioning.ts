import { getWorkflowMetadata } from "workflow";

async function runProvisioning(sessionId: string, runId: string) {
  "use step";

  const [
    { toErrorMessage },
    {
      claimSessionSandboxProvisioningRunId,
      clearSessionSandboxProvisioningRunIdIfOwned,
      getSessionById,
      updateSession,
    },
    { provisionSessionSandbox, SessionArchivedDuringProvisioningError },
  ] = await Promise.all([
    import("@entry-agents/sandbox"),
    import("@/lib/db/sessions"),
    import("@/lib/sandbox/provisioning"),
  ]);

  const session = await getSessionById(sessionId);
  if (!session) {
    return { skipped: true, reason: "session-not-found" };
  }
  if (session.sandboxProvisioningRunId === null) {
    const claimed = await claimSessionSandboxProvisioningRunId(
      sessionId,
      runId,
    );
    if (!claimed) {
      return { skipped: true, reason: "run-replaced" };
    }
  } else if (session.sandboxProvisioningRunId !== runId) {
    return { skipped: true, reason: "run-replaced" };
  }

  try {
    const result = await provisionSessionSandbox({ sessionId });
    await clearSessionSandboxProvisioningRunIdIfOwned(sessionId, runId);
    return {
      skipped: false,
      sandboxState: result.sandboxState,
    };
  } catch (error) {
    if (error instanceof SessionArchivedDuringProvisioningError) {
      await clearSessionSandboxProvisioningRunIdIfOwned(sessionId, runId);
      return { skipped: true, reason: "session-archived" };
    }

    // Use toErrorMessage() (not bare error.message) so the persisted
    // lifecycleError carries the real API response body -- the Modal SDK
    // keeps .message generic ("Status code 400 is not ok") and puts the
    // actual cause on separate .text/.json properties. Same
    // generic-message gap as the earlier Vercel-era incidents, so the
    // helper stayed provider-neutral and moved into the sandbox
    // package root.
    const message = await toErrorMessage(error);
    await updateSession(sessionId, {
      lifecycleState: "failed",
      lifecycleError: message,
    });
    await clearSessionSandboxProvisioningRunIdIfOwned(sessionId, runId);
    throw error;
  }
}

export async function sandboxProvisioningWorkflow(sessionId: string) {
  "use workflow";

  const { workflowRunId } = getWorkflowMetadata();
  return runProvisioning(sessionId, workflowRunId);
}
