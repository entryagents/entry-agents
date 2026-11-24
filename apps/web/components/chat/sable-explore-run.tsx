"use client";

import { ChevronRight, FileText, Search } from "lucide-react";
import { memo, useState, type ReactNode } from "react";
import { SableCollapse } from "@/components/sable-chat/collapse";
import {
  describeExploreTarget,
  formatExploreRunLabel,
  type WorkItem,
} from "./sable-turn-grouping";
import { useHeld } from "./timeline-util";

type ToolWorkItem = Extract<WorkItem, { kind: "tool" }>;

function isExploreItemActive(item: ToolWorkItem): boolean {
  if (!item.isStreaming) return false;
  return (
    item.part.state === "input-streaming" ||
    item.part.state === "input-available" ||
    (item.part.state === "output-available" && item.part.preliminary === true)
  );
}

/**
 * Ported 1:1 from Leonxlnx/sable `src/features/timeline/items.tsx` (`ExploreRun`).
 * Consecutive look-only tools (read, grep, glob, web_fetch) fold into a single
 * calm row ("Read 6 files", "Searched 3 times", "Explored 4 files, 2 searches")
 * that expands smoothly along a left hairline guide rail.
 */
export const SableExploreRun = memo(function SableExploreRun({
  items,
  renderTool,
}: {
  items: readonly ToolWorkItem[];
  renderTool: (item: ToolWorkItem) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  let files = 0;
  let searches = 0;
  let pages = 0;
  let activeNow = "";

  for (const item of items) {
    if (item.part.type === "tool-read") {
      files += 1;
    } else if (item.part.type === "tool-web_fetch") {
      pages += 1;
    } else {
      searches += 1;
    }
    if (isExploreItemActive(item)) {
      activeNow = describeExploreTarget(item.part);
    }
  }

  // Hold each active target name briefly so bursts of quick reads don't flicker.
  const held = useHeld(activeNow, 450);
  const active = activeNow && held ? held : "";
  const label = formatExploreRunLabel(files, searches, pages);
  const metaCount = label.replace(/^\w+\s+/, "");
  const showSearchIcon = searches > 0 || pages > 0;

  return (
    <div className="sable-tl-sub" data-k="run">
      <button
        type="button"
        className="sable-row-btn sable-explore-row"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="sable-tool-icon" aria-hidden="true">
          {showSearchIcon ? (
            <Search size={14} strokeWidth={1.5} />
          ) : (
            <FileText size={14} strokeWidth={1.5} />
          )}
        </span>
        {active ? (
          <>
            <span className="sable-tool-title shimmer">
              {searches > 0 && files === 0 ? "Searching" : "Reading"}
            </span>
            <span className="sable-tool-sub truncate">{active}</span>
          </>
        ) : (
          <span className="sable-tool-title truncate">{label}</span>
        )}
        <span className="sable-tool-meta">
          {active ? <span className="tabular-nums">{metaCount}</span> : null}
        </span>
        <ChevronRight
          size={10}
          strokeWidth={1.75}
          className="sable-row-caret"
          aria-hidden="true"
        />
      </button>

      <SableCollapse open={open}>
        <div className="sable-run-rows">
          {items.map((item) => (
            <div key={item.key} className="min-w-0">
              {renderTool(item)}
            </div>
          ))}
        </div>
      </SableCollapse>
    </div>
  );
});
