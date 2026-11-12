"use client";

import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  Search,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
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

export function WorkspaceFileTree({
  files,
  diffFiles = [],
  activeFilePath,
  onOpenFile,
  onCloseSidebar,
}: {
  files: FileSuggestion[] | null | undefined;
  diffFiles?: DiffFile[];
  activeFilePath?: string | null;
  onOpenFile: (filePath: string) => void;
  onCloseSidebar?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(
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

  const toggleFolder = (dirPath: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  // Build the hierarchical tree
  const treeRoot = useMemo(() => {
    if (!files || files.length === 0) return null;
    return buildFileTree(files);
  }, [files]);

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
        const isCollapsed = collapsedPaths.has(child.path);
        return (
          <div key={child.path} className="flex flex-col">
            <button
              type="button"
              onClick={() => toggleFolder(child.path)}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              className="flex w-full items-center gap-1.5 py-1 pr-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors select-none text-left rounded-sm group cursor-pointer"
            >
              {isCollapsed ? (
                <ChevronRight className="h-3 w-3 shrink-0 opacity-70 group-hover:opacity-100" />
              ) : (
                <ChevronDown className="h-3 w-3 shrink-0 opacity-70 group-hover:opacity-100" />
              )}
              {isCollapsed ? (
                <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500/80" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
              <span className="truncate font-medium">{child.name}</span>
            </button>
            {!isCollapsed && renderTree(child, depth + 1)}
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
          style={{ paddingLeft: `${depth * 12 + 20}px` }}
          className={cn(
            "flex w-full items-center justify-between py-1 pr-2 text-xs transition-colors select-none text-left rounded-sm group cursor-pointer",
            isActive
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          )}
        >
          <div className="flex items-center gap-1.5 min-w-0">
            <FileTypeIcon path={child.name} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-mono">{child.name}</span>
          </div>

          {/* Git Change Indicator */}
          {status && (
            <span
              className={cn(
                "ml-1 flex h-3.5 px-1 shrink-0 items-center justify-center rounded text-[9px] font-bold",
                status === "added" &&
                  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                status === "modified" &&
                  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                status === "deleted" &&
                  "bg-rose-500/15 text-rose-600 dark:text-rose-400",
              )}
            >
              {status === "added" ? "+" : status === "modified" ? "~" : "-"}
            </span>
          )}
        </button>
      );
    });
  };

  return (
    <div className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-background select-none">
      {/* Explorer Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Explorer
        </span>
        {onCloseSidebar && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onCloseSidebar}
            className="h-5 w-5 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Collapse explorer sidebar"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Search Input */}
      <div className="p-2 border-b border-border/60">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files..."
            className="pl-6 h-7 text-xs font-mono"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
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
                No files found
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
                    className={cn(
                      "flex w-full items-center justify-between px-2 py-1 text-xs rounded transition-colors text-left cursor-pointer",
                      isActive
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
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
                          "ml-1 flex h-3.5 px-1 shrink-0 items-center justify-center rounded text-[9px] font-bold",
                          status === "added" &&
                            "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
                          status === "modified" &&
                            "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                          status === "deleted" &&
                            "bg-rose-500/15 text-rose-600 dark:text-rose-400",
                        )}
                      >
                        {status === "added"
                          ? "+"
                          : status === "modified"
                            ? "~"
                            : "-"}
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
