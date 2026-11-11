# Subagent Architecture Synthesis & Upgrade

## Overview

Following an exhaustive inspection of six open-source agent codebases on disk (`opencode`, `zed`, `oh-my-pi`, `t3code`, `hermes-agent`, and `openclaw`), this document consolidates the key architectural patterns, lessons, and concrete enhancements implemented in Entry's subagent system.

---

## Comparative Study Findings by Project

### 1. OpenCode (`packages/core/src/tool/plugin/subagent.ts`, `packages/schema/src/agent.ts`)
- **Key Idea Extracted**: Child session re-targeting (`sessionId`) and cache-preserving wrap-up (`MAX_STEPS_PROMPT`).
- **Mechanism**:
  - Subagents run as child sessions linked to the parent (`parentID: context.sessionID`).
  - Passing `sessionID` to the subagent tool allows sending follow-up instructions to an existing child session, preserving full tool context and memory.
  - When approaching the step limit (`step >= agent.steps`), OpenCode injects `MAX_STEPS_PROMPT` commanding a markdown summary while **retaining tool definitions in the API request**, preserving the provider's prompt prefix cache.

### 2. Oh-My-Pi / Pi-Mono (`packages/coding-agent/src/task/`, `docs/tools/task.md`)
- **Key Idea Extracted**: Multi-turn idle parking with cold revival, mid-turn compaction, and dynamic model pseudonyms.
- **Mechanism**:
  - Subagents enter `idle` state after completing a turn, with an idle TTL (7 minutes) before memory disposal, while keeping the transcript JSONL on disk for cold revival.
  - Subagent execution loops forcibly enable mid-turn context compaction (`compaction.midTurnEnabled = true`), evaluating token thresholds before each tool step to prevent context overflows.
  - Virtual artifact handles (`agent://<id>`, `history://<id>`) compact large outputs and prevent context window explosion.

### 3. NousResearch Hermes Agent (`tools/delegate_tool.py`, `agent/subagent_lifecycle.py`)
- **Key Idea Extracted**: Three-tier prompt caching invariant, prefix cache gate, Git worktree isolation, and dynamic headroom budgeting.
- **Mechanism**:
  - **Three-Tier Prompt Hierarchy**: Stable (identity + rules) $\rightarrow$ Context (`AGENTS.md`) $\rightarrow$ Volatile (skills + byte-stable date lines). Byte stability maximizes provider prefix cache hits.
  - **`PrefixCacheGate`**: Task 0 acts as a leader to prime the provider's prompt cache before releasing concurrent sibling tasks, preventing 5x redundant cache write fees.
  - **Dynamic Headroom Budgeting**: Evaluates remaining context headroom and spills large summaries (>16k chars) to disk with a 75% head / 25% tail excerpt and file pointer.
  - **Epistemic Stance Retention**: Mandates `## Unverified / Working Hypotheses` in compaction to prevent speculative guesses from turning into false facts.

### 4. Zed Assistant & ACP (`crates/agent/src/`, `crates/acp_thread/src/`)
- **Key Idea Extracted**: Strict hierarchical recursion depth limiting (`MAX_SUBAGENT_DEPTH = 1`), partial output recovery on failure, and rate-limit semaphore release.
- **Mechanism**:
  - `SubagentContext` tracks `depth: u8`. Subagents cannot delegate further; enforced at both tool registration (tool omitted) and runtime.
  - When a subagent fails or times out, `subagent_partial_output_from_messages` extracts the substantive text and partial actions executed, preventing total loss of context.
  - Drops rate-limit stream permits before waiting on subagent tool execution to prevent nested concurrency deadlocks.

### 5. OpenClaw (`src/agents/subagents/`, `docs/tools/subagents/`)
- **Key Idea Extracted**: Persona vs. operational fencing and standing system instructions.
- **Mechanism**:
  - Subagents receive clean operational guidelines (`AGENTS.md`) while personal identity (`SOUL.md`, `MEMORY.md`, `USER.md`) is stripped to eliminate conversational sludge.
  - Standing system instructions: explicit contract (`buildSubagentStandingInstructions`) stating that the child has one specific task, no proactive heartbeat, and produces evidence reports.
  - Privilege delegation: front-door agents can delegate tasks to privileged child subagents without ambient elevated permissions.

### 6. T3 Code (`apps/server/src/orchestration-v2/`, `packages/provider-core/`)
- **Key Idea Extracted**: First-class child thread lineage, delivery coalescing, and wire body deduplication.
- **Mechanism**:
  - Subagents are modeled with explicit lineage (`parentThreadId`, `rootThreadId`, `forkedFrom`).
  - Finished child completions are coalesced into active parent wake turns (`planDelegatedCompletionDelivery`).
  - Wire deduplication (`promptOmitted`, `resultOmitted`) prevents re-transmitting large prompts/results on state changes.

---

## Upgrades Implemented in Entry

### 1. Resumable Subagent Sessions (`sessionId`)
- **Session Store** (`packages/agent/subagents/session-store.ts`):
  - In-memory thread-safe store with 15-minute idle TTL (`DEFAULT_SUBAGENT_SESSION_IDLE_TTL_MS`).
  - Tracks `sessionId`, `subagentType`, `depth`, `messages`, `taskHistory`, `toolCallCount`, and `totalUsage`.
  - Automatically prunes expired sessions.
- **Task Tool Parameter** (`packages/agent/tools/task.ts`):
  - Added optional `sessionId` to `taskInputSchema`.
  - When `sessionId` is provided, resumes the existing subagent conversation, passing previous messages and instructions for seamless follow-up turns.
  - Yields `sessionId` in all streaming progress events and appends an actionable session notice to `toModelOutput`.

### 2. Hierarchical Depth Gating (`MAX_SUBAGENT_DEPTH`)
- Added `depth?: number` to `AgentContext` (`packages/agent/types.ts`).
- Enforced `MAX_SUBAGENT_DEPTH = 1` in `taskTool.execute` before touching sandboxes or models:
  - Subagents spawned by the root agent run at `depth = 1`.
  - Subagents attempting further delegation are refused cleanly:
    `"Task not started: maximum subagent delegation depth reached (1). Subagents cannot spawn child subagents. Please execute this work directly."`

### 3. Output Headroom Budgeting & Truncation
- Defined `MAX_INLINE_SUMMARY_CHARS = 16_000` (`packages/agent/subagents/constants.ts`).
- When a subagent produces massive output (>16k chars), `toModelOutput` retains a 75% head and 25% tail excerpt, omitting the middle with an explicit notice to protect the parent's context window.

### 4. Cache-Preserving Wrap-Up & Partial Output Recovery
- Defined `SUBAGENT_WRAP_UP_PROMPT` for step-budget warnings.
- Preserves executed tool actions and partial substantive text on error or budget stops, ensuring the parent model receives actionable findings even if the subagent was cut short.

---

## Verification
- Unit test suite `packages/agent/tools/subagent-session.test.ts` (8 tests: session creation, multi-turn resumption, task history recording, TTL pruning, depth gating, session notices, output spill protection).
- All 184 tests across 25 files in `packages/agent` passing with 0 failures.
- All billing tests (30 files, 224 tests) passing with 0 failures.
- `pnpm typecheck` passing across 4/4 packages with 0 errors.
- `pnpm oxlint` and `pnpm oxfmt` clean with 0 errors and 0 warnings.
