---
name: entry-platform
description: Reference guide to every user-facing Entry interface, workspace feature, and settings page (Chat, Workspace, Preview, Git/PR, Billing, Usage, Profile, Preferences, Models, Skills, Plugins, Integrations, Secrets). Use whenever a user asks how to find, configure, or use any Entry UI feature or setting.
---

# Entry Platform Interface & Settings Guide

Use this reference when answering user questions about where to find features, how to configure settings, or how Entry's workspace works.

## Main Workspace & Navigation
- **Sidebar**: Lists your chats, pinned/active workspaces, quick `+ New Chat`, live **5-hour / 7-day usage windows** (for metered plans), and a quick link to **Settings**.
- **New Chat (`/`)**: Pick a model, choose reasoning effort (when supported by the model), attach files or images, link a GitHub repository or start a blank workspace, and send your first prompt.
- **Chat View (`/chats/[id]`)**:
  - **Message stream**: Shows reasoning steps, collapsible tool calls, file edit summaries, copy/fork actions, and per-turn token/cost breakdown.
  - **Composer**: Attach files (with one-click remove `×`), switch models mid-chat, adjust reasoning effort, invoke slash commands (`/team`, `/verify`, `/unslop`, etc.), or stop/steer a running turn.
  - **Workspace Panel** (split view on desktop, drawer/tab on mobile):
    - **Files**: Browse, search, and open workspace files.
    - **Diff / Git**: Inspect unified or split diffs, stage/commit/push changes, and open or merge GitHub pull requests.
    - **Preview**: Live preview for web apps and dev servers running inside your sandbox.
    - **Context**: Inspect current context window usage and manually compact long conversations.
    - **Team / Subagents**: Monitor specialist teammates (`architect`, `explorer`, `executor`, `design`, `reviewer`) and their shared `team_board`.

## Settings Pages (`/settings/*`)
- **Profile (`/settings/profile`)**: Account details, total prompts sent, and daily activity graph.
- **Usage (`/settings/usage`)**: Detailed token and spend breakdown across models and time ranges.
- **Billing (`/settings/billing`)**:
  - **Current plan**: View your active plan, open `/pricing` to compare or upgrade, or click **Manage subscription** to open the billing portal (invoices, payment method, cancellation).
  - **Credit balance**: Shows your Entry Cloud balance card and separates **Monthly plan credit**, **Free credit**, **Gifted credit**, and **Purchased credit** (with **Add credit** top-ups on paid plans) plus the **Credit expiration schedule**.
- **Preferences (`/settings/preferences`)**:
  - **Workspace & appearance**: Theme (`System`, `Light`, `Dark`), Default diff view (`Unified`, `Split`), and Default sandbox.
  - **Safety & permissions**: Default permission mode (`Ask`, `Auto accept`, `Full access`) controlling which tool approvals new chats require.
  - **Automation**: Auto commit & push, Auto create pull request, and Guided frontend workflow.
  - **Notifications & sharing**: Background alerts, alert sound, and Public usage profile (`/u/<username>`).
- **Models (`/settings/models`)**: Choose your default chat model, default subagent model, and optionally curate a custom model shortlist for the model picker.
- **Skills (`/settings/skills`)**: Browse built-in skills, inspect `SKILL.md` instructions, and attach custom GitHub skill repositories.
- **Plugins (`/settings/plugins`)**: Filter (`All`, `Active`, `Built-in`, `Custom`), search, toggle built-in guardrails and slash-command plugins, or install custom JSON plugin manifests (with optional API/webhook secrets for custom plugins).
- **Integrations (`/settings/integrations`)**: Connect or disconnect GitHub (for repositories, commits, and PRs), Vercel (for deployments and logs), and third-party app connectors.
- **Secrets (`/settings/secrets`)**: Manage encrypted environment variables and secrets injected into your sandboxes without exposing raw values in chat logs.
- **Pricing (`/pricing`)**: Public plan comparison page (Free, Plus, Builder, Pro, Max) and sliding vs. fixed usage window details.
