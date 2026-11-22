"use client";

import "./session-header.css";
import {
  Folder,
  GitBranch,
  GitPullRequest,
  PanelLeft,
  PanelRight,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useSessionLayout } from "@/app/sessions/[sessionId]/session-layout-context";
import { ChatMenu } from "@/components/chat/chat-menu";
import {
  ProviderIcon,
  getProviderFromModelId,
} from "@/components/provider-icons";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useGitPanel } from "./git-panel-context";

/**
 * Inline-editable session title ported 1:1 from Sable's `TitleName`.
 * Plain text at rest with soft hover highlight; double-click or keyboard Enter/Space opens rename.
 */
function TitleName({
  sessionId,
  title,
  onRename,
}: {
  sessionId: string;
  title: string;
  onRename: (nextTitle: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleButtonRef = useRef<HTMLButtonElement>(null);
  const committedRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setValue(title);
    }
  }, [editing, sessionId, title]);

  const startEditing = () => {
    committedRef.current = false;
    setValue(title);
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  if (!editing) {
    return (
      <button
        ref={titleButtonRef}
        type="button"
        className="topbar-name"
        title="Double-click to rename"
        onDoubleClick={startEditing}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startEditing();
          }
        }}
      >
        {title || "Untitled"}
      </button>
    );
  }

  const commit = (save: boolean) => {
    if (committedRef.current) return;
    committedRef.current = true;
    const next = value.trim();
    setEditing(false);
    if (save && next && next !== title) {
      void onRename(next).catch((err) => {
        toast.error(
          err instanceof Error ? err.message : "Could not rename session",
        );
      });
    }
    requestAnimationFrame(() => titleButtonRef.current?.focus());
  };

  return (
    <input
      ref={inputRef}
      className="topbar-rename"
      value={value}
      aria-label="Session title"
      spellCheck={false}
      style={{ width: `calc(${Math.max(8, value.length + 2)}ch + 14px)` }}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit(true);
        else if (e.key === "Escape") commit(false);
      }}
      onBlur={() => commit(true)}
    />
  );
}

/**
 * 1:1 Sable `Topbar` implementation for Entry session headers:
 * - Left: Sidebar toggle, conditional Entry home mark when sidebar is collapsed,
 *   active model provider mark, inline-renamable session title, and overflow-whole crumbs.
 * - Right: Waiting count, portaled header actions (ContextMeter, etc.), ChatMenu
 *   (Copy/Export Markdown + Share + Change repo), conditional Search when sidebar hidden,
 *   and Work Panel toggle that slides cleanly into the panel header on desktop when open.
 */
export function SessionHeader() {
  const { state, openMobile, isMobile, toggleSidebar } = useSidebar();
  const sidebarOpen = isMobile ? openMobile : state === "expanded";
  const {
    gitPanelOpen,
    setGitPanelOpen,
    setActiveWorkspaceTab,
    hasActionNeeded,
    changesCount,
    hasCommittedChanges,
    setShareRequested,
    setChangeRepoRequested,
    headerActionsRef,
    headerModelId,
    exportMarkdownRef,
  } = useGitPanel();
  const { session, renameSessionTitle } = useSessionLayout();

  const providerId = headerModelId ? getProviderFromModelId(headerModelId) : "";

  const tooltipText = useMemo(() => {
    const parts: string[] = [];
    if (session.prNumber) {
      const statusLabel =
        session.prStatus === "merged"
          ? "Merged"
          : session.prStatus === "closed"
            ? "Closed"
            : "Open";
      parts.push(`PR #${session.prNumber} (${statusLabel})`);
    }
    if (changesCount > 0) {
      parts.push(
        `${changesCount} file${changesCount !== 1 ? "s" : ""} changed`,
      );
    }
    if (hasActionNeeded) {
      parts.push("Uncommitted changes");
    }
    return parts.length > 0 ? parts.join(" · ") : "Workspace";
  }, [session.prNumber, session.prStatus, changesCount, hasActionNeeded]);

  const openGitPanel = useCallback(() => {
    const defaultTab = session.prNumber
      ? "review"
      : hasActionNeeded || hasCommittedChanges || changesCount > 0
        ? "review"
        : "preview";
    setActiveWorkspaceTab(defaultTab);
    setGitPanelOpen(true);
  }, [
    session.prNumber,
    hasActionNeeded,
    hasCommittedChanges,
    changesCount,
    setGitPanelOpen,
    setActiveWorkspaceTab,
  ]);

  const handleGitPanelToggle = useCallback(() => {
    if (gitPanelOpen) {
      setGitPanelOpen(false);
      return;
    }
    openGitPanel();
  }, [gitPanelOpen, openGitPanel, setGitPanelOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isGitPanelShortcut =
        event.code === "KeyB" &&
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        !event.altKey;

      if (!isGitPanelShortcut || event.repeat) {
        return;
      }

      event.preventDefault();
      handleGitPanelToggle();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleGitPanelToggle]);

  return (
    <header className="sable-topbar">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={toggleSidebar}
            aria-label={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <PanelLeft size={16} strokeWidth={1.6} aria-hidden="true" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {sidebarOpen ? "Hide sidebar" : "Show sidebar"} · ⌘B
        </TooltipContent>
      </Tooltip>

      <div className="topbar-title">
        {providerId && (
          <ProviderIcon
            provider={providerId}
            className="hidden sm:block size-[15px] shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}

        <TitleName
          key={session.id}
          sessionId={session.id}
          title={session.title}
          onRename={renameSessionTitle}
        />

        {(session.repoName || session.branch || session.prNumber) && (
          <span className="topbar-crumb hidden lg:inline-flex">
            {session.repoName && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setChangeRepoRequested(true)}
                    className="topbar-crumb-item topbar-crumb-btn"
                    aria-label="Change connected repository"
                  >
                    <Folder size={13} strokeWidth={1.6} aria-hidden="true" />
                    <span className="truncate">{session.repoName}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Change connected repository
                </TooltipContent>
              </Tooltip>
            )}

            {session.branch && (
              <span className="topbar-crumb-item">
                <GitBranch size={13} strokeWidth={1.6} aria-hidden="true" />
                <span className="truncate">{session.branch}</span>
              </span>
            )}

            {session.prNumber && session.repoOwner && session.repoName && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={`https://github.com/${session.repoOwner}/${session.repoName}/pull/${session.prNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "topbar-crumb-item topbar-crumb-btn",
                      session.prStatus === "merged"
                        ? "text-purple-600 dark:text-purple-400"
                        : session.prStatus === "closed"
                          ? "text-muted-foreground"
                          : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    <GitPullRequest
                      size={13}
                      strokeWidth={1.6}
                      aria-hidden="true"
                    />
                    <span className="tabular-nums">#{session.prNumber}</span>
                  </a>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  Pull Request #{session.prNumber} ({session.prStatus ?? "Open"}
                  )
                </TooltipContent>
              </Tooltip>
            )}
          </span>
        )}
      </div>

      <div className="topbar-actions">
        <div
          ref={headerActionsRef}
          className="topbar-actions-slot hidden md:inline-flex"
        />

        <ChatMenu
          getExportPayload={() => exportMarkdownRef.current?.() ?? null}
          onShare={() => setShareRequested(true)}
          onChangeRepo={() => setChangeRepoRequested(true)}
        />

        <span
          className="topbar-panel"
          data-away={gitPanelOpen || undefined}
          inert={gitPanelOpen && !isMobile ? true : undefined}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="topbar-icon-btn"
                data-active={gitPanelOpen ? "true" : undefined}
                onClick={handleGitPanelToggle}
                aria-label={gitPanelOpen ? "Hide panel" : "Show panel"}
              >
                <PanelRight size={16} strokeWidth={1.6} aria-hidden="true" />
                {!gitPanelOpen && hasActionNeeded && (
                  <span className="topbar-dot bg-foreground" />
                )}
                {!gitPanelOpen && !hasActionNeeded && hasCommittedChanges && (
                  <span className="topbar-dot bg-blue-500" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {gitPanelOpen ? "Hide panel" : "Show panel"} ({tooltipText}) · ⌘⇧B
            </TooltipContent>
          </Tooltip>
        </span>
      </div>
    </header>
  );
}
