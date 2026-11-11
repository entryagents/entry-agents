# Durable Execution Audit & Architecture Guide

This document records the comprehensive audit of durable execution within Entry, comparing its implementation against Vercel Workflow's underlying runtime (`https://github.com/vercel/workflow`), identifying false assumptions and durability gaps in Entry's codebase, and detailing the verified fixes.

---

## 1. Executive Summary & Core Durability Architecture

### Core Requirement
Once a user submits a task, the workflow **must continue independently regardless of browser closure, network disconnection, page refresh, or client device going offline**—even while the agent is executing multi-step tool calls.

The UI is an ephemeral presentation layer: it connects to a server-sent events (SSE) stream to display live tokens, tool call cards, and status updates. If the user disconnects, the server-side durable workflow owns:
1. Model generation and tool execution loops (up to 500 steps or 1-hour turn duration).
2. Live spend tracking and balance checks.
3. Message snapshotting and final state persistence.
4. Auto-commit, auto-PR, and workspace diff refreshing.
5. Slot claiming, terminal status commitment, and billing turn lease release.

---

## 2. Vercel Workflow Runtime Internals vs. Entry Assumptions

To understand why Entry's previous implementation suffered durability failures, we cloned and studied the Vercel Workflow engine (`packages/core`, `packages/world-vercel`, `packages/ai` in `github.com/vercel/workflow`):

| Vercel Workflow Mechanism | Internal Implementation | Entry's Previous (False) Assumption | Actual Engine Behavior |
| :--- | :--- | :--- | :--- |
| **`start(workflow, args)`** | Creates `run_created` event and calls `world.queue(...)`. Returns `Run<T>` immediately. | Assumed `start()` was tied to the HTTP response connection. | Fully decoupled. Workflow runs in an asynchronous background queue worker independent of the initiating request. |
| **`getWritable()` & `getReadable()`** | Writes chunks to the Workflow Streamer service. Persisted in buffer chunks. | Assumed writing to the stream would fail or block if no client was listening. | Stream buffer persists chunks. Clients can connect, disconnect, and reconnect with `startIndex` at any time. |
| **`"use step"` Step Retries** | Default `maxRetries = 3` (4 attempts). If an uncaught `Error` is thrown, the entire step function re-executes from line 1. | Assumed swallowing errors in post-finish or throwing on billing debit was "safe". | Re-executing an agent step re-prompts the LLM and duplicates chunks to the client. Swallowing errors skips retry, permanently losing state. |
| **`run.cancel()`** | Enqueues a `run_cancelled` event into the event log. | Assumed `run.cancel()` immediately terminates in-flight async JS execution inside a step. | Steps execute cooperatively until a step boundary / yield. In-flight tool calls continue running unless monitored. |
| **Status 204 on Interrupted Streams** | When a stream completes and `activeStreamId` is null, reconnecting returns HTTP 204 No Content (`body === null`). | Assumed client `WorkflowChatTransport` handles 204 gracefully. | Standard `@workflow/ai` transport threw an uncaught error on 204 because `!res.body`. Entry's `AbortableChatTransport` must synthesize a clean terminal finish event. |

---

## 3. False Assumptions, Misleading Claims, and Durability Gaps Identified

### Gap 1: Indeterminate Workflow State Cleared Active Runs
- **Location**: `apps/web/app/api/chat/route.ts` (lines 209–225)
- **False Claim in Code**: Comments claimed that clearing `activeStreamId` on `"unknown"` state *"matches billing staleness fallback"*.
- **Reality**: When Vercel Workflow's run API experienced transient rate limits, network blips, or cold-start timeouts during `verifyRunState()`, it returned `"unknown"`. The route immediately cleared `activeStreamId` and started a new workflow, which invoked CAS, failed the active run, and aborted the user's ongoing task mid-execution.
- **Fix**: When `verifyRunState()` returns `"unknown"`, check whether the chat was recently active (`status === 'running' | 'queued'` within 15 minutes). If active, refuse to clear and return `{ action: 'conflict' }`, protecting in-flight runs from transient workflow API hiccups.

### Gap 2: Silent DB Error Swallowing in Final Message Persistence
- **Location**: `apps/web/app/workflows/chat-post-finish.ts` (lines 228–265)
- **False Claim in Code**: Claimed to be an *"atomic final persist"* that commits assistant output and clears active stream.
- **Reality**: The function wrapped `upsertChatMessageAndClearActiveStream` in a `try / catch (error)` block that logged to console and silently swallowed the error. If Neon had a transient connection reset, the step completed successfully without persisting the final message, leaving the chat permanently stuck in `running` status and losing the assistant's work.
- **Fix**: Removed the swallowing try/catch. Re-throw on DB failure so the Vercel Workflow step executor automatically retries the idempotent step until committed.

### Gap 3: Premature Stream Clearing Before Post-Finish Git Operations
- **Location**: `apps/web/app/workflows/chat.ts` (lines 2985–3165)
- **False Claim in Code**: Claimed to persist output before post-finish work to avoid losing data if automation fails.
- **Reality**: `persistFinalAssistantMessage` atomically cleared `activeStreamId` and set chat status to `completed` **before** auto-commit and auto-PR ran. Auto-commit and auto-PR take 10–30 seconds. During this window:
  1. `activeStreamId` was null. Any client reconnecting received a 204 No Content.
  2. If the user submitted another message while git was running, a duplicate workflow was launched concurrently.
  3. The final message persisted by `persistFinalAssistantMessage` was missing the commit and PR data parts!
- **Fix**: Moved `persistFinalAssistantMessage` to the very end of the turn—after auto-commit, auto-PR, and git data updates. Both the git parts and message parts are finalized together, ensuring `activeStreamId` stays active throughout the entire workflow execution.

### Gap 4: Step-Level Retries on Transient Billing Ledger Outages
- **Location**: `apps/web/app/workflows/chat.ts` (lines 3330–3365, `runAgentStep`)
- **False Claim in Code**: Claimed that billing debits flushed at the end of `runAgentStep` were safely durable.
- **Reality**: `pendingDebits` invoked `recordBillableUsage` without local retry. If Neon had a momentary lock contention during debit recording, the entire `runAgentStep` threw an uncaught error. The Workflow engine then re-executed the entire 5-minute agent step from step 1, re-calling the LLM provider (incurring double billing) and re-emitting chunks to the client stream.
- **Fix**: Implemented a localized `recordDebit` helper with exponential backoff (3 attempts). Transient database blips are resolved locally within milliseconds without failing the step.

### Gap 5: DB Data Corruption and Billing Leases on Abort/Stop
- **Location**: `apps/web/app/api/chat/[chatId]/stop/route.ts` (lines 50–120)
- **Durability & Data Integrity Bugs**:
  1. `persistAssistantSnapshot` passed `parts: message` (the entire raw message object) into `createChatMessageIfNotExists`, storing malformed objects in the PostgreSQL `parts` JSONB column instead of an array of valid parts.
  2. `releaseUserBillingTurn` was placed after `run.cancel()`. If `run.cancel()` threw an exception (e.g., run already completed or transient network error), the billing turn lease was never released, locking the user's account for 15 minutes.
- **Fix**: Wrapped snapshot parts in `sanitizeMessageForDatabase(message)`. Wrapped `releaseUserBillingTurn` in a `finally` block so leases are always cleanly released regardless of cancel outcome.

### Gap 6: Stop Monitor Polling & Admin Security Fallback
- **Location**: `apps/web/app/workflows/chat.ts` (lines 4570–4705)
- **Durability & Performance Bugs**:
  1. Polled every 150ms (`await delay(150)`), generating excessive load on the Neon database during a 1-hour turn (~24,000 queries per turn).
  2. `isUserAdmin` fallback was `.catch(() => true)`, meaning any transient error made the user appear as an admin (failing open instead of closed).
- **Fix**: Reduced polling interval to 1000ms (reducing DB load by 85%) and changed fallback to `.catch(() => false)` (fail closed).

### Gap 7: Missing 1-Hour Turn Duration Notification
- **Location**: `apps/web/app/workflows/chat.ts` (lines 2655–2665, 2980–3020)
- **Durability Bug**: When a turn exceeded `MAX_WORKFLOW_TURN_DURATION_MS` (1 hour), the loop broke silently, marking the message completed without informing the user why the agent stopped.
- **Fix**: Added `wasTimedOut` tracking and appended a clear user-facing notice to the assistant message explaining that the turn hit the duration cap and recommending they prompt the agent to continue. Added `turnTimedOut?: boolean` to `WebAgentMessageMetadata`.

### Gap 8: Broken GitHub Actions CI Workflow
- **Location**: `.github/workflows/ci.yml` (lines 86–92)
- **Bug**: An unindented shell line at column 0 broke YAML parsing, causing GitHub Actions to fail immediately with zero jobs executed.
- **Fix**: Restored YAML comment formatting and verified syntax with `oxfmt`.

---

## 4. Summary of Verification & Test Results

All test suites and verification scripts have been executed and passed:

1. **Workflow Unit & Integration Tests**:
   - `apps/web/app/workflows/chat.test.ts`: **42 passed, 0 failed** (39.7s)
   - `apps/web/app/workflows/chat-post-finish.test.ts`: **17 passed, 0 failed**
   - `apps/web/app/workflows/chat-post-finish-usage.test.ts`: **Passed**
   - `apps/web/app/workflows/queue-route.test.ts`: **Passed**
2. **API Route Tests**:
   - `apps/web/app/api/chat/[chatId]/stop/route.test.ts`: **13 passed, 0 failed**
   - `apps/web/app/api/chat/[chatId]/stream/route.test.ts`: **14 passed, 0 failed**
   - `apps/web/app/api/chat/route.test.ts`: **24 passed, 0 failed**
3. **Monorepo Isolated Process Runner (`scripts/test-isolated.ts`)**:
   - All **90+ test files** executed across `apps/web`, `packages/agent`, `packages/sandbox`, and `packages/shared`: **100% Passed**.
4. **Static Typecheck (`turbo typecheck`)**:
   - **4 packages verified, 0 errors**.
5. **Database Schema & Migrations (`pnpm --dir apps/web db:check`)**:
   - Schema and migrations verified in sync.
6. **Code Style & Formatting (`oxlint` + `oxfmt`)**:
   - **0 warnings, 0 errors** on all modified files.
