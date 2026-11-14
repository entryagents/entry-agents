"use client";

import { useEffect, useState } from "react";
import {
  MessageSquare,
  Activity,
  Bot,
  RefreshCw,
  Trash2,
  CheckCircle2,
  ExternalLink,
  Search,
  Box,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface ChatMetricData {
  metrics: {
    totalChats: number;
    activeChats: number;
    totalMessages: number;
    totalRuns: number;
  };
  recentChats: Array<{
    id: string;
    sessionId: string;
    title: string;
    status: string;
    modelId: string | null;
    activeStreamId: string | null;
    createdAt: string;
    updatedAt: string;
    sessionTitle: string | null;
    userId: string | null;
    userEmail: string | null;
    userName: string | null;
  }>;
}

interface SandboxInfo {
  count: number;
  limit: number;
}

export default function AdminChatsPage() {
  const [data, setData] = useState<ChatMetricData | null>(null);
  const [sandboxes, setSandboxes] = useState<SandboxInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isPurgingSandboxes, setIsPurgingSandboxes] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [chatRes, sandboxRes] = await Promise.all([
        fetch("/api/admin/chats"),
        fetch("/api/admin/sandboxes"),
      ]);

      if (chatRes.ok) {
        const json = await chatRes.json();
        setData(json);
      }
      if (sandboxRes.ok) {
        const sJson = await sandboxRes.json();
        setSandboxes({ count: sJson.count ?? 0, limit: sJson.limit ?? 50 });
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load chat metrics");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePurgeSandboxes = async () => {
    setIsPurgingSandboxes(true);
    try {
      const res = await fetch("/api/admin/sandboxes", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message ?? "All Boxd sandboxes purged successfully");
        fetchData();
      } else {
        toast.error(json.error ?? "Failed to purge sandboxes");
      }
    } catch {
      toast.error("Failed to purge sandboxes");
    } finally {
      setIsPurgingSandboxes(false);
    }
  };

  const handleReconcileRuns = async () => {
    setIsReconciling(true);
    try {
      const res = await fetch("/api/admin/reconcile-runs", { method: "POST" });
      const json = await res.json();
      if (res.ok) {
        toast.success(json.message ?? "All runs reconciled");
        fetchData();
      } else {
        toast.error(json.error ?? "Failed to reconcile runs");
      }
    } catch {
      toast.error("Failed to reconcile runs");
    } finally {
      setIsReconciling(false);
    }
  };

  const filteredChats =
    data?.recentChats.filter((c) => {
      const q = search.toLowerCase();
      return (
        c.title.toLowerCase().includes(q) ||
        (c.userEmail && c.userEmail.toLowerCase().includes(q)) ||
        (c.modelId && c.modelId.toLowerCase().includes(q)) ||
        c.status.toLowerCase().includes(q)
      );
    }) ?? [];

  return (
    <div className="space-y-6">
      {/* Top Action & Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Total chats
            </span>
            <MessageSquare
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
            />
          </div>
          <div className="mt-2 font-mono text-2xl font-medium tabular-nums">
            {data?.metrics.totalChats.toLocaleString() ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Conversations across all sessions
          </p>
        </Card>

        <Card className="bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Active turns
            </span>
            <Activity
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
            />
          </div>
          <div className="mt-2 font-mono text-2xl font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
            {data?.metrics.activeChats ?? 0}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            In-flight streaming and queued runs
          </p>
        </Card>

        <Card className="bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Messages persisted
            </span>
            <Bot className="size-4 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <div className="mt-2 font-mono text-2xl font-medium tabular-nums">
            {data?.metrics.totalMessages.toLocaleString() ?? "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Sanitized user and assistant turns
          </p>
        </Card>

        <Card className="bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Boxd sandboxes
            </span>
            <Box className="size-4 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <div className="mt-2 font-mono text-2xl font-medium tabular-nums">
            {sandboxes ? `${sandboxes.count} / ${sandboxes.limit}` : "—"}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Allocated VM capacity
          </p>
        </Card>
      </div>

      {/* Control Actions Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Agent operations and capacity recovery</span>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchData}
              disabled={isLoading}
            >
              <RefreshCw
                className={`mr-1.5 size-3.5 ${isLoading ? "animate-spin" : ""}`}
                strokeWidth={1.5}
              />
              Refresh
            </Button>
          </CardTitle>
          <CardDescription>
            Purge sandboxes and reconcile hung runs across the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={handlePurgeSandboxes}
              disabled={isPurgingSandboxes}
              className="cursor-pointer"
            >
              <Trash2 className="mr-1.5 size-3.5" strokeWidth={1.5} />
              {isPurgingSandboxes
                ? "Purging sandboxes..."
                : "Purge all Boxd sandboxes (reset to 0/50)"}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleReconcileRuns}
              disabled={isReconciling}
              className="cursor-pointer"
            >
              <CheckCircle2 className="mr-1.5 size-3.5" strokeWidth={1.5} />
              {isReconciling
                ? "Reconciling runs..."
                : "Reconcile stale runs to idle"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Recent Chats Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <CardTitle className="text-base">
                Recent chats &amp; assistant runs
              </CardTitle>
              <CardDescription>
                Latest 50 conversations and their run states.
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search user, title, model..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto border-t border-border/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Title &amp; chat ID</th>
                  <th className="px-4 py-2.5">User</th>
                  <th className="px-4 py-2.5">Model</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Updated</th>
                  <th className="px-4 py-2.5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredChats.map((c) => {
                  const isRunActive =
                    ["queued", "running", "sleeping", "resuming"].includes(
                      c.status,
                    ) || Boolean(c.activeStreamId);

                  return (
                    <tr
                      key={c.id}
                      className="transition-colors hover:bg-muted/20"
                    >
                      <td className="max-w-[280px] px-4 py-3">
                        <p className="truncate font-medium text-foreground">
                          {c.title || "Untitled"}
                        </p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {c.id}
                        </p>
                      </td>
                      <td className="max-w-[180px] px-4 py-3">
                        <p className="truncate font-medium text-foreground">
                          {c.userName || "—"}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {c.userEmail || "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                        {c.modelId ?? "default"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            isRunActive
                              ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : c.status === "failed"
                                ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                                : "border-border/70 bg-muted/40 text-muted-foreground"
                          }`}
                        >
                          {isRunActive ? (
                            <span className="size-1.5 rounded-full bg-amber-500" />
                          ) : null}
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(c.updatedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          asChild
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                        >
                          <Link
                            href={`/sessions/${c.sessionId}/chats/${c.id}`}
                            target="_blank"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filteredChats.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No chats found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
