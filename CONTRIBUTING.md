# Contributing to Entry Agents

Thank you for contributing to Entry Agents. Please review the workspace guidelines and [AGENTS.md](AGENTS.md) before opening a pull request.

## Toolchain & Package Management

- **Package manager:** Use `pnpm` exclusively (`pnpm install`, `pnpm add`, `pnpm --filter ...`). Do not commit `package-lock.json` or `yarn.lock`.
- **Runtimes:** Node.js 24.x for scripts and Next.js runtime; Bun for running `bun test` suites.
- **Formatting & Linting:** Managed via Ultracite (`oxlint` + `oxfmt`) from the repository root (`pnpm check` / `pnpm fix`).

## Development Workflow

1. **Before coding:** Read [HOW_TO_UNDERSTAND_THIS_CODEBASE.md](HOW_TO_UNDERSTAND_THIS_CODEBASE.md), [docs/agents/architecture.md](docs/agents/architecture.md), and [docs/agents/code-style.md](docs/agents/code-style.md).
2. **File organization:** Keep concerns modular. Extract non-trivial hooks, components, workflow steps, or utilities into focused colocated modules rather than growing large monolithic files.
3. **Code conventions:**
   - Use kebab-case filenames, PascalCase types, camelCase functions.
   - Never use `any`; prefer `unknown` with explicit type guards or Zod schemas (`z.infer`).
   - Do not include `.js` extensions in TypeScript imports.
   - Keep `"use workflow"` entry modules free of top-level static Node.js, DB, or sandbox SDK imports (use dynamic `await import(...)` inside `"use step"` functions).
4. **UI changes:** Follow the `unslop` guidelines in `.agents/skills/unslop/SKILL.md` and verify both `375px` mobile and `1440px` desktop viewports with zero horizontal overflow.

## Database Schema Changes

If you edit `apps/web/lib/db/schema.ts`:

```bash
pnpm --dir apps/web db:generate
```

Commit the generated Drizzle SQL migration file alongside your schema change, and verify with:

```bash
pnpm --dir apps/web db:check
```

Do not use `db:push` against shared or production databases.

## Verification Before Submitting

Run the full verification pipeline from the repository root before claiming a change is ready:

```bash
pnpm fix
pnpm check
pnpm typecheck
pnpm test:isolated
pnpm --dir apps/web db:check
```
