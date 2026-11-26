"use client";

import {
  AtSign,
  ChevronRight,
  ChevronsDownUp,
  File,
  FileCode,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FileSuggestion } from "@/app/api/sessions/[sessionId]/files/route";
import {
  highlightSegments,
  toChangeLetter,
} from "@/app/sessions/[sessionId]/chats/[chatId]/workspace/sable-rail-helpers";
import type { DiffFile } from "@/lib/diff/compute-diff";
import { cn } from "@/lib/utils";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif|ico|bmp)$/i;
const CODE_EXT =
  /\.(tsx?|jsx?|mjs|cjs|json|css|scss|html?|vue|svelte|py|rs|go|java|kt|swift|c|h|cpp|hpp|cs|rb|php|sh|ps1|ya?ml|toml|sql|lua)$/i;
const TEXT_EXT = /\.(md|mdx|txt|rst|log)$/i;

function SableFileIcon({ name }: { name: string }) {
  if (IMAGE_EXT.test(name)) {
    return <ImageIcon size={14} strokeWidth={1.6} className="fl-icon" />;
  }
  if (CODE_EXT.test(name)) {
    return <FileCode size={14} strokeWidth={1.6} className="fl-icon" />;
  }
  if (TEXT_EXT.test(name)) {
    return <FileText size={14} strokeWidth={1.6} className="fl-icon" />;
  }
  return <File size={14} strokeWidth={1.6} className="fl-icon" />;
}

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Map<string, TreeNode>;
}

interface FlatTreeRow {
  node: TreeNode;
  depth: number;
  parentPath: string | null;
}

function buildFileTree(files: FileSuggestion[]): TreeNode {
  const root: TreeNode = {
    name: "root",
    path: "",
    isDirectory: true,
    children: new Map(),
  };

  for (const item of files) {
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

function sortChildren(node: TreeNode): TreeNode[] {
  return Array.from(node.children.values()).sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });
}

function getAncestorDirPaths(filePath: string): string[] {
  const parts = filePath.split("/").filter(Boolean);
  const dirs: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    dirs.push(`${parts.slice(0, i).join("/")}/`);
  }
  return dirs;
}

function renderHighlighted(name: string, query: string) {
  const segs = highlightSegments(name, query);
  if (segs.length === 1 && !segs[0]?.match) return name;
  return segs.map((seg, idx) =>
    seg.match ? (
      <mark key={idx} className="fl-mark">
        {seg.text}
      </mark>
    ) : (
      <span key={idx}>{seg.text}</span>
    ),
  );
}

const TreeRow = memo(function TreeRow({
  row,
  isOpen,
  isActive,
  isFocused,
  statusLetter,
  hasChangedInside,
  query,
  onActivate,
  onFocusPath,
  onPrefetchFile,
  onMentionInChat,
}: {
  row: FlatTreeRow;
  isOpen: boolean;
  isActive: boolean;
  isFocused: boolean;
  statusLetter?: string;
  hasChangedInside: boolean;
  query: string;
  onActivate: (node: TreeNode) => void;
  onFocusPath: (path: string) => void;
  onPrefetchFile?: (path: string) => void;
  onMentionInChat?: (mention: string) => void;
}) {
  const { node, depth } = row;
  return (
    <div
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={node.isDirectory ? isOpen : undefined}
      aria-selected={isActive || isFocused}
      tabIndex={isFocused ? 0 : -1}
      data-key={node.path}
      data-dir={node.isDirectory ? "true" : undefined}
      data-active={isActive ? "true" : undefined}
      style={{ "--depth": depth } as CSSProperties}
      className="fl-row rail-row-host"
      onClick={() => onActivate(node)}
      onFocus={() => {
        onFocusPath(node.path);
        if (!node.isDirectory) onPrefetchFile?.(node.path);
      }}
      onMouseEnter={() => {
        if (!node.isDirectory) onPrefetchFile?.(node.path);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate(node);
        }
      }}
    >
      <span className="fl-caret" aria-hidden="true">
        {node.isDirectory ? (
          <ChevronRight
            size={11}
            strokeWidth={2}
            className={isOpen ? "is-open" : undefined}
          />
        ) : null}
      </span>
      {node.isDirectory ? (
        isOpen ? (
          <FolderOpen size={14} strokeWidth={1.6} className="fl-icon" />
        ) : (
          <Folder size={14} strokeWidth={1.6} className="fl-icon" />
        )
      ) : (
        <SableFileIcon name={node.name} />
      )}
      <span className="fl-name truncate">
        {renderHighlighted(node.name, query)}
      </span>
      <span className="rail-row-deco fl-deco">
        {statusLetter ? (
          <span
            className="st-letter"
            data-small=""
            data-status={statusLetter}
            title={`Changed (${statusLetter})`}
          >
            {statusLetter}
          </span>
        ) : hasChangedInside ? (
          <span className="fl-dot" aria-label="Contains changes" />
        ) : null}
      </span>
      {onMentionInChat && (
        <span className="rail-row-acts">
          <button
            type="button"
            className="rail-btn"
            tabIndex={-1}
            aria-label={`Mention ${node.path} in chat`}
            title="Mention in chat"
            onClick={(e) => {
              e.stopPropagation();
              const clean = node.path.replace(/\/+$/, "");
              onMentionInChat(`@${clean}${node.isDirectory ? "/" : ""}`);
            }}
          >
            <AtSign size={13} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </span>
      )}
    </div>
  );
});

export function WorkspaceFileTree({
  files,
  filesLoading = false,
  hasSandbox = true,
  diffFiles = [],
  activeFilePath,
  onOpenFile,
  onPrefetchFile,
  onRefresh,
  onMentionInChat,
  className,
}: {
  files: FileSuggestion[] | null | undefined;
  filesLoading?: boolean;
  hasSandbox?: boolean;
  diffFiles?: DiffFile[];
  activeFilePath?: string | null;
  onOpenFile: (filePath: string) => void;
  onPrefetchFile?: (filePath: string) => void;
  onRefresh?: () => void;
  onMentionInChat?: (mention: string) => void;
  className?: string;
}) {
  const [filter, setFilter] = useState("");
  const [visibleLimit, setVisibleLimit] = useState(250);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleLimit(250);
  }, [filter]);

  const changes = useMemo(() => {
    const fileMap = new Map<string, string>();
    const folderSet = new Set<string>();
    for (const df of diffFiles) {
      const letter = toChangeLetter(df.status);
      if (letter) {
        fileMap.set(df.path, letter);
      }
      for (const dir of getAncestorDirPaths(df.path)) {
        folderSet.add(dir);
      }
    }
    return { fileMap, folderSet };
  }, [diffFiles]);

  const treeRoot = useMemo(() => {
    if (!files || files.length === 0) return null;
    return buildFileTree(files);
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

  const q = filter.trim().toLowerCase();

  // Compute matching nodes & ancestor folders to auto-open while filtering
  const matches = useMemo(() => {
    if (!q || !treeRoot) return null;
    const keep = new Set<string>();
    const through = new Set<string>();

    const visit = (node: TreeNode): boolean => {
      let any = false;
      for (const child of node.children.values()) {
        const self = child.name.toLowerCase().includes(q);
        const below = child.isDirectory ? visit(child) : false;
        if (self || below) {
          keep.add(child.path);
          if (below) through.add(child.path);
          any = true;
        }
      }
      return any;
    };

    visit(treeRoot);
    return { keep, through };
  }, [q, treeRoot]);

  const isFolderOpen = useCallback(
    (dirPath: string) =>
      expandedPaths.has(dirPath) || Boolean(matches?.through.has(dirPath)),
    [expandedPaths, matches],
  );

  const rows = useMemo<FlatTreeRow[]>(() => {
    if (!treeRoot) return [];
    const out: FlatTreeRow[] = [];

    const walk = (node: TreeNode, depth: number, parentPath: string | null) => {
      for (const child of sortChildren(node)) {
        if (matches && !matches.keep.has(child.path)) continue;
        out.push({ node: child, depth, parentPath });
        if (child.isDirectory && isFolderOpen(child.path)) {
          walk(child, depth + 1, child.path);
        }
      }
    };

    walk(treeRoot, 0, null);
    return out;
  }, [treeRoot, matches, isFolderOpen]);

  const toggleFolder = useCallback((dirPath: string, open?: boolean) => {
    setExpandedPaths((prev) => {
      const wasOpen = prev.has(dirPath);
      const want = open ?? !wasOpen;
      if (want === wasOpen) return prev;
      const next = new Set(prev);
      if (want) next.add(dirPath);
      else next.delete(dirPath);
      return next;
    });
  }, []);

  const activateNode = useCallback(
    (node: TreeNode) => {
      setFocusPath(node.path);
      if (node.isDirectory) {
        toggleFolder(node.path);
      } else {
        onOpenFile(node.path);
      }
    },
    [onOpenFile, toggleFolder],
  );

  const focusIndex = useMemo(() => {
    if (rows.length === 0) return -1;
    const target = focusPath ?? activeFilePath ?? null;
    if (!target) return 0;
    const idx = rows.findIndex((r) => r.node.path === target);
    return idx >= 0 ? idx : 0;
  }, [rows, focusPath, activeFilePath]);

  const focusRowAt = useCallback(
    (idx: number) => {
      const row = rows[Math.max(0, Math.min(rows.length - 1, idx))];
      if (!row) return;
      setFocusPath(row.node.path);
      requestAnimationFrame(() => {
        treeRef.current
          ?.querySelector<HTMLElement>(
            `[data-key="${CSS.escape(row.node.path)}"]`,
          )
          ?.focus({ preventScroll: true });
      });
    },
    [rows],
  );

  const onTreeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (focusIndex < 0) return;
    const row = rows[focusIndex];
    if (!row) return;
    const open = row.node.isDirectory && isFolderOpen(row.node.path);

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusRowAt(focusIndex + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (focusIndex === 0) {
          filterRef.current?.focus();
        } else {
          focusRowAt(focusIndex - 1);
        }
        break;
      case "Home":
        e.preventDefault();
        focusRowAt(0);
        break;
      case "End":
        e.preventDefault();
        focusRowAt(rows.length - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        if (row.node.isDirectory && !open) {
          toggleFolder(row.node.path, true);
        } else if (row.node.isDirectory) {
          focusRowAt(focusIndex + 1);
        }
        break;
      case "ArrowLeft":
        e.preventDefault();
        if (row.node.isDirectory && open) {
          toggleFolder(row.node.path, false);
        } else if (row.parentPath) {
          const parentIdx = rows.findIndex(
            (r) => r.node.path === row.parentPath,
          );
          if (parentIdx >= 0) focusRowAt(parentIdx);
        }
        break;
      default:
        break;
    }
  };

  return (
    <div className={cn("rail-col", className)}>
      {/* 1:1 Sable inline filter bar */}
      <div className="rail-bar rail-bar-field">
        <label className="fl-filter">
          <Search size={13.5} strokeWidth={1.6} aria-hidden="true" />
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter files"
            aria-label="Filter workspace files"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && rows.length > 0) {
                e.preventDefault();
                focusRowAt(0);
              } else if (e.key === "Escape" && filter) {
                e.preventDefault();
                e.stopPropagation();
                setFilter("");
              }
            }}
          />
          {filter ? (
            <button
              type="button"
              className="fl-clear"
              aria-label="Clear filter"
              onClick={() => {
                setFilter("");
                filterRef.current?.focus();
              }}
            >
              <X size={10.5} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
        </label>

        <span className="rail-bar-actions">
          <button
            type="button"
            className="rail-btn"
            disabled={expandedPaths.size === 0}
            onClick={() => setExpandedPaths(new Set())}
            aria-label="Collapse folders"
            title="Collapse folders"
          >
            <ChevronsDownUp size={13.5} strokeWidth={1.6} aria-hidden="true" />
          </button>
          {onRefresh && (
            <button
              type="button"
              className="rail-btn"
              onClick={onRefresh}
              disabled={filesLoading}
              aria-label="Refresh"
              title="Refresh"
            >
              <RefreshCw size={13.5} strokeWidth={1.6} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>

      {/* Tree rows */}
      <div className="rail-scroll">
        {filesLoading && (files?.length ?? 0) === 0 ? (
          <div className="rail-loading">
            <Loader2
              size={14}
              strokeWidth={1.6}
              className="animate-spin"
              aria-hidden="true"
            />
            <span>Reading the folder</span>
          </div>
        ) : rows.length === 0 ? (
          <p className="rail-empty">
            {q
              ? "Nothing matches this filter."
              : hasSandbox
                ? "This folder is empty."
                : "Workspace not active yet."}
          </p>
        ) : (
          <div
            ref={treeRef}
            className="fl-tree"
            role="tree"
            aria-label="Workspace files"
            onKeyDown={onTreeKeyDown}
          >
            {rows.slice(0, visibleLimit).map((row, idx) => (
              <TreeRow
                key={row.node.path}
                row={row}
                isOpen={row.node.isDirectory && isFolderOpen(row.node.path)}
                isActive={
                  !row.node.isDirectory && activeFilePath === row.node.path
                }
                isFocused={idx === focusIndex}
                statusLetter={
                  row.node.isDirectory
                    ? undefined
                    : changes.fileMap.get(row.node.path)
                }
                hasChangedInside={
                  row.node.isDirectory && changes.folderSet.has(row.node.path)
                }
                query={q}
                onActivate={activateNode}
                onFocusPath={setFocusPath}
                onPrefetchFile={onPrefetchFile}
                onMentionInChat={onMentionInChat}
              />
            ))}
            {rows.length > visibleLimit && (
              <div className="px-2 py-2">
                <button
                  type="button"
                  className="sable-btn-sm w-full justify-center"
                  onClick={() => setVisibleLimit((prev) => prev + 250)}
                >
                  Show more ({(rows.length - visibleLimit).toLocaleString()}{" "}
                  remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
