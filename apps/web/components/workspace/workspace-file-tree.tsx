"use client";

import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  Folder,
  FolderOpen,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import { FileTypeIcon } from "@/components/file-type-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DiffFile } from "@/lib/diff/compute-diff";
import { cn } from "@/lib/utils";

type TreeNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, TreeNode>;
};

function buildFileTree(files: FileSuggestion[]): TreeNode {
  const root: TreeNode = {
    name: "root",
    path: "",
    isDirectory: true,
    children: new Map(),
  };

  for (const item of files) {
    // Trim trailing slash for directory values
    const cleanPath = item.value.endsWith("/")
      ? item.value.slice(0, -1)
      : item.value;
    if (!cleanPath) continue;

    const parts = cleanPath.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;

      const isLast = i === parts.length - 1;
      const isDir = !isLast || item.isDirectory;
      const currentPath = parts.slice(0, i + 1).join("/");

      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          path: isDir ? `${currentPath}/` : currentPath,
          isDirectory: isDir,
          children: new Map(),
        });
      }
      const nextNode = current.children.get(part);
      if (nextNode) {
        current = nextNode;
      }
    }
  }

  return root;
}

function getAncestorDirPaths(filePath: string): string[] {
  const parts = filePath.split("/").filter(Boolean);
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    dirs.push(`${parts.slice(0, i).join("/")}/`);
  }
  return dirs;
}

export function WorkspaceFileTree({
  files,
  diffFiles = [],
  activeFilePath,
  onOpenFile,
  onPrefetchFile,
  onCloseSidebar,
  className,
}: {
  files: FileSuggestion[] | null | undefined;
  diffFiles?: DiffFile[];
  activeFilePath?: string | null;
  onOpenFile: (filePath: string) => void;
  onPrefetchFile?: (filePath: string) => void;
  onCloseSidebar?: () => void;
  className?: string;
}) {
  const [search, setSearch] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(),
  );

  // Map of file paths to git status for diff badges
  const diffStatusMap = useMemo(() => {
    const map = new Map<string, DiffFile["status"]>();
    for (const df of diffFiles) {
      map.set(df.path, df.status);
    }
    return map;
  }, [diffFiles]);

  // Build the hierarchical tree
  const treeRoot = useMemo(() => {
    if (!files || files.length === 0) return null;
    return buildFileTree(files);
  }, [files]);

  const fileCount = useMemo(() => {
    if (!files) return 0;
    return files.filter((f) => !f.isDirectory).length;
  }, [files]);

  // Auto-expand active file's ancestor folders
  useEffect(() => {
    if (!activeFilePath) return;
    const ancestors = getAncestorDirPaths(activeFilePath);
    if (ancestors.length === 0) return;
    setExpandedPaths((prev) => {
      let changed = false;
      for (const dir of ancestors) {
        if (!prev.has(dir)) {
          changed = true;
          break;
        }
      }
      if (!changed) return prev;
      const next = new Set(prev);
      for (const dir of ancestors) {
        next.add(dir);
      }
      return next;
    });
  }, [activeFilePath]);

  const toggleFolder = (dirPath: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  // Filtered flat list when searching
  const searchResults = useMemo(() => {
    if (!search.trim() || !files) return null;
    const q = search.toLowerCase();
    return files
      .filter((f) => !f.isDirectory && f.value.toLowerCase().includes(q))
      .slice(0, 100);
  }, [search, files]);

  // Recursive tree renderer
  const renderTree = (node: TreeNode, depth: number = 0) => {
    // Sort directories first, then alphabetically
    const entries = Array.from(node.children.values()).sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return entries.map((child) => {
      if (child.isDirectory) {
        const isExpanded = expandedPaths.has(child.path);
        return (
          <div key={child.path} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggleFolder(child.path)}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              className="flex h-7 w-full items-center gap-1.5 pr-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] select-none text-left rounded-md group cursor-pointer"
            >
              {isExpanded ? (
                <ChevronDown
                  className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100"
                  strokeWidth={1.5}
                />
              ) : (
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100"
                  strokeWidth={1.5}
                />
              )}
              {isExpanded ? (
                <FolderOpen
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  strokeWidth={1.5}
                />
              ) : (
                <Folder
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80"
                  strokeWidth={1.5}
                />
              )}
              <span className="truncate font-medium">{child.name}</span>
            </button>
            {isExpanded && renderTree(child, depth + 1)}
          </div>
        );
      }

      // File item
      const isActive = activeFilePath === child.path;
      const status = diffStatusMap.get(child.path);

      return (
        <button
          key={child.path}
          type="button"
          onClick={() => onOpenFile(child.path)}
          onMouseEnter={() => onPrefetchFile?.(child.path)}
          onFocus={() => onPrefetchFile?.(child.path)}
          style={{ paddingLeft: `${depth * 12 + 24}px` }}
          className={cn(
            "relative flex h-7 w-full items-center justify-between pr-2 text-xs transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] select-none text-left rounded-md group cursor-pointer",
            isActive
              ? "bg-muted text-foreground font-medium"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          {isActive && (
            <span
              aria-hidden="true"
              className="absolute left-0.5 top-1.5 bottom-1.5 w-0.5 rounded-full bg-foreground"
            />
          )}
          <div className="flex items-center gap-1.5 min-w-0">
            <FileTypeIcon path={child.name} className="h-3.5 w-3.5 shrink-0" />
            <span
              className={cn(
                "truncate font-mono",
                status === "added" &&
                  !isActive &&
                  "text-emerald-600 dark:text-emerald-400",
                status === "modified" &&
                  !isActive &&
                  "text-amber-600 dark:text-amber-400",
                status === "deleted" &&
                  !isActive &&
                  "text-rose-600 line-through dark:text-rose-400",
              )}
            >
              {child.name}
            </span>
          </div>

          {/* Git Change Indicator */}
          {status && (
            <span
              className={cn(
                "ml-1.5 shrink-0 font-mono text-[11px] font-medium tabular-nums",
                status === "added" && "text-emerald-600 dark:text-emerald-400",
                status === "modified" && "text-amber-600 dark:text-amber-400",
                status === "deleted" && "text-rose-600 dark:text-rose-400",
              )}
            >
              {status === "added" ? "A" : status === "modified" ? "M" : "D"}
            </span>
          )}
        </button>
      );
    });
  };

  return (
    <div
      className={cn(
        "flex h-full w-56 xl:w-64 shrink-0 flex-col border-r border-border bg-muted/15 select-none",
        className,
      )}
    >
      {/* Explorer Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-foreground">Explorer</span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground leading-none">
            {fileCount}
          </span>
          {diffStatusMap.size > 0 && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-medium tabular-nums text-amber-600 dark:text-amber-400 leading-none">
              {diffStatusMap.size} changed
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {expandedPaths.size > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setExpandedPaths(new Set())}
              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Collapse all folders"
              title="Collapse all folders"
            >
              <ChevronsDownUp className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Button>
          )}
          {onCloseSidebar && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onCloseSidebar}
              className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Close file explorer"
              title="Hide explorer"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-border/60">
        <div className="relative">
          <Search
            className="absolute left-2 top-2 h-3 w-3 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && search) {
                e.preventDefault();
                setSearch("");
              }
            }}
            placeholder="Filter files..."
            className="pl-6 pr-6 h-7 text-xs font-mono bg-background"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Clear file filter"
            >
              <X className="h-3 w-3" strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* File Tree / Search Results */}
      <div className="flex-1 overflow-y-auto p-1 text-xs [scrollbar-width:thin]">
        {searchResults ? (
          <div className="flex flex-col gap-0.5">
            {searchResults.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No matching files
              </div>
            ) : (
              searchResults.map((f) => {
                const isActive = activeFilePath === f.value;
                const status = diffStatusMap.get(f.value);
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => onOpenFile(f.value)}
                    onMouseEnter={() => onPrefetchFile?.(f.value)}
                    onFocus={() => onPrefetchFile?.(f.value)}
                    className={cn(
                      "relative flex h-7 w-full items-center justify-between px-2 text-xs rounded-md transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] text-left cursor-pointer",
                      isActive
                        ? "bg-muted text-foreground font-medium"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    {isActive && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0.5 top-1.5 bottom-1.5 w-0.5 rounded-full bg-foreground"
                      />
                    )}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileTypeIcon
                        path={f.value}
                        className="h-3.5 w-3.5 shrink-0"
                      />
                      <span className="truncate font-mono">{f.value}</span>
                    </div>
                    {status && (
                      <span
                        className={cn(
                          "ml-1.5 shrink-0 font-mono text-[11px] font-medium tabular-nums",
                          status === "added" &&
                            "text-emerald-600 dark:text-emerald-400",
                          status === "modified" &&
                            "text-amber-600 dark:text-amber-400",
                          status === "deleted" &&
                            "text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {status === "added"
                          ? "A"
                          : status === "modified"
                            ? "M"
                            : "D"}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        ) : treeRoot ? (
          renderTree(treeRoot)
        ) : (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No files available
          </div>
        )}
      </div>
    </div>
  );
}
