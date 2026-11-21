# Plan: Root-Cause Fixes (Repeating Agent / Inbox Loop & Compaction) + 1:1 Sable Chat, Context & Performance

## 1. Root Cause Analysis (Verified in Code)

### Bug 1 (Urgent): Agent Repeats Opening 8–9× Like Multiple Agents & Loops 40+ Times on `inbox`
Located in `apps/web/app/workflows/chat.ts` and `apps/web/app/workflows/loop-guard.ts`:

1. **Duplicate "multiple agents" openings on retry**:
   - `runAgentStep` streams assistant text directly to the UI stream (`writable`) as tokens arrive.
   - When `runAgentStep` hits a `recoverableStepError` (or throws an auto-recoverable error), `chat.ts` does **not** push `result.responseMessages` into `modelMessages`, decrements `step--`, sleeps, and retries.
   - Because `modelMessages` does not contain the failed attempt's text, the model starts fresh and streams a slightly different opening ("I'll research...", "I'll start by checking...") into the **same** UI message (`assistantId`), repeating up to `MAX_CONSECUTIVE_STEP_RECOVERIES` times.
2. **Infinite `inbox` ("Read · 1 message") loop**:
   - Before every step (`chat.ts:2893-2906`), `getUnreadInboxCountStep(options.chatId)` runs. If `unreadInboxCount > 0`, it pushes a **permanent** `role: "user"` message into `modelMessages`:
     `[HIGH-PRIORITY STEERING INBOX INTERVENTION] You MUST call the inbox tool IMMEDIATELY...`
   - That intervention message is **never removed** from `modelMessages` after the inbox is read. On every subsequent step (and on every retry, which pushes *another* copy!), the model keeps seeing `You MUST call the inbox tool IMMEDIATELY` in its context and obeys it in a loop.
   - `inbox` was missing from `READ_ONLY_TOOLS` in `loop-guard.ts`, and `recoverableStepError` retries (`continue` at line 3158) bypassed `loopGuard.recordStep()` completely.

**Permanent Fix (Phase A)**:
- Replace the `[HIGH-PRIORITY STEERING INBOX INTERVENTION]` prompt-and-tool-call dance with **atomic delivery**: add `consumeUnreadInboxMessagesStep(chatId)` in `chat-post-finish.ts` that fetches unread messages and marks them `read` in one step, then injects the **actual steering message content** directly into `modelMessages` (so the model never needs to call `inbox` in a loop, and retries never re-inject it).
- Add `"inbox"` to `READ_ONLY_TOOLS` in `apps/web/app/workflows/loop-guard.ts` so even explicit repeated `inbox` tool calls are caught by `TurnLoopGuard`.
- Guard retry loops against unbounded duplicate text accumulation and add unit tests covering both inbox atomic delivery and `TurnLoopGuard` inbox loop breaking.

---

### Bug 2: Compaction Triggers Always
Located in `apps/web/app/workflows/chat.ts:2820-2826`:
```ts
if (
  modelMessages.length > 12 &&
  (step === 0 ||
    (lastKnownInputTokens !== undefined && lastKnownInputTokens >= 80_000) ||
    (modelMessages.length >= 28 && step % 3 === 0))
)
```
- Triggers on `step === 0` for any chat with >12 messages, and every 3 steps once `modelMessages.length >= 28`, **even when actual token usage is tiny** (e.g. 2% of context window).
- Uses a hardcoded `80_000` token threshold instead of the model's actual `contextWindow * compactionThreshold`.

**Permanent Fix (Phase B)**:
- Gate pre-step compaction strictly on **actual token pressure** relative to the model's context window (e.g. `lastKnownInputTokens >= contextWindow * compactionThreshold`), matching Sable's token-budget-driven compaction model, rather than message count or `step === 0` / `step % 3`.
- Distill Sable's compaction logic & clean summary formatting into Entry's compaction helper with unit tests.

---

### Bug 3: Side Panel Context Tab Only Reports Cache Accurately
Located in `apps/web/components/workspace/workspace-context-tab.tsx` (and its data source):
- Inspect how session token usage (`inputTokens`, `outputTokens`, `cacheReadInputTokens`, `cacheCreationInputTokens`, system/tools/messages breakdown) is passed into `WorkspaceContextTab`.
- Fix the breakdown so all context buckets (system prompt, tools, conversation history, cached read/write, output, remaining window) are accurately computed and displayed.

---

### Phase D: Performance + Remaining 1:1 Sable Chat & Sidebar Parity
- Audit and eliminate unnecessary re-renders / heavy per-keystroke or per-chunk work in the chat feed and sidebar.
- Finish any remaining 1:1 Sable chat timeline & sidebar polish (sidebar footer/account row, unread dot, opened-subagent view).

---

## 2. Execution Order & Verification
Each phase will be implemented on its own branch, verified with `pnpm fix`, `pnpm check`, `pnpm typecheck`, `pnpm run ci`, and `pnpm --dir apps/web build`, and merged to `main` before moving to the next phase:
1. **Phase A**: Fix repeating-agent + steering-inbox loop (`fix/steering-inbox-loop`)
2. **Phase B**: Fix always-on compaction + distill Sable compaction (`fix/compaction-threshold-sable`)
3. **Phase C**: Fix Side Panel Context tab reporting (`fix/context-tab-breakdown`)
4. **Phase D**: Performance + remaining 1:1 Sable chat & sidebar polish (`feat/sable-phase-20-chat-perf`)
