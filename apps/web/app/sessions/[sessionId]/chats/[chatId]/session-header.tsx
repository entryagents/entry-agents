"use client";

import "./session-header.css";
import { Folder, GitBranch, PanelLeft, PanelRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSessionLayout } from "@/app/sessions/[sessionId]/session-layout-context";
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

  const commit = useCallback(async () => {
    if (committedRef.current) return;
    committedRef.current = true;
    const trimmed = value.trim();
    setEditing(false);
    if (!trimmed || trimmed === title) {
      setValue(title);
      return;
    }
    try {
      await onRename(trimmed);
    } catch {
      setValue(title);
      toast.error("Failed to rename session");
    }
  }, [value, title, onRename]);

  const startEdit = useCallback(() => {
    committedRef.current = false;
    setValue(title);
    setEditing(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [title]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        aria-label="Session title"
        className="topbar-name topbar-name-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            committedRef.current = true;
            setValue(title);
            setEditing(false);
            requestAnimationFrame(() => titleButtonRef.current?.focus());
          }
        }}
      />
    );
  }

  return (
    <button
      ref={titleButtonRef}
      key={sessionId}
      type="button"
      className="topbar-name truncate"
      onDoubleClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEdit();
        }
      }}
    >
      {title}
    </button>
  );
}

/**
 * 1:1 Sable `Topbar` implementation for Entry session headers:
 * - Left: Sidebar toggle, active model provider mark, inline-renamable session title,
 *   and plain folder/branch crumbs.
 * - Right: Desktop-only context meter slot and Work Panel toggle.
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
    headerActionsRef,
    headerModelId,
  } = useGitPanel();
  const { session, renameSessionTitle } = useSessionLayout();

  const providerId = headerModelId ? getProviderFromModelId(headerModelId) : "";

  const openGitPanel = useCallback(() => {
    const defaultTab = session.prNumber
      ? "review"
      : hasActionNeeded || hasCommittedChanges || changesCount > 0
        ? "review"
        : "files";
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

        {(session.repoName || session.branch) && (
          <span className="topbar-crumb hidden lg:inline-flex">
            {session.repoName && (
              <span className="topbar-crumb-item">
                <Folder size={13} strokeWidth={1.6} aria-hidden="true" />
                <span className="truncate">{session.repoName}</span>
              </span>
            )}

            {session.branch && (
              <span className="topbar-crumb-item">
                <GitBranch size={13} strokeWidth={1.6} aria-hidden="true" />
                <span className="truncate">{session.branch}</span>
              </span>
            )}
          </span>
        )}
      </div>

      <div className="topbar-actions">
        <div
          ref={headerActionsRef}
          className="topbar-actions-slot hidden md:inline-flex"
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
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {gitPanelOpen ? "Hide panel" : "Show panel"}
            </TooltipContent>
          </Tooltip>
        </span>
      </div>
    </header>
  );
}
