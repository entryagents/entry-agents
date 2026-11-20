export type RailTabId =
  | "review"
  | "files"
  | "preview"
  | "terminal"
  | "tasks"
  | "context"
  | "agents";

export interface RailTabDef {
  id: RailTabId;
  label: string;
  more?: boolean;
}

/**
 * Side panel tabs in shortcut order (Alt+1 to Alt+7), ported 1:1 from
 * Sable's `src/features/rail/tabs.ts`. The header shows the first four
 * (as many as fit); the rest, and any that do not fit, live in the More menu.
 */
export const RAIL_TABS: readonly RailTabDef[] = [
  { id: "review", label: "Changes" },
  { id: "files", label: "Files" },
  { id: "preview", label: "Browser" },
  { id: "terminal", label: "Terminal" },
  { id: "tasks", label: "Tasks", more: true },
  { id: "context", label: "Context", more: true },
  { id: "agents", label: "Agents", more: true },
];

export function isBuiltinRailTab(value: string): value is RailTabId {
  return RAIL_TABS.some((t) => t.id === value);
}

/** The tab's shortcut, `Alt+N`. */
export function railTabShortcut(id: RailTabId): string {
  const idx = RAIL_TABS.findIndex((t) => t.id === id);
  return idx >= 0 ? `Alt+${idx + 1}` : "";
}

/** The tab for Alt+n (1-based), if there is one. */
export function railTabAt(n: number): RailTabId | undefined {
  return RAIL_TABS[n - 1]?.id;
}
