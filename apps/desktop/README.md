# Entry Desktop V1

Native 3-Column AI Development Environment for Windows — engineered around Entry's **Five Core Promises** and following **OpenCode** (`anomalyco/opencode`) architecture patterns file-by-file, with **zero Electron and zero WebView overhead**.

## Core Product Principle
> The most capable AI development environment shouldn't be the one that consumes the most tokens, runs the most agents, or has the most features. It should be the one that gets the most **verified work** done with the least time, money, and human intervention.

## The Five Core Promises
1. **Spend less**: Get more useful work from every dollar (prompt cache tracking, minimal-token exploration, live credit balance visibility).
2. **Move faster**: Pure native GPU-rendered Rust GUI (`entry-desktop.exe`) + compiled Entry Agent Sidecar (`entry-agent-sidecar.exe`).
3. **Trust the results**: Agents must prove their work (`entry-verification-gate` automatically verifies changes in `Build` mode and writes proof artifacts to the Right Workspace Column).
4. **Stay in control**: Users own their models, projects, execution, and data (`Plan` mode enforces read-only exploration + `.entry/plan/*.md` blueprints; wildcard permission rulesets protect `.env` secrets).
5. **Extend everything**: OpenCode-compatible plugin & hook system (`onSessionStart`, `onBeforeTool`, `onAfterTurn`).

## Architecture
- `src/database/database.ts`: Local SQLite WAL persistence (`~/.entry/desktop/entry-desktop.sqlite`) with `account`, `account_state`, `credential`, `project`, `session_v2`, `session_message`, `session_part`, `permission`, `artifact`, `schedule`, and `kv` tables.
- `src/auth/device-auth.ts`: RFC 8628 OAuth 2.0 Device Authorization Grant flow against `https://entry-agents.dev` (`/api/desktop/device/code`, `/desktop/approve?code=NNNNNN`, `/api/desktop/device/token`).
- `src/models/live-models.ts`: Fetches live models strictly from `https://entry-agents.dev/api/desktop/models` & `/api/models` — **zero hardcoded or demo models**.
- `src/agent/agents.ts`: OpenCode `build`, `plan`, `general`, `explore`, `title`, and `summary` agents + `<system-reminder>` injection for `Plan` mode.
- `src/permission/permission.ts`: OpenCode wildcard permission ruleset evaluator (`allow` | `ask` | `deny`).
- `src/server/`: Local HTTP + SSE Event Bus server powered by `@entry-agents/agent` (`openAgent`) and `@entry-agents/sandbox` (`LocalSandbox`).
- `native-gui/`: Pure native Rust 3-column dark UI (`eframe`/`egui`) matching the Entry 3-column workspace specification.
