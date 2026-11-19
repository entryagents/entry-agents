---
name: uberdesigner-studio
description: Map a website's parts (from its build prompt, its code, or both) and install uberdesigner studio, an interactive visual design inspector panel where each part can be inspected, tweaked live (CSS tokens, spacing, colors, typography, text), and changed one part at a time with history and restore. Works on Vite + React + TypeScript projects and no-build HTML/CSS/JS sites. Use when the user asks to set up uberdesigner studio, make a site visually inspectable/editable, map UI parts and design tokens, or inspect/tweak a built site in Entry Preview.
---

# uberdesigner studio

This skill turns a website into a visually inspectable, layer-mapped site using [uberdesigner-studio](https://github.com/bogdan239/uberdesigner-studio). It works with two kinds of project:
- **Vite + React + TypeScript**: the studio plugs into Vite's dev server.
- **No build step**: an HTML page with inline CSS and JS (`index.html`, etc.), or plain HTML, CSS, and JS files (including sites with their own small Node server). The studio runs from its own small server, and the site's files only get `data-dm` attributes.

**Other stacks (Next.js, Astro, Nuxt, SvelteKit, Remix, Vite with Vue/Svelte, webpack) aren't supported yet.** `index.mjs`, `apply.mjs`, and `verify.mjs` stop with `Not supported yet: …` and change nothing in the site. When you see that line, tell the user plainly which stack was found and that it isn't supported yet.

## How it works

1. **Map (`inspector.map.json`)**: Lists the site's parts (sections, nested blocks, headlines, buttons), what the build prompt or code says about each part, the CSS design tokens that style it, and the files it lives in.
2. **Tag (`data-dm`)**: `apply.mjs` tags each part's element in source with `data-dm="<id>"`, copies the studio runtime (`runtime/server/` and `runtime/panel/`) into `<project>/.inspector/tool/`, and wires the Vite plugin or static server.
3. **Preview**: Start the dev server (or `.inspector/tool/serve.mjs`) on a localhost port in the Entry sandbox so the user can open it directly in Entry's **Preview** tab, click any layer, inspect/tweak tokens live, edit text inline, and view change history.

All scripts live in `scripts/` next to this `SKILL.md` (in `/root/.agents/skills/uberdesigner-studio/scripts/` inside the Entry sandbox).

## Step 1: Ensure runtime and Node.js

Before running `apply.mjs`, ensure `runtime/` is present in the skill directory by running:

```bash
sh /root/.agents/skills/uberdesigner-studio/scripts/ensure-runtime.sh
```

Node 23.6+ (or Node 22+ with `--experimental-strip-types`) is required. For Vite + React + TypeScript projects, packages must be installed (`pnpm install` / `npm install`) so TypeScript is available. If the project pins TypeScript 7 (which has no JS API), set `DESIGN_MAP_TS` to a TypeScript 5 install.

## Step 2: Index the code

Run `index.mjs` on the project folder `<project>`:

```bash
node /root/.agents/skills/uberdesigner-studio/scripts/index.mjs <project>
```

The index lists:
- Files and sizes
- Design tokens (`:root` blocks and mobile overrides)
- Runtime overrides (`setProperty`)
- Every component's meaningful JSX or HTML elements: tag, classes, visible text, existing `data-dm` tag
- Design tokens each CSS rule uses

If there is a `prompt.md` (or `--prompt <file>`), read its structure with:

```bash
node /root/.agents/skills/uberdesigner-studio/scripts/read-prompt.mjs <prompt.md> --project <project>
```

## Step 3: Write the map (`<project>/.inspector/map-work/map.json`)

Write `<project>/.inspector/map-work/map.json` following `reference/map-format.md` and `reference/example.map.json`.

Key rules:
- **Each section is a part** (`"kind": "section"`), and nested elements inside it get `"parent": "<section-id>"`.
- **Separate pieces get child parts** (e.g., hero headline, hero lead, hero CTA button).
- **Target matching**: Each part's `targets` entry uses `{ "file": "...", "find": "..." }` matching a unique opening tag in JSX/HTML. For components that render their own DOM element without forwarding props, or JS-generated DOM, use a selector target starting from a tagged parent: `{ "selector": "[data-dm='features'] h2" }`.
- **Tokens**: List only the design tokens that the part's own CSS rules use (never nested parts' tokens). Describe every listed token in the top-level `tokens` object with `kind` (`color`, `size`, `number`, `em`, `ms`, `text`), `role`, and a short plain `label` (2–4 words, e.g., `"Headline font"`, `"Accent orange"`).
- **Prompt / description**: Quote the relevant prompt lines (with `where` from `prompt.sections`) or describe the part in plain designer terms under `where: "<file>"`.

## Step 4: Apply and verify

Run `apply.mjs` and `verify.mjs` together:

```bash
node /root/.agents/skills/uberdesigner-studio/scripts/apply.mjs <project> <project>/.inspector/map-work/map.json && node /root/.agents/skills/uberdesigner-studio/scripts/verify.mjs <project>
```

`apply.mjs` writes nothing until all checks pass. Fix any errors reported by `verify.mjs` and re-run.

## Step 5: Launch in Entry Preview

Once `verify.mjs` passes:
- For **Vite + React**: start the Vite dev server (the studio is mounted at `/__inspector` and on the page).
- For **No-build HTML/CSS/JS**: start the studio's static server from `<project>/.inspector/tool/` (or the command printed by `apply.mjs`) and expose that port in Entry's **Preview** tab.
