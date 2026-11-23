/**
 * Measures serialized payload byte sizes and Workflow Event counts across a
 * realistic 50-step Entry coding agent run, comparing pre-PR #272 vs post-PR #272.
 *
 * Run: bun run apps/web/scripts/measure-workflow-run.ts
 */

const TOTAL_LLM_STEPS = 50;
const EVENTS_PER_STEP = 3; // step_created + step_started + step_completed

function utf8Bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf-8");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Realistic static payloads matching Entry's chat.ts step arguments
const mockModelCostCatalog = Array.from({ length: 28 }, (_, i) => ({
  id: `provider/model-${i}`,
  name: `Model ${i}`,
  contextWindow: 200_000,
  inputPricePerMillion: 3,
  outputPricePerMillion: 15,
  cacheReadPricePerMillion: 0.3,
  cacheWritePricePerMillion: 3.75,
}));

const mockSandboxState = {
  type: "boxd",
  machineName: "boxd-sess-abc123def456",
  workingDirectory: "/workspace/entry-agents",
  source: { repo: "entryagents/entry-agents", branch: "main" },
};

const mockAgentOptions = {
  permissionMode: "autoAccept",
  modelId: "anthropic/claude-sonnet-4",
  thinkingBudget: 10000,
  cwd: "/workspace/entry-agents",
};

interface StepMetric {
  calls: number;
  events: number;
  inputBytes: number;
  outputBytes: number;
}

function addMetric(
  map: Map<string, StepMetric>,
  name: string,
  input: unknown,
  output: unknown,
) {
  const prev = map.get(name) ?? {
    calls: 0,
    events: 0,
    inputBytes: 0,
    outputBytes: 0,
  };
  prev.calls += 1;
  prev.events += EVENTS_PER_STEP;
  prev.inputBytes += utf8Bytes(input);
  prev.outputBytes += utf8Bytes(output);
  map.set(name, prev);
}

function simulateRun(mode: "before-pr272" | "after-pr272") {
  const metrics = new Map<string, StepMetric>();
  // Run-level events: run_created + run_started + run_completed
  const runEvents = 3;

  // 1. Startup steps
  if (mode === "before-pr272") {
    addMetric(metrics, "checkVercelConnectedStep", { userId: "user-1" }, true);
    addMetric(metrics, "checkGithubConnectedStep", { userId: "user-1" }, true);
    addMetric(
      metrics,
      "loadCompactionCheckpointStep",
      { chatId: "chat-1" },
      null,
    );
    addMetric(metrics, "fetchModelCostCatalogStep", {}, mockModelCostCatalog);
  } else {
    addMetric(
      metrics,
      "prepareTurnBootstrapStep",
      { userId: "user-1", chatId: "chat-1" },
      {
        vercelConnected: true,
        githubConnected: true,
        checkpoint: null,
        modelCostCatalog: mockModelCostCatalog,
      },
    );
  }

  // Growing conversation state across 50 LLM steps
  const modelMessages: Array<Record<string, unknown>> = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "Refactor the tool call renderers and run full CI tests to verify everything passes.",
        },
      ],
    },
  ];
  const pendingAssistantParts: Array<Record<string, unknown>> = [];

  const stepSnapshots: Array<{
    step: number;
    runAgentInputBytes: number;
    runAgentOutputBytes: number;
  }> = [];

  // 2. Main 50-step agent loop
  for (let step = 1; step <= TOTAL_LLM_STEPS; step++) {
    if (mode === "before-pr272") {
      addMetric(
        metrics,
        "checkChatCancelledStep",
        { chatId: "chat-1", workflowRunId: "wrun_1" },
        false,
      );
      addMetric(
        metrics,
        "resolveCurrentPermissionMode",
        { userId: "user-1", sessionId: "sess-1" },
        "autoAccept",
      );
      addMetric(
        metrics,
        "consumeUnreadInboxMessagesStep",
        { chatId: "chat-1" },
        { messages: [] },
      );
    } else {
      addMetric(
        metrics,
        "prepareStepChecksStep",
        {
          chatId: "chat-1",
          workflowRunId: "wrun_1",
          userId: "user-1",
          sessionId: "sess-1",
        },
        {
          isCancelled: false,
          permissionMode: "autoAccept",
          unreadInboxMessages: [],
        },
      );
    }

    // Realistic tool output per step (~3.5 KB average: read/grep/bash output)
    const toolOutputText = `// File snippet from step ${step}\n${"const line = 'example code content for realistic payload sizing';\n".repeat(55)}`;
    const reasoningText = `Step ${step}: analyzing the tool output and deciding the next edit to make.`;

    const stepInputPayload = {
      chatId: "chat-1",
      sessionId: "sess-1",
      userId: "user-1",
      modelMessages,
      pendingAssistantResponse: {
        id: "asst-1",
        role: "assistant",
        parts: pendingAssistantParts,
      },
      sandboxState: mockSandboxState,
      agentOptions: mockAgentOptions,
      modelCostCatalog: mockModelCostCatalog,
    };

    const newResponseMessages = [
      {
        role: "assistant",
        content: [
          { type: "reasoning", text: reasoningText },
          {
            type: "tool-call",
            toolCallId: `tc-${step}`,
            toolName:
              step % 3 === 0 ? "edit" : step % 2 === 0 ? "bash" : "read",
            input: { filePath: `apps/web/components/file-${step}.tsx` },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: `tc-${step}`,
            toolName:
              step % 3 === 0 ? "edit" : step % 2 === 0 ? "bash" : "read",
            output: { success: true, content: toolOutputText },
          },
        ],
      },
    ];

    const newAssistantParts = [
      { type: "reasoning", text: reasoningText, state: "done" },
      {
        type: "tool-read",
        toolCallId: `tc-${step}`,
        state: "output-available",
        input: { filePath: `apps/web/components/file-${step}.tsx` },
        output: { success: true, content: toolOutputText },
      },
    ];

    pendingAssistantParts.push(...newAssistantParts);
    modelMessages.push(...newResponseMessages);

    const stepOutputPayload = {
      finishReason: step === TOTAL_LLM_STEPS ? "stop" : "tool-calls",
      responseMessages: newResponseMessages,
      pendingAssistantResponse: {
        id: "asst-1",
        role: "assistant",
        parts: pendingAssistantParts,
      },
      usage: {
        inputTokens: 12_000 + step * 900,
        outputTokens: 450,
        cachedInputTokens: 10_000 + step * 850,
      },
    };

    const inBytes = utf8Bytes(stepInputPayload);
    const outBytes = utf8Bytes(stepOutputPayload);
    addMetric(metrics, "runAgentStep", stepInputPayload, stepOutputPayload);

    if (step === 1 || step === 10 || step === 25 || step === 50) {
      stepSnapshots.push({
        step,
        runAgentInputBytes: inBytes,
        runAgentOutputBytes: outBytes,
      });
    }
  }

  // 3. Post-finish steps (unchanged in PR #272)
  addMetric(
    metrics,
    "clearActiveStream",
    { chatId: "chat-1", workflowRunId: "wrun_1" },
    true,
  );
  addMetric(
    metrics,
    "releaseUserBillingTurnStep",
    { userId: "user-1", workflowRunId: "wrun_1" },
    true,
  );
  addMetric(
    metrics,
    "reconcileSessionStatusStep",
    { sessionId: "sess-1", status: "completed" },
    true,
  );
  addMetric(
    metrics,
    "hasAutoCommitChangesStep",
    { sessionId: "sess-1" },
    false,
  );
  addMetric(metrics, "kickSandboxLifecycleStep", { sessionId: "sess-1" }, true);
  addMetric(
    metrics,
    "runPostTurnPluginsStep",
    { sessionId: "sess-1", chatId: "chat-1" },
    { ran: 0 },
  );

  let totalCalls = 0;
  let totalEvents = runEvents;
  let totalBytes = 0;
  for (const m of metrics.values()) {
    totalCalls += m.calls;
    totalEvents += m.events;
    totalBytes += m.inputBytes + m.outputBytes;
  }

  return { metrics, totalCalls, totalEvents, totalBytes, stepSnapshots };
}

const before = simulateRun("before-pr272");
const after = simulateRun("after-pr272");

console.log(
  "=== 50-Step Coding Agent Run: Measured Workflow Events & Serialized Bytes ===\n",
);
console.log(
  `BEFORE PR #272: ${before.totalCalls} step calls | ${before.totalEvents} Workflow Events | ${formatBytes(before.totalBytes)} serialized`,
);
console.log(
  `AFTER  PR #272: ${after.totalCalls} step calls | ${after.totalEvents} Workflow Events | ${formatBytes(after.totalBytes)} serialized`,
);
console.log(
  `DELTA         : -${before.totalCalls - after.totalCalls} step calls | -${before.totalEvents - after.totalEvents} events (-${(((before.totalEvents - after.totalEvents) / before.totalEvents) * 100).toFixed(1)}%) | -${formatBytes(before.totalBytes - after.totalBytes)}\n`,
);

console.log("--- Breakdown by Step Boundary (AFTER PR #272) ---");
const rows = Array.from(after.metrics.entries()).sort(
  (a, b) =>
    b[1].inputBytes + b[1].outputBytes - (a[1].inputBytes + a[1].outputBytes),
);
for (const [name, m] of rows) {
  const bytes = m.inputBytes + m.outputBytes;
  const pctBytes = ((bytes / after.totalBytes) * 100).toFixed(1);
  const pctEvents = ((m.events / after.totalEvents) * 100).toFixed(1);
  console.log(
    `${name.padEnd(32)} | calls: ${String(m.calls).padStart(2)} | events: ${String(m.events).padStart(3)} (${pctEvents.padStart(4)}%) | data: ${formatBytes(bytes).padStart(8)} (${pctBytes.padStart(5)}%)`,
  );
}

console.log(
  "\n--- runAgentStep Payload Growth Curve (Quadratic O(N^2) across 50 steps) ---",
);
for (const s of after.stepSnapshots) {
  console.log(
    `Step ${String(s.step).padStart(2)}: input=${formatBytes(s.runAgentInputBytes).padStart(8)} | output=${formatBytes(s.runAgentOutputBytes).padStart(8)}`,
  );
}
