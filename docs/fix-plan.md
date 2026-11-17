# Chat streaming fix plan

Bugs observed in the screen recordings (Nov 16–17, 2026), all on a stable connection. Each fix ships as its own PR: open PR, run `pnpm check` and `pnpm turbo typecheck --filter=web`, merge, then move to the next.

## Done

| PR | Fix | Bug it addresses |
| --- | --- | --- |
| #139 | Clear stale `chat.error` in `onFinish` when the turn produced a real reply | "Generation could not be completed cleanly" banner shown under a complete answer |
| #140 | Persist partial streamed text when `runAgentStep` throws; never overwrite streamed text with the setup error; make post-completion steps (`refreshDiffCache`, `reconcileSessionStatusStep`) best-effort | Answer vanishes on reload and is replaced by the error notice; a finished turn marked as failed |

## Planned

### 1. Foreground poll kills healthy streams after 5s (`fix/stream-recovery-poll-threshold`)

- File: `apps/web/app/sessions/[sessionId]/chats/[chatId]/hooks/use-stream-recovery.ts`
- Cause: the 2.5s `recoveryPoll` interval calls `maybeRecoverStreamOnVisibility()`, which uses the 5s stale threshold meant for returning from a background tab. Any tool call or thinking pause longer than 5s with no SSE bytes aborts the live stream and calls `resumeStream()`.
- Symptoms: "Reconnecting to live stream" mid-turn, duplicated "Thinking..." blocks from replayed chunks, transient error banners, turns stopping and needing "continue".
- Fix: add a separate poll entry point that still probes the server but uses `HUNG_STREAM_THRESHOLD_MS` (120s). Keep the 5s threshold only for `visibilitychange`, `focus` and `online`.

### 2. Replayed reasoning and stale error after reattach (`fix/dedupe-replayed-thinking-and-clear-error`)

- Files: `apps/web/lib/chat/dedupe-message-reasoning.ts`, `apps/web/lib/chat/merge-preserving-local-work.ts`, `hooks/use-session-chat-runtime.ts`
- Verify replayed reasoning parts are deduplicated and that a soft reattach to an active stream clears `chat.error`. Fix only what the code shows is broken.

### 3. Error notices fed back into follow-up turns (`fix/sanitize-error-history-in-followups`)

- File: `apps/web/app/workflows/chat.ts`
- Cause to verify: assistant messages containing only the friendly error text (`isFriendlyChatErrorText`) or `turnError` metadata are included in model history, which feeds the repeat-failure check and makes every follow-up fail.
- Fix: drop error-only assistant messages when building model messages.

### 4. Team board lost across serverless instances (`fix/team-board-persistence`)

- Cause to verify: `teamBoards = new Map()` in `packages/agent` is per-instance memory. Ensure the board is rebuilt from persisted messages on every path.

### 5. Turns stopping after about 50–65s

- Files: `apps/web/app/api/chat/route.ts`, `apps/web/app/api/chat/[chatId]/stream/route.ts`, `runAgentStep` in `chat.ts`
- Check route `maxDuration`, step timeouts and unhandled errors after fix 1 lands, since fix 1 may already explain this. Ship a separate PR only if a concrete cause remains.

## Verification

After all fixes merge: confirm the production deployment is live, sign in with a test admin session, and exercise in the browser: a prompt with tool calls longer than 5s, page reload during and after a turn, and several follow-up messages. Any remaining failure gets its own PR and a retest.
