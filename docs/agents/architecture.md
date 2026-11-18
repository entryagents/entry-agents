# Architecture

This is a Turborepo monorepo for **Entry Agents** — a durable cloud coding-agent platform built with AI SDK 6, Workflow DevKit, Next.js, and Boxd sandboxes.

## Core Flow

```
Web (apps/web + Workflow DevKit) -> Agent (packages/agent) -> Sandbox (packages/sandbox)
```

1. **Web (`apps/web`)**: Handles Better Auth authentication, Drizzle/Neon session and billing persistence, durable Workflow DevKit execution (`use workflow` / `use step`), SSE stream resume, and the Next.js App Router UI.
2. **Agent (`packages/agent`)**: `deepAgent` (`ToolLoopAgent`) with sandbox filesystem/shell/search/web tools, prompt-cache-stabilized system prompts, Tier-1 micro-compaction, Composio & MCP toolkits, and `task` team delegation.
3. **Sandbox (`packages/sandbox`)**: Provider registry (`registry.ts` + `registry-types.ts`) abstracting filesystem, command execution, detached background processes, public port previews, and ephemeral credential brokering via `SandboxCapabilities`.

## Key Packages & Apps

- **`apps/web/`**: Primary Next.js 16 web app, API routes, durable workflows, and billing/telemetry dashboards.
- **`apps/desktop/`**: Tauri 2 desktop client wrapping the Entry workspace.
- **`apps/desktop-backend/`**: Dedicated backend service for desktop device-code auth and local desktop API endpoints.
- **`packages/agent/`**: Core agent loop, 30+ tools, context management, subagents, skills, and model providers (`@entry-agents/agent`).
- **`packages/sandbox/`**: Sandbox provider registry (`boxd`, `local`, plus migration stubs for retired `modal`/`novita`) (`@entry-agents/sandbox`).
- **`packages/shared/`**: Shared utilities across workspace packages (`@entry-agents/shared`).
- **`packages/tsconfig/`**: Shared TypeScript base configs (`@entry-agents/tsconfig`).

## Subagent & Team Roles

The `task` tool delegates to specialized subagents and multi-agent wave roles:

- **`explorer`**: Read-only codebase research (grep, glob, read, safe bash).
- **`executor`**: Full-access implementation worker running in an isolated git worktree when inside a repo.
- **`architect`**: Read-only system architecture, interface contracts, and wave planning.
- **`design`**: UI/UX implementation specialist running in an isolated git worktree.
- **`reviewer`**: Adversarial verification and audit specialist.

## Workspace Structure

```
apps/
  web/              # Next.js web interface & durable workflows
  desktop/          # Tauri desktop shell
  desktop-backend/  # Desktop backend service
packages/
  agent/            # Core agent logic (@entry-agents/agent)
  sandbox/          # Sandbox abstraction (@entry-agents/sandbox)
  shared/           # Shared utilities (@entry-agents/shared)
  tsconfig/         # Shared TypeScript configs
```
