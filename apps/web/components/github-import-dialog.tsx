"use client";

import {
  ChevronDown,
  ExternalLink,
  FolderGit2,
  Loader2,
  Lock,
  RefreshCw,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useGitHubConnectionStatus } from "@/hooks/use-github-connection-status";
import { useInstallationRepos } from "@/hooks/use-installation-repos";
import { useSession } from "@/hooks/use-session";
import { parseGithubRepoInput } from "@/lib/github/parse-repo-input";
import { buildGitHubReconnectUrl } from "@/lib/github/urls";
import { formatRelativeTime } from "@/lib/format-relative-time";

const installationSchema = z.object({
  installationId: z.number(),
  accountLogin: z.string(),
  accountType: z.enum(["User", "Organization"]),
  repositorySelection: z.enum(["all", "selected"]),
  installationUrl: z.string().nullable(),
});

const installationsSchema = z.array(installationSchema);
type Installation = z.infer<typeof installationSchema>;

async function fetchInstallations(): Promise<Installation[]> {
  const response = await fetch("/api/github/installations");
  if (!response.ok) return [];
  const json = await response.json();
  const parsed = installationsSchema.safeParse(json);
  return parsed.success ? parsed.data : [];
}

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export interface GitHubImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportRepo: (owner: string, repo: string) => Promise<void> | void;
}

export function GitHubImportDialog({
  open,
  onOpenChange,
  onImportRepo,
}: GitHubImportDialogProps) {
  const { hasGitHub } = useSession();
  const { reconnectRequired } = useGitHubConnectionStatus({
    enabled: open && hasGitHub,
  });

  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedInstallationId, setSelectedInstallationId] = useState<
    number | null
  >(null);
  const [importingKey, setImportingKey] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: installations = [], isLoading: installationsLoading } = useSWR<
    Installation[]
  >(
    open && hasGitHub && !reconnectRequired ? "github-installations" : null,
    fetchInstallations,
  );

  useEffect(() => {
    if (installations.length > 0 && selectedInstallationId === null) {
      setSelectedInstallationId(installations[0]?.installationId ?? null);
    }
  }, [installations, selectedInstallationId]);

  const activeInstallation = useMemo(
    () =>
      installations.find(
        (inst) => inst.installationId === selectedInstallationId,
      ) ??
      installations[0] ??
      null,
    [installations, selectedInstallationId],
  );

  const {
    repos,
    isLoading: reposLoading,
    refresh,
  } = useInstallationRepos({
    installationId:
      open && !reconnectRequired
        ? (activeInstallation?.installationId ?? null)
        : null,
    query: searchQuery,
    limit: 40,
  });

  const handleImport = async (owner: string, repo: string, key: string) => {
    setImportingKey(key);
    try {
      await onImportRepo(owner, repo);
      onOpenChange(false);
      setUrlInput("");
      setUrlError(null);
    } catch (error) {
      console.error("Failed to import repository:", error);
    } finally {
      setImportingKey(null);
    }
  };

  const handleUrlSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = parseGithubRepoInput(urlInput);
    if (!parsed) {
      setUrlError("Enter a valid GitHub URL or owner/repo");
      return;
    }
    setUrlError(null);
    await handleImport(
      parsed.owner,
      parsed.repo,
      `url:${parsed.owner}/${parsed.repo}`,
    );
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const reconnectHref =
    typeof window !== "undefined"
      ? buildGitHubReconnectUrl(
          `${window.location.pathname}${window.location.search}`,
        )
      : "/api/auth/github/connect";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-1.5rem)] max-w-lg gap-0 overflow-hidden rounded-2xl border border-border/80 bg-card p-0 shadow-lg">
        <DialogHeader className="border-b border-border/60 px-4 py-3.5 text-left">
          <DialogTitle className="flex items-center gap-2 text-sm font-medium text-foreground">
            <GitHubMark className="h-4 w-4 shrink-0 text-foreground" />
            <span>Import from GitHub</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Add a repository project from a URL or select one below
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 p-4">
          {/* Import from a URL */}
          <form onSubmit={handleUrlSubmit} className="space-y-1.5">
            <label
              htmlFor="github-import-url"
              className="block text-xs font-medium text-foreground"
            >
              Import from a URL
            </label>
            <div className="flex items-center gap-2">
              <input
                id="github-import-url"
                type="text"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (urlError) setUrlError(null);
                }}
                placeholder="https://github.com/owner/repo"
                className="h-9 min-w-0 flex-1 rounded-lg border border-border/70 bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-foreground/40 focus:outline-none"
                disabled={importingKey !== null}
              />
              <Button
                type="submit"
                size="sm"
                className="h-9 shrink-0 px-3 text-xs font-medium"
                disabled={!urlInput.trim() || importingKey !== null}
              >
                {importingKey?.startsWith("url:") ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Import"
                )}
              </Button>
            </div>
            {urlError ? (
              <p className="text-xs text-destructive">{urlError}</p>
            ) : null}
          </form>

          {/* Select a Repository */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                Select a repository
              </span>
              {activeInstallation?.installationUrl ? (
                <Link
                  href={activeInstallation.installationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-muted-foreground transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-foreground"
                >
                  <span>Manage access</span>
                  <ExternalLink className="h-3 w-3" strokeWidth={1.5} />
                </Link>
              ) : null}
            </div>

            {!hasGitHub || reconnectRequired ? (
              <div className="flex flex-col items-start gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  {reconnectRequired
                    ? "GitHub access expired. Reconnect to browse your repositories."
                    : "Connect GitHub to browse your repositories."}
                </p>
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link href={reconnectHref}>
                    {reconnectRequired ? "Reconnect GitHub" : "Connect GitHub"}
                  </Link>
                </Button>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {installations.length > 1 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 px-2.5 text-xs font-normal"
                        >
                          <span className="max-w-[110px] truncate">
                            {activeInstallation?.accountLogin ?? "Account"}
                          </span>
                          <ChevronDown
                            className="h-3.5 w-3.5 text-muted-foreground"
                            strokeWidth={1.5}
                          />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-48">
                        {installations.map((inst) => (
                          <DropdownMenuItem
                            key={inst.installationId}
                            onClick={() =>
                              setSelectedInstallationId(inst.installationId)
                            }
                            className="text-xs"
                          >
                            {inst.accountLogin}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}

                  <div className="flex h-8 min-w-0 flex-1 items-center rounded-lg border border-border/70 bg-background px-2.5">
                    <Search
                      className="mr-1.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search repos"
                      className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRefresh}
                    disabled={isRefreshing || reposLoading}
                    className="h-8 shrink-0 gap-1.5 px-2.5 text-xs font-normal"
                    aria-label="Refresh repositories"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                      strokeWidth={1.5}
                    />
                    <span className="hidden sm:inline">Refresh</span>
                  </Button>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-xl border border-border/70 divide-y divide-border/50 bg-background/50">
                  {installationsLoading || reposLoading ? (
                    <div className="space-y-2 p-3">
                      {Array.from({ length: 4 }).map((_, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between gap-2 py-1"
                        >
                          <div className="h-4 w-40 rounded bg-muted/60" />
                          <div className="h-7 w-14 rounded bg-muted/50" />
                        </div>
                      ))}
                    </div>
                  ) : repos.length === 0 ? (
                    <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                      {searchQuery
                        ? "No matching repositories"
                        : "No repositories found"}
                    </div>
                  ) : (
                    repos.map((repo) => {
                      const [
                        owner = activeInstallation?.accountLogin ?? "",
                        name = repo.name,
                      ] = repo.full_name.split("/");
                      const rowKey = repo.full_name;
                      const isRowImporting = importingKey === rowKey;
                      return (
                        <div
                          key={rowKey}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-muted/40"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <FolderGit2
                              className="h-4 w-4 shrink-0 text-muted-foreground"
                              strokeWidth={1.5}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-xs font-medium text-foreground">
                                  {repo.name}
                                </span>
                                {repo.private ? (
                                  <Lock
                                    className="h-3 w-3 shrink-0 text-muted-foreground"
                                    strokeWidth={1.5}
                                  />
                                ) : null}
                              </div>
                              {repo.updated_at ? (
                                <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
                                  {formatRelativeTime(repo.updated_at)}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={importingKey !== null}
                            onClick={() => handleImport(owner, name, rowKey)}
                            className="h-7 shrink-0 px-2.5 text-xs font-medium"
                          >
                            {isRowImporting ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              "Import"
                            )}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
