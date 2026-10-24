"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatDistanceToNow } from "date-fns";
import {
  Inbox,
  Bug,
  Sparkles,
  MessageSquare,
  CheckCircle2,
  Archive,
  RefreshCw,
  Search,
  Mail,
  User,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { fetcher } from "@/lib/swr";

interface FeedbackItem {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  category: "bug" | "feature" | "general";
  sentiment: "love" | "good" | "neutral" | "bad";
  title: string | null;
  message: string;
  status: "new" | "reviewed" | "resolved" | "archived";
  createdAt: string;
}

interface FeedbackApiResponse {
  success: boolean;
  feedback: FeedbackItem[];
  stats: {
    total: number;
    new: number;
    bugs: number;
    features: number;
  };
}

const SENTIMENT_EMOJIS: Record<string, string> = {
  love: "😍",
  good: "👍",
  neutral: "😐",
  bad: "👎",
};

export default function AdminFeedbackPage() {
  const { data, isLoading, mutate } = useSWR<FeedbackApiResponse>(
    "/api/admin/feedback",
    fetcher
  );

  const [activeTab, setActiveTab] = useState<"all" | "new" | "bug" | "feature" | "resolved">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function handleStatusChange(id: string, nextStatus: FeedbackItem["status"]) {
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/admin/feedback/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        toast.success(`Feedback marked as ${nextStatus}`);
        void mutate();
      } else {
        toast.error("Failed to update status");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setUpdatingId(null);
    }
  }

  const items = data?.feedback ?? [];
  const stats = data?.stats ?? { total: 0, new: 0, bugs: 0, features: 0 };

  const filteredItems = items.filter((item) => {
    if (activeTab === "new" && item.status !== "new") return false;
    if (activeTab === "bug" && item.category !== "bug") return false;
    if (activeTab === "feature" && item.category !== "feature") return false;
    if (activeTab === "resolved" && item.status !== "resolved") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchMessage = item.message.toLowerCase().includes(q);
      const matchTitle = (item.title ?? "").toLowerCase().includes(q);
      const matchEmail = (item.userEmail ?? "").toLowerCase().includes(q);
      const matchName = (item.userName ?? "").toLowerCase().includes(q);
      return matchMessage || matchTitle || matchEmail || matchName;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Feedback Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Direct suggestions, bug reports, and sentiment submitted by platform users.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void mutate()}
          disabled={isLoading}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Messages</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Unread / New</p>
              <p className="text-xl font-bold">{stats.new}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-red-500/10 p-2 text-red-500">
              <Bug className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Bug Reports</p>
              <p className="text-xl font-bold">{stats.bugs}</p>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Feature Requests</p>
              <p className="text-xl font-bold">{stats.features}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
        <div className="flex gap-1.5 overflow-x-auto">
          {[
            { id: "all", label: "All Items" },
            { id: "new", label: `New (${stats.new})` },
            { id: "bug", label: `Bugs (${stats.bugs})` },
            { id: "feature", label: `Features (${stats.features})` },
            { id: "resolved", label: "Resolved" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "bg-foreground text-background font-semibold"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search feedback..."
            className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      {/* Feedback Feed */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          <Inbox className="mx-auto h-8 w-8 opacity-40 mb-2" />
          <p className="text-sm font-medium">No feedback items match this filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const isPending = updatingId === item.id;
            return (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-foreground/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl leading-none">
                      {SENTIMENT_EMOJIS[item.sentiment] ?? "💬"}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">
                          {item.title || "User Feedback"}
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            item.category === "bug"
                              ? "border-red-500/30 text-red-500 bg-red-500/10 text-[10px]"
                              : item.category === "feature"
                              ? "border-blue-500/30 text-blue-500 bg-blue-500/10 text-[10px]"
                              : "border-border text-muted-foreground text-[10px]"
                          }
                        >
                          {item.category.toUpperCase()}
                        </Badge>
                        <Badge
                          variant="secondary"
                          className={
                            item.status === "new"
                              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 text-[10px]"
                              : item.status === "resolved"
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px]"
                              : "text-[10px]"
                          }
                        >
                          {item.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {item.userName || "Anonymous"}
                        </span>
                        {item.userEmail && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {item.userEmail}
                          </span>
                        )}
                        <span>• {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status !== "resolved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-emerald-500 hover:bg-emerald-500/10"
                        onClick={() => void handleStatusChange(item.id, "resolved")}
                        disabled={isPending}
                      >
                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                        Resolve
                      </Button>
                    )}
                    {item.status !== "archived" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => void handleStatusChange(item.id, "archived")}
                        disabled={isPending}
                      >
                        <Archive className="mr-1 h-3.5 w-3.5" />
                        Archive
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-lg bg-muted/40 p-3 text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                  {item.message}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
