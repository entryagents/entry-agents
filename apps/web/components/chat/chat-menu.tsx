"use client";

import {
  Copy,
  Download,
  FolderGit2,
  Link2,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  copyChatMarkdown,
  exportChatMarkdown,
  type ExportPayload,
} from "@/lib/export/export";

interface ChatMenuProps {
  getExportPayload: () => ExportPayload | null;
  onShare: () => void;
  onChangeRepo?: () => void;
}

/**
 * Header overflow menu ported from Sable's `ChatMenu.tsx`:
 * Copy as Markdown, Export chat (.md), plus Entry's Share & Change repository actions.
 */
export function ChatMenu({
  getExportPayload,
  onShare,
  onChangeRepo,
}: ChatMenuProps) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="topbar-icon-btn"
              aria-label="Chat menu"
            >
              <MoreHorizontal size={16} strokeWidth={1.6} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Chat menu</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-[210px]">
        <DropdownMenuItem
          onSelect={() => {
            void copyChatMarkdown(getExportPayload);
          }}
          className="gap-2 text-[13px] cursor-pointer"
        >
          <Copy size={14} strokeWidth={1.6} className="text-muted-foreground" />
          <span>Copy as Markdown</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            exportChatMarkdown(getExportPayload);
          }}
          className="gap-2 text-[13px] cursor-pointer"
        >
          <Download
            size={14}
            strokeWidth={1.6}
            className="text-muted-foreground"
          />
          <span>Export chat (.md)</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={onShare}
          className="gap-2 text-[13px] cursor-pointer"
        >
          <Link2
            size={14}
            strokeWidth={1.6}
            className="text-muted-foreground"
          />
          <span>Share chat link</span>
        </DropdownMenuItem>
        {onChangeRepo && (
          <DropdownMenuItem
            onSelect={onChangeRepo}
            className="gap-2 text-[13px] cursor-pointer"
          >
            <FolderGit2
              size={14}
              strokeWidth={1.6}
              className="text-muted-foreground"
            />
            <span>Change repository</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
