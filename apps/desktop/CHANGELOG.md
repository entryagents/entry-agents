# Entry Agents Desktop Changelog

All notable changes to the Entry Agents Desktop application are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), following OpenCode release standards.

---

## [1.0.0-beta.1] - 2026-11-06

### Highlights
- **Initial Beta Release of Entry Agents Desktop:** High-performance, native three-column AI coding workspace with OpenCode-parity execution security.
- **Direct Entry Model Routing (No-Cache Sync):** Desktop fetches models directly from Entry (`GET /api/desktop/models` with `Cache-Control: private, no-store`). Master Gateway API keys remain securely isolated on Entry's backend with zero renderer key egress.
- **OpenCode 3-Tier Autonomy Engine:** Complete parity with OpenCode security (`allow`, `ask`, `deny`) featuring `Turbo (Auto)` (`--auto`), `Balanced (Default)`, and `Review (Strict)` modes.
- **Interactive Session Permission Dock:** Contextual confirmation dock for bash and tool execution with instant `Deny` (with steering feedback), `Allow Always` (persists durable `savedRules`), and `Allow Once`.
- **Non-Blocking Settings Overlay:** Floating modal with surrounding desktop gutters and background backdrop blur (`backdrop-filter: blur(8px)`), accessible via `Cmd+,` and `Esc`.
- **1:1 Usage & Telemetry in Settings:** Spendable plan allowance, 90-day top-up credits, rolling 5-hour / 7-day / monthly sliding windows, and cache efficiency metrics. Web-only external billing redirect.
- **Codex Desktop Parity Integrations Hub:** Production-ready plugins with authentic brand logos: Composio Platform, Agent Browser (CDP Chromium), Neon Lakebase Postgres, GitHub CLI & PRs, Vercel CLI, Linear, Notion, and Anthropic MCP Multi-Server Host.

### Supported Models (Live Entry Gateway Catalog)
- **`step-5-preview`**: Entry flagship default model with adaptive reasoning, context compaction, and free tier allowance ($0.00).
- **`qwen3.8-flash:free`**: Ultra-low latency open-weights coding model for rapid search, linting, and AST transformations ($0.00).
- **`mimo-v2.6-flash:free`**: Fast inference model optimized for real-time diff inspections and lightweight reasoning ($0.00).
- *Strictly no unsupported offline or third-party engines (Ollama removed).*

### Security & Process Containment
- Hardware-isolated process containment strictly enforces workspace boundary constraints.
- Path traversal guard automatically blocks read/write access to sensitive files (`.env`, `.env.local`, `~/.ssh/id_rsa`, credentials).
- Desktop authenticates sessions via cryptographic device tokens; no master gateway credentials touch the client.

### Release Assets
- Linux: `entry-desktop-linux-x86_64-1.0.0-beta.1.AppImage`, `entry-desktop-linux-amd64-1.0.0-beta.1.deb`
- macOS: `entry-desktop-mac-arm64-1.0.0-beta.1.dmg`, `entry-desktop-mac-x64-1.0.0-beta.1.dmg`
- Windows: `entry-desktop-win-x64-1.0.0-beta.1.exe`
- Verification: `SHA256SUMS.txt`
