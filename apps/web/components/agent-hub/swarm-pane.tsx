"use client";

import {
  GitBranch,
  MessageSquare,
  ShieldCheck,
  Users,
  Workflow,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type SwarmTab = "board" | "members" | "graph";

export interface SwarmMember {
  id: string;
  name: string;
  role: "coordinator" | "worker" | "verifier";
  model: string;
  status: "running" | "idle" | "verifying" | "done";
  worktree?: string;
}

export interface SwarmBoardPost {
  id: string;
  author: string;
  role: SwarmMember["role"];
  timestamp: string;
  content: string;
  mentions?: string[];
}

export interface SwarmGraphWave {
  wave: number;
  label: string;
  status: "done" | "running" | "queued";
  agents: string[];
}

interface SwarmPaneProps {
  members: SwarmMember[];
  posts: SwarmBoardPost[];
  waves: SwarmGraphWave[];
  onSelectMember?: (memberId: string) => void;
  className?: string;
}

const ROLE_BADGE: Record<SwarmMember["role"], string> = {
  coordinator: "text-amber-600 dark:text-amber-400",
  worker: "text-sky-600 dark:text-sky-400",
  verifier: "text-emerald-600 dark:text-emerald-400",
};

const STATUS_DOT: Record<SwarmMember["status"], string> = {
  running: "bg-sky-500",
  verifying: "bg-amber-500",
  done: "bg-emerald-500",
  idle: "bg-muted-foreground/40",
};

export function SwarmPane({
  members,
  posts,
  waves,
  onSelectMember,
  className,
}: SwarmPaneProps) {
  const [tab, setTab] = useState<SwarmTab>("board");
  const [selectedWave, setSelectedWave] = useState<number>(
    waves.find((w) => w.status === "running")?.wave ??
      waves[waves.length - 1]?.wave ??
      1,
  );

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-l border-border bg-background text-foreground",
        className,
      )}
    >
      {/* Dense 36px tab header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-border px-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setTab("board")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
              tab === "board"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MessageSquare className="size-3.5" strokeWidth={1.5} />
            <span>Board</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {posts.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("members")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
              tab === "members"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="size-3.5" strokeWidth={1.5} />
            <span>Members</span>
            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
              {members.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setTab("graph")}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
              tab === "graph"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Workflow className="size-3.5" strokeWidth={1.5} />
            <span>Graph</span>
          </button>
        </div>

        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          /swarm
        </span>
      </div>

      {/* Dense content area */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "board" ? (
          <div className="divide-y divide-border">
            {posts.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">
                Shared swarm board is ready. Agents post trade-offs, diffs, and
                @mentions here.
              </p>
            ) : (
              posts.map((post) => (
                <div key={post.id} className="px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "font-mono text-xs font-medium",
                          ROLE_BADGE[post.role],
                        )}
                      >
                        @{post.author}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {post.role}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {post.timestamp}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/90">
                    {post.content}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "members" ? (
          <div className="divide-y divide-border">
            {members.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => onSelectMember?.(member.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      STATUS_DOT[member.status],
                    )}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs font-medium text-foreground">
                        {member.name}
                      </span>
                      {member.role === "verifier" ? (
                        <ShieldCheck
                          className="size-3.5 shrink-0 text-emerald-500"
                          strokeWidth={1.5}
                        />
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{member.role}</span>
                      {member.worktree ? (
                        <span className="inline-flex items-center gap-0.5 truncate font-mono">
                          <GitBranch className="size-3" strokeWidth={1.5} />
                          {member.worktree}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <span className="shrink-0 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {member.model}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {tab === "graph" ? (
          <div className="space-y-3 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Wave execution timeline</span>
              <span className="font-mono tabular-nums">
                Wave {selectedWave}/{waves.length || 1}
              </span>
            </div>
            <div className="space-y-1.5">
              {waves.map((wave) => (
                <button
                  key={wave.wave}
                  type="button"
                  onClick={() => setSelectedWave(wave.wave)}
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition-colors",
                    selectedWave === wave.wave
                      ? "border-foreground/30 bg-muted/60"
                      : "border-border bg-background hover:bg-muted/30",
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-mono font-medium text-foreground">
                      Wave {wave.wave}: {wave.label}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {wave.agents.join(" · ")}
                    </div>
                  </div>
                  <span className="ml-2 shrink-0 font-mono text-[11px] text-muted-foreground">
                    {wave.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
