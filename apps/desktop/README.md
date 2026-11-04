# Entry Agents V1

Native 3-Column AI Development Environment for Windows — engineered around **Entry Agents' Five Core Promises** and an **Everything-is-a-Plugin** (`entryagents.*`) architecture, with **zero Electron and zero WebView overhead**.

## Five Core Promises
1. **Spend less**: Get more useful work from every dollar (`entryagents.prompt.verbosity`, `entryagents.prompt.optimize`, `entryagents.warming`).
2. **Move faster**: Native GPU-rendered Rust GUI (`eframe`/`egui` -> `entry-desktop.exe`) + local Bun/SQLite WAL sidecar (`entry-agent-sidecar.exe`).
3. **Trust the results**: Agents must prove their work (`entryagents.verification` automated post-turn check & diff inspector).
4. **Stay in control**: Users own their models, projects, execution, and data (`entryagents.plan` read-only mode + wildcard permission rulesets).
5. **Extend everything**: Built-in and extensible plugins (`entryagents.agent`, `entryagents.plan`, `entryagents.goal`, `entryagents.command`, `entryagents.skill`, `entryagents.mcp`, `entryagents.tool.input.repair`).
