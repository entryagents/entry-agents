# Comparative Study of Autonomous Subagent Systems: OpenCode vs. Oh-My-Pi
**An Evidence-Backed Deep Dive Across 8 Architectural Dimensions with Concrete Recommendations for Entry**

---

## Executive Summary

Autonomous subagent execution is the defining boundary between simple conversational chatbots and industrial-grade software engineering agents. When an agent delegates work to a child agent, the system must solve hard distributed systems problems: deterministic lifecycle management, token budget exhaustion, state pollution, workspace corruption, asynchronous RPC streaming, and structured result synthesis.

This study presents a rigorous, evidence-backed inspection of two production-grade agent systems:
1. **OpenCode** (`/tmp/subagent-studies/opencode`): An Effect-TS based, event-driven, transaction-safe agent platform emphasizing functional effects, outbox patterns, prompt-cache preservation, and background precomputation.
2. **Oh-My-Pi** (`/tmp/subagent-studies/oh-my-pi`): A multi-threaded, systems-engineered agent platform featuring worker thread pools, native copy-on-write isolation (OverlayFS/Btrfs/APFS/ovnfs), an IRC-style peer messaging bus, parked-agent lifecycle with cold revival, speculative subagent launching, and a hidden `yield` contract.

Following the comparative analysis across all 8 required dimensions, we provide **8 concrete, high-leverage architectural designs** tailored specifically for Entry's subagent architecture (`packages/agent`).

---

## Dimension 1: Architecture & Intelligence

### 1. OpenCode

In OpenCode, agent definitions are strictly typed and runtime-validated using `@opencode/schema/agent` and Effect Schemas.

* **Schema Definition**: [`/tmp/subagent-studies/opencode/packages/schema/src/agent.ts:22-54`](file:///tmp/subagent-studies/opencode/packages/schema/src/agent.ts#L22-L54)
  ```typescript
  export interface Info extends Schema.Schema.Type<typeof Info> {}
  export const Info = Schema.Struct({
    id: ID,                                 // Schema.String.pipe(Schema.brand("Agent.ID"))
    name: Name,                             // Schema.String.pipe(Schema.brand("Agent.Name"))
    model: Model.Ref.pipe(optional),        // providerID/modelID#variant
    request: Provider.Request,              // { settings: {}, headers: {}, body: {} }
    system: Schema.String.pipe(optional),   // Specialized system prompt
    description: Schema.String.pipe(optional),
    mode: Schema.Literals(["subagent", "primary", "all"]),
    hidden: Schema.Boolean,
    color: Color.pipe(optional),
    steps: PositiveInt.pipe(optional),      // Hard step limit for runner
    permissions: Permission.Ruleset,        // Tool & resource ruleset
  })
  ```
* **Agent Modes & Filtering**: [`/tmp/subagent-studies/opencode/packages/core/src/agent.ts:53-64`](file:///tmp/subagent-studies/opencode/packages/core/src/agent.ts#L53-L64)
  Agents are classified into three operational modes:
  - `primary`: Interactive agents user-selectable in the root UI. Cannot be spawned as subagents.
  - `subagent`: Specialized child agents. Omitted from primary UI selection (`selectable` check: `agent.mode !== "subagent" && !agent.hidden`).
  - `all`: Dual-purpose agents.
* **Service Layer**: [`/tmp/subagent-studies/opencode/packages/core/src/agent.ts:40-113`](file:///tmp/subagent-studies/opencode/packages/core/src/agent.ts#L40-L113)
  The `Agent.Service` maintains an in-memory mutable state wrapped in Effect `State.Transformable`. When an agent definition is updated, it publishes `Agent.Event.Updated` over the global event bus (`Bus.Service`).

### 2. Oh-My-Pi

Oh-My-Pi defines agents via Markdown frontmatter or structured config objects, backed by ArkType (`@oh-my-pi/omptype`).

* **Agent Definition Types**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/types.ts:77-146`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/types.ts#L77-L146) and `AgentDefinition`:
  - `name`: string identifier
  - `description`: user/model-facing description
  - `systemPrompt`: specialized instructions
  - `tools`: string[] whitelist of allowed tools (or undefined for all tools)
  - `model`: model selector pattern or array of fallback candidates
  - `spawns`: recursive delegation whitelist (`undefined`, `*`, or explicit agent names)
  - `prewalk`: model handoff configuration (starts on fast model, swaps at first edit)
  - `advisor`: companion watchdog/advisor model
  - `output`: JSON/JTD output schema definition
  - `blocking`: boolean (if true, forces inline synchronous execution even when background execution is globally enabled)
  - `readSummarize`: boolean (controls automatic read-tool summarization)
* **Tiered Discovery Precedence**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/discovery.ts:1-150`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/discovery.ts) and [`docs/tools/task.md:170, 240`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L170):
  Agent discovery is first-wins by exact name across five tiers:
  1. Project `.omp/agents`
  2. User `~/.omp/agent/agents`
  3. OMP extension-package `agents/` roots
  4. Claude marketplace plugin agents
  5. Bundled agents (`task`, `scout`, `reviewer`, `security-reviewer`, `sonic`, `seance`)
* **User-Tagged Dynamic Pseudonym Agents**: [`docs/tools/task.md:69`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L69)
  Users can tag models with `^` in the composer (e.g. `^anthropic/claude-3-7-sonnet:high`). The system automatically creates session-local dynamic agents (`m1`, `m2`) with pinned model, provider, and thinking effort levels.

---

## Dimension 2: Orchestration & Delegation

### 1. OpenCode

Delegation in OpenCode is executed through the `subagent` tool plugin.

* **Tool Schema**: [`/tmp/subagent-studies/opencode/packages/core/src/tool/plugin/subagent.ts:33-61`](file:///tmp/subagent-studies/opencode/packages/core/src/tool/plugin/subagent.ts#L33-L61)
  ```typescript
  export const Input = Schema.Struct({
    agent: Schema.String,                    // Specialized agent type name
    description: Schema.String,              // 3-5 word UI label
    prompt: Schema.String,                   // Subagent instructions
    model: Schema.optionalKey(Schema.String),// "providerID/modelID#variant"
    sessionID: Schema.optionalKey(SessionSchema.ID), // Follow-up to existing subagent!
    background: Schema.optionalKey(Schema.Boolean),  // Async background execution
    notify: Schema.optionalKey(Schema.Boolean),      // Wake parent on idle (default: true)
  })
  ```
* **Recursion Guard**: [`/tmp/subagent-studies/opencode/packages/core/src/tool/plugin/subagent.ts:130-146`](file:///tmp/subagent-studies/opencode/packages/core/src/tool/plugin/subagent.ts#L130-L146)
  Checks parent hierarchy depth:
  ```typescript
  let current = parent;
  let depth = 0;
  while (current.parentID) {
    depth++;
    current = yield* sessions.get(current.parentID);
  }
  const limit = Config.latest(yield* config.entries(), "experimental")?.subagent_depth ?? 1;
  if (depth >= limit) {
    return yield* new ToolFailure({ message: `Subagent depth limit reached (${limit})...` });
  }
  ```
* **Dynamic Tool Prompt Augmentation**: [`/tmp/subagent-studies/opencode/packages/core/src/tool/plugin/subagent.ts:302-326`](file:///tmp/subagent-studies/opencode/packages/core/src/tool/plugin/subagent.ts#L302-L326)
  Hooks `SessionHooks["context"]`, `compaction`, and `generate` to dynamically inspect the caller agent's permissions against all registered agents, appending only permitted subagents directly to the `subagent` tool description (`Available subagents: - <id>: <description>`).
* **Session Re-targeting / Follow-ups**: [`/tmp/subagent-studies/opencode/packages/core/src/tool/plugin/subagent.ts:178-193`](file:///tmp/subagent-studies/opencode/packages/core/src/tool/plugin/subagent.ts#L178-L193)
  When `sessionID` is passed, the tool does not spawn a new session; it can switch the subagent's agent type, switch its model, update notification metadata, and post a follow-up prompt to the active session.

### 2. Oh-My-Pi

Delegation in Oh-My-Pi is governed by the `task` tool with batch-swapped schemas and speculative launching.

* **Dynamic Schema Swapping**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/types.ts:77-146`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/types.ts#L77-L146) & [`docs/tools/task.md:37-60`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L37-L60)
  - **Batch Shape** (`task.batch = true`, default):
    ```typescript
    {
      context: string,   // MANDATORY shared background injected into every child's prompt
      tasks: Array<{
        name?: string,
        agent?: string,
        model?: string | string[],
        task: string,
        taskFile?: string,
        solutionSpace: string,
        effort?: "lo" | "med" | "hi",
        outputSchema?: unknown,
        schemaMode?: "permissive" | "strict",
        tools?: string[],
        isolated?: boolean
      }>
    }
    ```
  - **Flat Shape** (`task.batch = false`): Single spawn object directly at the root.
* **The `solutionSpace` Calibration Directive**: [`docs/tools/task.md:54`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L54)
  Callers pass a `solutionSpace` description (e.g. `"one fix: rename, names given"` vs `"deadlock cause open, no repro"`). The child model's auto-thinking classifier evaluates this field alone to choose its thinking token budget!
* **File-Backed Task Ingestion (`taskFile`)**: [`docs/tools/task.md:39, 63`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L39)
  With `task.file = true`, subagents can be dispatched via `taskFile: "local://spec.md"`. The file is read once at dispatch, hashed (SHA-256 recorded in metadata), and capped at 4 MiB, eliminating JSON escaping errors and context blowup.
* **Speculative Launch**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/speculative-launch.ts`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/speculative-launch.ts) & [`docs/tools/task.md:164`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L164)
  While the LLM is actively streaming a `task` batch call, as soon as `context` and an individual `tasks[i]` JSON object close in the token stream, `SpawnRun` launches immediately in the background before the parent model has finished outputting subsequent tasks!

---

## Dimension 3: Communication & Protocol

### 1. OpenCode

OpenCode uses a transactional event bus and inbox-outbox mechanics.

* **Foreground Execution**: [`/tmp/subagent-studies/opencode/packages/core/src/tool/plugin/subagent.ts:247-254`](file:///tmp/subagent-studies/opencode/packages/core/src/tool/plugin/subagent.ts#L247-L254)
  ```typescript
  const result = yield* jobs.block({ id: child.id, sessionID: context.sessionID }).pipe(
    Effect.onInterrupt(() =>
      Effect.all([sessions.interrupt(child.id), jobs.cancel(child.id)], { discard: true })
    )
  );
  ```
  The parent fiber suspends on `jobs.block`. If the parent is interrupted (e.g., user cancellation), `Effect.onInterrupt` atomically cascades interruption and cancellation to the child.
* **Background Execution & Inbox Delivery**: [`/tmp/subagent-studies/opencode/packages/core/src/session/execution/subagent-report.ts:77-131, 161-205`](file:///tmp/subagent-studies/opencode/packages/core/src/session/execution/subagent-report.ts#L77-L131)
  When a background subagent finishes:
  1. `prepare` runs inside SQLite `BEGIN IMMEDIATE` transaction, records `Job.SubagentOutboxReport` into the DB, and releases the session lock.
  2. `deliver` runs as `Effect.uninterruptible` via `deps.inbox.admit`:
     ```typescript
     deps.inbox.admit({
       id: report.notificationID,
       sessionID: notice.sessionID,
       item: {
         type: "synthetic",
         payload: SessionInbox.SyntheticPayload.make({
           text: `<subagent sessionID="${recovery.childSessionID}" state="${status}">\n${body}\n</subagent>`,
           description: recovery.description,
           metadata: { source: "subagent", childID: recovery.childSessionID, agent: recovery.agent, state: status }
         }),
         delivery: "steer",
       }
     })
     ```
  3. Parent is woken via `deps.wake(parentID)`.
* **Background Outstanding Work Accounting**: [`/tmp/subagent-studies/opencode/packages/core/src/session/subagent-completion.ts:38-52`](file:///tmp/subagent-studies/opencode/packages/core/src/session/subagent-completion.ts#L38-L52)
  `formatBody()` scans `SessionBackground.outstanding(jobs, store, sessionID)`. If the subagent finishes but leaves background processes running, the report appends:
  `Background work still running:\n- shell (...): <command>\n- subagent (...): <desc>`.

### 2. Oh-My-Pi

Oh-My-Pi implements a multi-tiered communication architecture: worker thread RPC, EventBus streaming, and an IRC-style peer messaging bus.

* **Worker Thread Pool & RPC**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/thread/subagent-worker.ts`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/thread/subagent-worker.ts) & [`docs/tools/task.md:154-160`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L154-L160)
  - Worker scaling formula: $W(n) = \min(\text{task.workerThreads}, \lfloor\log_2(n / 9)\rfloor + 1)$ for $n \ge 9$ concurrent subagents. 1–8 subagents run on the main thread; 9–17 use 1 worker; 18–35 use 2; 36–71 use 3; 72+ use 4.
  - Spawns execute entirely within worker threads (`runSubagentRunRequest`), preventing heavy agent loops from blocking the main thread / TUI renderer.
  - Single-owned state (agent registry, lifecycle, auth storage, MCP connections, IRC bus) stays on the main thread and communicates across worker threads via typed RPC.
* **IRC Peer-to-Peer Bus**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/irc/bus.ts`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/irc/bus.ts) & [`docs/tools/task.md:238-239`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L238-L239)
  - Agents can message peers or parents directly via `write agent://<id>` or broadcast with `write agent://all` (main agent only).
  - Messages arriving while an agent is busy are queued and delivered at the next tool-call boundary. Messages arriving while idle trigger a dedicated wake turn.
* **Internal URL Virtual Filesystem**: [`docs/tools/task.md:110-117, 231`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L110-L117)
  - `agent://<id>`: Resolves to saved output markdown artifact (`<id>.md`) or JSON (`<id>.json`). Supports JSONPath slicing: `agent://<id>/data/summary`.
  - `history://<id>`: Resolves to concise sanitized conversation transcript (`<id>.jsonl`).
  - `proc://<id>`: Inspects status/output of running async jobs; `write proc://<id>/kill` cancels jobs.

---

## Dimension 4: Context Management

### 1. OpenCode

OpenCode features one of the most advanced context compaction and prompt-cache-preservation systems in open-source AI tooling.

* **Background Precomputation**: [`/tmp/subagent-studies/opencode/packages/core/src/session/compaction.ts:351-407`](file:///tmp/subagent-studies/opencode/packages/core/src/session/compaction.ts#L351-L407)
  Writing a compaction summary takes 30–60 seconds. OpenCode eliminates this user stall via `precompute()`:
  - When context is within `PRECOMPUTE_LEAD = 60,000` tokens of the ceiling, a background fiber forks `summarize()` covering messages up to the latest assistant message.
  - Because that prefix was just evaluated by the provider, the summary request hits the provider's prompt cache (`CACHE_LIFETIME = 5 min`, `CACHE_MARGIN = 30s`).
  - The generated summary is stored in a `Precomputed` cache map.
  - When automatic compaction is finally triggered (`due()`), `usePrecomputed()` immediately swaps in the held summary plus the short verbatim tail (`PRECOMPUTED_TAIL_SHARE = 0.4`), completely bypassing the 30–60s delay!
* **5-Level Progressive Transcript Shortening**: [`/tmp/subagent-studies/opencode/packages/core/src/session/compaction.ts:141-150, 720-788, 1070-1100`](file:///tmp/subagent-studies/opencode/packages/core/src/session/compaction.ts#L141-L150)
  When the full conversation cannot fit into the compaction window, it degrades messages through 5 discrete levels:
  - `Level 0`: Whole content intact.
  - `Level 1` (`OUTPUTS_CLIPPED`): Tool outputs clipped to 2,000 characters from head and tail.
  - `Level 2` (`OUTPUTS_REMOVED`): Tool outputs removed entirely; tool inputs clipped.
  - `Level 3` (`USER_ONLY`): Assistant responses omitted; only user text preserved (clipped).
  - `Level 4` (`OMITTED`): Entire exchange omitted.
  Shortening is applied oldest-exchange first. The newest exchange is **never** omitted.
* **Strict Template & Nudge**: [`/tmp/subagent-studies/opencode/packages/core/src/session/compaction.ts:173-248, 507-522`](file:///tmp/subagent-studies/opencode/packages/core/src/session/compaction.ts#L173-L248)
  Summaries must adhere to `SUMMARY_TEMPLATE` (Objective, Requirements, Decisions, Work State, Next Move, Relevant Files, Important Context). If the model's output fails to match the required Markdown section headers, it sends an immediate `NUDGE` retry.

### 2. Oh-My-Pi

Oh-My-Pi handles context via selective isolation, mid-turn compaction, context promotion, and mechanical shake.

* **Selective Context Carry-Over**: [`docs/tools/task.md:241`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L241)
  Child sessions do not inherit parent conversation history. Built-in carry-over is strictly limited to:
  - Workspace directory tree, skills, and rules
  - Context files (excluding any file named `AGENTS.md`)
  - Shared `local://` root
  - Active approved-plan reference (`loadOverallPlanReference`)
* **Mid-Turn Compaction for Subagents**: [`docs/compaction.md:78, 148`](file:///tmp/subagent-studies/oh-my-pi/docs/compaction.md#L78)
  In parent sessions, compaction runs between user turns. But a subagent's entire lifecycle is typically a *single* turn comprising dozens of tool calls. If subagents only compacted post-turn, they would crash with context overflows. Oh-My-Pi's `createSubagentSettings` forcibly enables `compaction.midTurnEnabled = true`, evaluating context thresholds before every single LLM call in the tool loop!
* **Dynamic Context Promotion**: [`docs/compaction.md:130-136`](file:///tmp/subagent-studies/oh-my-pi/docs/compaction.md#L130-L136)
  When context overflows or nears the limit, before performing destructive summarization, Oh-My-Pi checks if an approved larger-window model is available (e.g., 200k $\to$ 1M/2M) and promotes the session to the larger model transparently.
* **Mechanical Shake (`shake.ts`)**: [`packages/agent/src/compaction/shake.ts`](file:///tmp/subagent-studies/oh-my-pi/packages/agent/src/compaction/shake.ts)
  Mechanically prunes and elides stale, repetitive tool results (such as large directory listings or file reads that were superseded by later edits) before invoking the LLM.

---

## Dimension 5: Tool Usage & Capabilities

### 1. OpenCode

OpenCode uses a ruleset-based permission model combined with dynamic registry snapshots and Code Mode compilation.

* **Permission-Driven Wholly-Disabled Tool Filtering**: [`/tmp/subagent-studies/opencode/packages/core/src/tool.ts:254-268, 385-388`](file:///tmp/subagent-studies/opencode/packages/core/src/tool.ts#L254-L268)
  ```typescript
  const whollyDisabled = (action: string, rules: Permission.Ruleset) => {
    const rule = rules.findLast((rule) => Wildcard.match(action, rule.action));
    return rule?.resource === "*" && rule.effect === "deny";
  };
  ```
  In `registry.snapshot(permissions)`:
  Every tool matching a `whollyDisabled` rule is completely excluded from the tool definitions array sent to the model.
* **Code Mode Tool Virtualization**: [`/tmp/subagent-studies/opencode/packages/core/src/tool.ts:263-285`](file:///tmp/subagent-studies/opencode/packages/core/src/tool.ts#L263-L285)
  When Code Mode is enabled, all programmatic tools (`codemode !== false`) are packaged into an in-memory TypeScript environment (`CodeModeTool`). Instead of defining 30 distinct tools in the LLM prompt (consuming thousands of tokens), only a single `execute` tool is provided, which runs TypeScript code interacting with the tool inventory.

### 2. Oh-My-Pi

Oh-My-Pi employs strict toolset narrowing, plan-mode lockdown, and parent-proxied tooling.

* **Tool Filtering & Inferred Capabilities**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/executor.ts:4554-4586`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/executor.ts#L4554-L4586)
  - Whitelist: Starts from explicit `agent.tools`.
  - At max recursion depth (`childDepth >= maxRecursionDepth`), `task` is forcibly stripped.
  - If `task` or `bash` is in tools, `wait` is automatically injected so subagents do not execute `sleep` commands in bash.
  - `exec` alias automatically expands to `bash` + `eval` (Python/JS kernels).
  - Outbound messaging requires `write`; inbound steering does not.
* **Plan Mode Security Lockdown**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/structured-subagent.ts:312-320`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/structured-subagent.ts#L312-L320)
  When subagents run under plan mode, all tools are strictly overridden to `["read", "grep", "glob", "web_search", "ast_grep"]`. File writes, bash, eval, isolation, and nested task spawns are stripped out completely.
* **Parent-Proxied MCP and Eval Kernels**: [`docs/tools/task.md:181, 242`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L181)
  Child sessions do not start their own MCP server subprocesses; they receive lightweight proxies referencing the parent's `MCPManager`, saving system memory and socket limits. Similarly, custom tools created in parent Python/JS kernels can be selectively exposed to subagents via the `tools` parameter.

---

## Dimension 6: Execution & Lifecycle

### 1. OpenCode

* **Step Limits with Cache-Preserving Final Turn**: [`/tmp/subagent-studies/opencode/packages/core/src/session/runner/llm.ts:261-280`](file:///tmp/subagent-studies/opencode/packages/core/src/session/runner/llm.ts#L261-L280) & [`max-steps.ts:1-17`](file:///tmp/subagent-studies/opencode/packages/core/src/session/runner/max-steps.ts#L1-L17)
  When a subagent reaches its step limit (`step >= loaded.agent.info.steps`):
  1. The runner appends `MAX_STEPS_PROMPT` to messages, strictly forbidding any further tool calls and commanding a summary of completed and remaining work.
  2. Sets `toolChoice: "none"`.
  3. **Critical Design Decision**: *Tool definitions are intentionally retained on this final step to avoid busting the LLM's prompt prefix cache!*
* **Cancellation & Interruptions**: [`/tmp/subagent-studies/opencode/packages/core/src/session/subagent-job.ts:54-65`](file:///tmp/subagent-studies/opencode/packages/core/src/session/subagent-job.ts#L54-L65)
  Server shutdowns interrupt running fibers but preserve job resumability in the database; only an explicit caller cancellation releases the child claim and marks the job cancelled.

### 2. Oh-My-Pi

* **Dual Budget Guards**: [`docs/tools/task.md:208-209`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L208-L209)
  - Hard wall-clock timeout: `task.maxRuntimeMs`.
  - Soft request budget: `task.softRequestBudget` (default 200 requests; scout/sonic capped at 100). Crossing the budget injects a wrap-up notice. At 1.5x the budget, the run is force-stopped to ensure partial findings are returned.
* **Missing-Yield Recovery Ladder**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/executor.ts:2495-2690`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/executor.ts#L2495-L2690)
  Subagents are required to complete their task by invoking a hidden `yield` tool. If a subagent attempts to end its execution without calling `yield`:
  - Up to 3 reminder prompts are injected (`MAX_YIELD_RETRIES = 3`).
  - On the final retry (`retryCount >= 3`), the runner sets `toolChoice: { type: "tool", name: "yield" }`, forcing the model to emit structured output.
* **Idle Parking and Cold Revival**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/registry/agent-lifecycle.ts:1-150`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/registry/agent-lifecycle.ts#L1-L150)
  - Subagents transition from `running` to `idle` upon completion.
  - The `AgentLifecycleManager` arms an unref'd timer (`task.agentIdleTtlMs`, default 7 minutes).
  - Upon expiry, the in-memory session is disposed to free memory, but the `AgentRef` and on-disk JSONL transcript are kept (`parked`).
  - When another agent or user messages the parked agent via `write agent://<id>`, `ensureLive()` seamlessly cold-revives the session from disk.
  - If explicitly killed, a tombstone file is written (`persistAgentTombstone`), setting status to `aborted`. If later revived, the tombstone is removed.

---

## Dimension 7: Coordination & State

### 1. OpenCode

* **Session Hierarchy & Durable Store**:
  Every child session is tracked in the SQLite store with `parentID: context.sessionID`.
* **State Synthesis & Output Delivery**: [`/tmp/subagent-studies/opencode/packages/core/src/session/subagent-job.ts:70-82`](file:///tmp/subagent-studies/opencode/packages/core/src/session/subagent-job.ts#L70-L82)
  The executor records `startedSeq` before running. Upon completion, it fetches the assistant response via `store.lastAssistantAfter({ sessionID, afterSeq })`, formats it with `formatBody()`, and wraps it in:
  ```xml
  <subagent sessionID="ses_123" state="completed" description="Inspect parser">
  [Assistant findings and results]
  </subagent>
  ```
  This is returned directly in foreground mode, or delivered to the parent's inbox as a synthetic message waking the parent in background mode.

### 2. Oh-My-Pi

* **Filesystem & Git Worktree Isolation**: [`/tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/worktree.ts`](file:///tmp/subagent-studies/oh-my-pi/packages/coding-agent/src/task/worktree.ts), `crates/pi-iso`, and `docs/tools/task.md:134, 166`
  When `isolated: true`:
  - Captures an uncommitted snapshot baseline (capped at 1 GiB).
  - Materializes an isolated workspace via platform PAL (`overlayfs` with FUSE fallback, `btrfs`/`zfs` snapshots, `apfs` clone, `reflink`, or `ovnfs` daemon).
  - Subagent operates in total isolation; faulty edits or broken tests cannot break the parent's working tree.
  - On completion, `mergeIsolatedChanges` computes changes:
    - **Patch mode**: Generates `<id>.patch` and applies it with `repo.canApplyPatch`.
    - **Branch mode**: Commits to branch `omp/task/<id>` and cherry-picks into parent HEAD.
* **Dual Output Artifacts & Inline Summaries**: [`docs/tools/task.md:97-115`](file:///tmp/subagent-studies/oh-my-pi/docs/tools/task.md#L97-L115)
  - Every subagent automatically writes its complete output to `<id>.md` and structured JSON to `<id>.json`.
  - If output is $\le 11,500$ chars, it is rendered inline in full. If larger, an excerpt preview of 5,000 chars is rendered with a pointer to `agent://<id>`.
* **Agent Hub TUI**: [`docs/agent-hub.md:1-124`](file:///tmp/subagent-studies/oh-my-pi/docs/agent-hub.md#L1-L124)
  Provides a live operational console (`Alt+A` / `Ctrl+S`):
  - Roster and hierarchical tree of all subagents.
  - Real-time token usage, cost, duration, and tool execution status.
  - Interactive click-to-focus: user can focus any running subagent, watch its live execution, steer it with prompts, change its model, or kill it.

---

## Summary Matrix: OpenCode vs. Oh-My-Pi

| Dimension | OpenCode | Oh-My-Pi |
| :--- | :--- | :--- |
| **Primary Architecture** | Effect-TS service layers, functional effects, SQLite schema | Multi-threaded TypeScript engine with Rust PAL (`pi-iso`) |
| **Agent Typings** | `Schema.Struct`, explicit `mode: "subagent" \| "primary" \| "all"` | Markdown frontmatter + ArkType dynamic wire schemas |
| **Discovery** | Static registry + dynamic plugin services | 5-tier discovery precedence (project, user, extensions, bundled) |
| **Delegation Schema** | `{ agent, description, prompt, model?, sessionID?, background?, notify? }` | Swapped batch: `{ context, tasks: [...] }` with `solutionSpace` & `taskFile` |
| **Concurrency** | Effect fibers with database outbox queue | Worker Thread Pool ($W(n) \le 4$) + session semaphore |
| **Speculative Launch**| No | Yes (launches child runs during token streaming of JSON chunks) |
| **Parent/Child Comms** | Inbox/Outbox synthetic message steering + `jobs.block` | RPC bridges, EventBus frames, IRC bus (`write agent://<id>`) |
| **Compaction Strategy**| Background precomputation near token ceiling + 5-level degradation | Mid-turn compaction for subagents, model promotion, mechanical shake |
| **Prompt Cache Policy**| Strict preservation: caches prefix, keeps tool defs at step limit | Shared prefix preservation, parent MCP proxying |
| **Workspace Isolation**| Shared directory or explicit worktree | Native CoW isolation (OverlayFS, Btrfs, APFS, ovnfs) + auto-merge |
| **Termination Contract**| Step limit triggers text-only `MAX_STEPS_PROMPT` | Hidden `yield` tool with 3-tier reminder ladder & forced toolChoice |
| **Resource Retention** | SQLite session rows + message logs | Idle parking after 7m TTL, transcript JSONL, on-demand cold revival |

---

## Dimension 8: Concrete Ideas for Entry

### Baseline Analysis of Entry
Entry's current subagent architecture (`packages/agent/tools/task.ts`, `packages/agent/subagents/`):
1. **Registry is hardcoded**: `SUBAGENT_REGISTRY` contains 4 static subagents (`explorer`, `executor`, `design`, `reviewer`).
2. **Single-turn execution**: Spawns run synchronously via `subagent.stream()` inside `taskTool.execute`.
3. **No session follow-ups**: Subagent sessions are ephemeral. A parent agent cannot message or follow up with an existing subagent.
4. **No workspace isolation**: The `executor` subagent edits files directly in the main working directory. A rogue or hallucinating subagent can corrupt the user's workspace.
5. **Vulnerable completion contract**: Output relies on asking the subagent to include `**Summary**` and `**Answer**` in its final message. If the step limit is reached or the model fails to format, it degrades or fails.
6. **No mid-turn compaction**: If a subagent runs 20 steps reading large files, it risks context window overflow before returning.

### 8 Concrete Recommendations for Entry

```
+-------------------------------------------------------------------------------------------------------+
|                                    ENTRY SUBAGENT SYSTEM ARCHITECTURE                                 |
+-------------------------------------------------------------------------------------------------------+
|  1. Subagent Lifecycle & Re-targeting (sessionID, idle TTL, revival from transcript)                  |
|  2. Structured Exit Contract (Hidden yield tool + 3-tier reminder ladder)                             |
|  3. Mid-Turn Compaction for Subagents (Subagent tool-loop threshold checks)                           |
|  4. Background Precomputation for Context Compaction (Zero-latency auto-compaction)                   |
|  5. Workspace Isolation & Patch Merge (Sandbox directory / worktree isolation)                         |
|  6. Dynamic Task Batching with Shared Context ({ context, tasks: [...] })                             |
|  7. Prompt-Cache-Preserving Step Limit Wrap-Up (Keep tool definitions, inject MAX_STEPS_PROMPT)       |
|  8. Virtual Subagent Filesystem (`agent://<id>`, `history://<id>`)                                    |
+-------------------------------------------------------------------------------------------------------+
```

---

### Idea 1: Subagent Follow-Up and Lifecycle Re-Targeting (`sessionID` + Idle Parking)

#### Problem in Entry
Currently, every invocation of `taskTool` spawns a brand new subagent that starts with zero memory. If the parent wants to ask a follow-up or provide feedback to an `explorer` or `reviewer`, it must spawn another subagent and resend the entire context, wasting hundreds of thousands of tokens.

#### Proposed Design (Inspired by OpenCode `SubagentTool` & Oh-My-Pi `AgentLifecycleManager`)
Add an optional `sessionId` to `taskInputSchema`. If `sessionId` is omitted, generate a new ID and record the session. If `sessionId` is provided, resume the existing session.

```typescript
// packages/agent/tools/task.ts
const taskInputSchema = z.object({
  subagentType: subagentTypeSchema,
  task: z.string().describe("Short 3-5 word description"),
  instructions: z.string().describe("Instructions for this turn"),
  sessionId: z.string().optional().describe("Send a follow-up to an existing subagent. Omit to spawn fresh."),
  background: z.boolean().optional().describe("Run in background and notify when finished."),
});
```

* **Data Structure**:
  Maintain a session registry mapping `sessionId -> { session, lastActiveAt, transcriptPath }`.
* **Idle Parking Mechanism**:
  Adopt Oh-My-Pi's 7-minute idle TTL. When a subagent completes, mark it `idle`. If inactive for $> 7$ minutes, dispose of the in-memory object to free RAM while keeping the JSONL transcript on disk. When `taskTool` is called with that `sessionId`, cold-revive the session from disk.

---

### Idea 2: Structured Exit Contract via a Dedicated `yield` Tool

#### Problem in Entry
In `packages/agent/tools/task.ts:154`, Entry instructs the subagent:
`When finished, your final turn MUST be a text message containing both **Summary** and **Answer**...`
Then in `toModelOutput` (lines 468–515), Entry executes fuzzy regex/string matching looking for `**Summary**` or `**Answer**`. If the model ends on a tool call or writes informal text, Entry falls back to an error or raw action dumps.

#### Proposed Design (Inspired by Oh-My-Pi `structured-subagent.ts` & `yield.ts`)
Provide a hidden, dedicated `yield` tool to all subagents:

```typescript
// packages/agent/subagents/tools/yield.ts
export const yieldTool = tool({
  description: "Report final task completion, deliverables, and structured results back to the parent agent.",
  parameters: z.object({
    status: z.enum(["completed", "blocked", "failed"]),
    summary: z.string().describe("Concise summary of findings or actions taken"),
    deliverables: z.array(z.string()).describe("List of created/edited files, endpoints, or answers"),
    data: z.unknown().optional().describe("Structured JSON payload matching requested outputSchema"),
  }),
  execute: async (args) => args,
});
```

* **3-Tier Reminder Ladder**:
  If the subagent attempts to end its turn without calling `yield`:
  - Turn 1: Inject user prompt: `Reminder: You have not called the yield tool. Please review your work and call yield to complete the task.`
  - Turn 2: Inject user prompt: `Second reminder: You must submit your final result using the yield tool.`
  - Turn 3: Set `toolChoice: { type: "tool", toolName: "yield" }`, forcing the model to emit the structured `yield` call.

---

### Idea 3: Mid-Turn Compaction for Subagents

#### Problem in Entry
Entry's `packages/agent/context-management/auto-compact.ts` only runs compaction at the outer turn boundaries of the main agent. Because a subagent's entire lifecycle is executed within a single outer tool call, a subagent that executes 25 file reads and grep searches can easily exceed the model's 128k or 200k context limit, crashing with an unrecoverable `ContextOverflowError`.

#### Proposed Design (Inspired by Oh-My-Pi `compaction.midTurnEnabled`)
In Entry's subagent execution loop (inside `taskTool.execute` or the subagent's step loop):
Evaluate context token utilization before every step.

```typescript
// Inside packages/agent/tools/task.ts (subagent execution loop)
const contextLimit = getContextWindow(subagentModelId);
const currentEstimatedTokens = estimateTokens(messages);

if (currentEstimatedTokens >= contextLimit * 0.80) {
  // Trigger mid-turn compaction
  const compactedMessages = await compactSubagentHistory(messages, {
    keepRecentSteps: 3,
    summaryPrompt: SUBAGENT_COMPACTION_TEMPLATE,
  });
  messages = compactedMessages;
}
```

---

### Idea 4: Background Precomputation for Context Compaction

#### Problem in Entry
When context compaction triggers in Entry, the agent stalls for 20–45 seconds while an LLM call generates the summary. This causes noticeable latency spikes for users.

#### Proposed Design (Inspired by OpenCode `SessionCompaction.precompute`)
Introduce a proactive precomputation hook in `packages/agent/context-management/auto-compact.ts`:
- When context reaches **70% of the threshold**, fork a background promise to summarize the history up to the latest user exchange.
- Because the history prefix was just processed by the provider, the summarization call hits the provider's **prompt cache** at 90% reduced latency and cost.
- Hold this summary in an ephemeral cache.
- When the 85% threshold is reached, check if the precomputed summary is valid. If valid, instantly splice it in and keep the remaining steps verbatim.
- **Result**: Cuts user-perceived compaction wait time from 35s to **< 500ms**.

---

### Idea 5: Workspace Isolation & Patch Merge for Executor Subagents

#### Problem in Entry
Entry's `executor` subagent has direct write access to the user's sandbox filesystem (`packages/agent/tools/write.ts`, `bash.ts`). If the subagent goes down a hallucinated path, makes breaking syntax errors, or edits 15 files incorrectly before crashing, the user's workspace is permanently corrupted.

#### Proposed Design (Inspired by Oh-My-Pi `task/worktree.ts` & native PAL)
When dispatching an `executor` subagent:
1. **Branch/Worktree Creation**:
   - In git-backed sandboxes: Create a temporary worktree `git worktree add .entry/worktrees/<task-id> HEAD`.
   - In non-git sandboxes: Use an overlay mount or copy-on-write clone directory.
2. **Execute Subagent in Worktree**:
   Set `cwd` of all file reads, writes, and bash commands to the isolated worktree directory.
3. **Capture & Merge Changes**:
   - If subagent finishes with `status === "completed"`, generate a unified diff `git diff HEAD`.
   - Apply patch back to the main workspace.
   - If subagent crashes, errors, or fails verification, simply delete the temporary worktree—leaving the main workspace completely untouched!

---

### Idea 6: Dynamic Task Batching with Shared Context (`tasks[]` + `context`)

#### Problem in Entry
To delegate 3 related tasks (e.g. "explore parser", "explore router", "explore db"), Entry's main agent must invoke `taskTool` three separate times in sequence, repeating common project background in every single call and stalling three times.

#### Proposed Design (Inspired by Oh-My-Pi Batch Schema)
Expand `taskInputSchema` to support batch mode:

```typescript
const taskBatchInputSchema = z.object({
  context: z.string().describe("Shared background, architectural constraints, and requirements common to all tasks"),
  tasks: z.array(z.object({
    subagentType: subagentTypeSchema,
    task: z.string().describe("Short label for this task"),
    instructions: z.string().describe("Task-specific instructions"),
    model: z.string().optional(),
    isolated: z.boolean().optional(),
  })).min(1).max(5),
});
```

* **Execution**:
  Run items concurrently using `Promise.all` bound by a semaphore (`p-limit(3)`).
* **System Prompt Injection**:
  Prepend `context` into each subagent's system prompt under a `# CONTEXT` section, ensuring all subagents share baseline knowledge without duplicating prompt engineering.

---

### Idea 7: Cache-Preserving Step Limit Wrap-Up (`MAX_STEPS_PROMPT`)

#### Problem in Entry
In Entry (`packages/agent/subagents/constants.ts`), `SUBAGENT_STEP_LIMIT` is set to 25. When step 25 is reached, the subagent abruptly cuts off, often in the middle of a tool call or with `messages producing no summary`. Entry's fallback in `task.ts:322–356` then attempts to stitch together raw tool calls.

#### Proposed Design (Inspired by OpenCode `max-steps.ts` & `llm.ts`)
When `stepIndex === SUBAGENT_STEP_LIMIT - 1`:
1. Do not abort the agent immediately.
2. Inject OpenCode's `MAX_STEPS_PROMPT`:
   ```markdown
   CRITICAL - MAXIMUM STEPS REACHED
   The maximum number of steps allowed for this task has been reached. Tools are disabled.
   Respond with text ONLY summarizing:
   1. Statement that step limit was reached
   2. What has been accomplished so far
   3. List of remaining tasks not completed
   4. Recommendations for what should be done next
   ```
3. Set `toolChoice: "none"`.
4. **Preserve Tool Definitions in the API Request**:
   Keep the existing tool definitions in the request payload so the provider's **KV prompt cache is not invalidated**. The model emits a clean, comprehensive markdown wrap-up report that smoothly informs the parent agent.

---

### Idea 8: Virtual Subagent Filesystem Protocol (`agent://<id>` and `history://<id>`)

#### Problem in Entry
When subagents return large summaries (e.g. 5,000 words of research or code reviews), injecting the entire text directly into the parent model's conversation history clutters the parent context and rapidly consumes its token budget.

#### Proposed Design (Inspired by Oh-My-Pi Virtual Protocols)
1. **Artifact Persistence**:
   Save subagent execution artifacts to disk:
   - `<appDataDir>/subagents/<id>/output.md` (full output)
   - `<appDataDir>/subagents/<id>/output.json` (structured data)
   - `<appDataDir>/subagents/<id>/transcript.jsonl` (full event log)
2. **Capped Inline Summary + URI Pointer**:
   - In `taskTool.toModelOutput`: If summary exceeds 3,000 characters, truncate to a 1,500-char preview and return:
     `Full output saved at agent://<id>. Use view_file or read agent://<id> to inspect details.`
3. **Parent Tool Resolver**:
   Add a virtual scheme handler in Entry's `read` / `view_file` tool so that reading `agent://<id>` or `history://<id>` directly resolves to the persisted artifact path.

---

## Conclusion & Implementation Roadmap

| Priority | Feature | Target Files in Entry | Estimated Impact |
| :---: | :--- | :--- | :--- |
| **P0** | **Hidden `yield` Tool Contract** | `packages/agent/subagents/`, `tools/task.ts` | Eliminates degraded/empty subagent summaries; guarantees structured data |
| **P0** | **Step-Limit Cache-Preserving Wrap-up** | `packages/agent/tools/task.ts` | Prevents abrupt subagent crashes at step 25; preserves prompt cache |
| **P1** | **Mid-Turn Context Compaction** | `packages/agent/context-management/` | Stops subagents from failing on context overflow during multi-step runs |
| **P1** | **Subagent Re-targeting (`sessionId`)** | `packages/agent/tools/task.ts`, `subagents/registry.ts` | Enables multi-turn conversation and iterative refinements with subagents |
| **P2** | **Workspace Isolation (Worktrees)** | `packages/agent/tools/task.ts`, `packages/sandbox/` | Eliminates risk of workspace corruption by executor subagents |
| **P2** | **Background Compaction Precompute** | `packages/agent/context-management/auto-compact.ts` | Cuts auto-compaction latency from 35s to < 500ms via cache hits |
| **P3** | **Batch Schema (`tasks[]` + `context`)** | `packages/agent/tools/task.ts` | Enables parallel delegation with shared architectural context |
| **P3** | **`agent://` Virtual Protocol** | `packages/agent/tools/read.ts`, `task.ts` | Prevents parent agent context pollution from massive subagent dumps |

