# Entry Agents

Entry Agents is a durable cloud platform for autonomous software-building agents. Start from a blank workspace, uploaded files, a plain-language prompt, or a GitHub repository. Agent orchestration and model calls run on the Next.js / Workflow DevKit server host, while workspace tools execute remotely inside isolated cloud Linux sandboxes with filesystem, shell, package management, live port previews, and optional Git delivery.

Production deployment: https://entry-agents.dev  
Machine-readable docs: https://entry-agents.dev/llms.txt · https://entry-agents.dev/llms-full.txt

## Architecture

```text
+------------------------------+     +-------------------------------+     +------------------------------+
| Web & Durable Workflows      | --> | Agent Runtime                 | --> | Sandbox Provider Registry    |
| apps/web (Next.js 16 +       |     | packages/agent (AI SDK 6      |     | packages/sandbox             |
| Workflow DevKit + Drizzle +  |     | ToolLoopAgent + 30+ tools +   |     | (boxd cloud VMs, local dev)  |
| Better Auth + SSE resume)    |     | subagents + micro-compaction) |     |                              |
+------------------------------+     +-------------------------------+     +------------------------------+
```

- **Agent turns run inside Workflow DevKit (`use workflow` / `use step`)** rather than tying execution to a browser HTTP connection. Client reloads and network drops reconnect to the active durable stream.
- **Sandboxes are capability-driven (`SandboxCapabilities`) and disposable**, separating workflow durability and chat persistence from the underlying VM lifecycle.
- **Context & Prompt-Cache Management** uses a cache-stabilized system prompt, bounded tool outputs (`read`, `bash`, `grep`, `glob`, `dir_list`, `web_fetch`), Tier-1 tool-result micro-compaction, and durable Tier-2 compaction checkpoints (`compaction_checkpoints`).

## Monorepo Layout

```text
apps/
  web/              # Next.js 16 App Router UI, API routes, durable workflows, Drizzle schema
  desktop/          # Tauri 2 desktop client wrapper
  desktop-backend/  # Dedicated backend service for desktop auth and APIs
packages/
  agent/            # @entry-agents/agent: deepAgent loop, tools, subagents, skills, compaction
  sandbox/          # @entry-agents/sandbox: provider registry (boxd, local) & capabilities
  shared/           # @entry-agents/shared: shared cross-package utilities
  tsconfig/         # @entry-agents/tsconfig: shared TypeScript configurations
docs/
  agents/           # Architecture notes, code style, and lessons learned
```

See [HOW_TO_UNDERSTAND_THIS_CODEBASE.md](HOW_TO_UNDERSTAND_THIS_CODEBASE.md) and [docs/agents/architecture.md](docs/agents/architecture.md) for detailed module diagrams.

## Getting Started

### Prerequisites

- **Node.js 24.x** (`engines.node` in [package.json](package.json))
- **pnpm 11.x** (`packageManager` in [package.json](package.json))
- **Bun** (for running `bun test` unit/integration test suites)

### Setup

1. Install dependencies from the repository root:

   ```bash
   pnpm install
   ```

2. Configure environment variables for the web app using [apps/web/.env.example](apps/web/.env.example):

   ```bash
   cp apps/web/.env.example apps/web/.env.local
   ```

   Fill in the required values (`POSTGRES_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL`, `GATEWAY_BASE_URL`, `GATEWAY_API_KEY`, `BOXD_API_KEY` / `BOXD_TOKEN`, plus OAuth provider credentials).

3. Start the web development server:

   ```bash
   pnpm web
   ```

### Common Commands

```bash
pnpm web                       # Start Next.js dev server for apps/web
pnpm check                     # Lint and format check (Ultracite: oxlint + oxfmt)
pnpm fix                       # Auto-fix lint and formatting issues
pnpm typecheck                 # Type-check all workspace packages via Turborepo
pnpm test:isolated             # Run isolated Bun test suite
pnpm --dir apps/web db:check   # Verify Drizzle schema & migration sync
pnpm run ci                    # Full local check: lint/format, typecheck, tests, db:check
```

## Self-Hosting Caveats

Self-hosting a complete deployment requires external infrastructure configured in [apps/web/.env.example](apps/web/.env.example):

- **Postgres (Neon recommended):** Stores auth sessions, chats, durable compaction checkpoints, and billing records.
- **Entry Gateway (`GATEWAY_BASE_URL`, `GATEWAY_API_KEY`):** Private OpenAI-compatible/AI SDK model routing gateway expected by default model definitions.
- **Boxd (`BOXD_API_KEY` / `BOXD_TOKEN`):** Cloud VM sandbox provider (`packages/sandbox/boxd`). The `local` provider (`packages/sandbox/local`) is strictly for local development or desktop usage without VM isolation.
- **Auth & Optional Integrations:** Vercel / Google / GitHub OAuth for sign-in, GitHub App credentials for repo clone/PR workflows, Bachs credentials for paid credit checkout, and Parallel/Composio keys for search and external connectors.

## License & Upstream Attribution

Licensed under the MIT License — see [LICENSE.md](LICENSE.md).

This project is derived from [`vercel-labs/open-agents`](https://github.com/vercel-labs/open-agents) (Copyright (c) 2026 Vercel, Inc.) and substantially extended for durable execution, Boxd cloud workspaces, multi-tier compaction, billing, and desktop support.
