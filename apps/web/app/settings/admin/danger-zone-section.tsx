"use client";

import { AlertTriangle, Boxes, Loader2, RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  revokeAllGitHubTokens,
  revokeAllVercelTokens,
} from "@/lib/admin/actions";

export function DangerZoneSection() {
  const [targetAction, setTargetAction] = useState<
    "github" | "vercel" | "sandboxes" | "reconcile" | null
  >(null);
  const [isExecuting, setIsExecuting] = useState(false);

  async function handleConfirm() {
    if (!targetAction) return;
    setIsExecuting(true);

    try {
      if (targetAction === "github") {
        const result = await revokeAllGitHubTokens();
        if (result.success) {
          toast.success("All GitHub tokens revoked", {
            description: `Revoked ${result.revokedTokens ?? 0} tokens at GitHub, deleted ${result.deletedAccounts ?? 0} account links and ${result.deletedInstallations ?? 0} installations.`,
          });
        } else {
          toast.error(result.error ?? "Failed to revoke tokens");
        }
      } else if (targetAction === "vercel") {
        const result = await revokeAllVercelTokens();
        if (result.success) {
          toast.success("All Vercel tokens revoked", {
            description: `Revoked ${result.revokedTokens ?? 0} tokens at Vercel, deleted ${result.deletedAccounts ?? 0} account links and ${result.deletedSessions ?? 0} sessions.`,
          });
          setTimeout(() => {
            window.location.href = "/";
          }, 1500);
        } else {
          toast.error(result.error ?? "Failed to revoke tokens");
        }
      } else if (targetAction === "sandboxes") {
        const res = await fetch("/api/admin/sandboxes", { method: "DELETE" });
        const data = await res.json();
        if (res.ok && data.success) {
          toast.success("All Boxd Sandboxes Purged", {
            description: `Successfully deleted ${data.deletedCount ?? 0} machines. Capacity restored.`,
          });
        } else {
          toast.error("Failed to purge sandboxes", {
            description: data.error || "Unknown error occurred",
          });
        }
      } else if (targetAction === "reconcile") {
        const res = await fetch("/api/admin/reconcile-runs", { method: "POST" });
        const data = await res.json();
        if (res.ok && data.success) {
          toast.success("Database Reconciled", {
            description: `Reset ${data.fixedChatsCount ?? 0} stale chats, ${data.fixedSessionsCount ?? 0} running sessions, cleared ${data.clearedLocksCount ?? 0} locks.`,
          });
        } else {
          toast.error("Failed to reconcile runs", {
            description: data.error || "Unknown error occurred",
          });
        }
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsExecuting(false);
      setTargetAction(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Maintenance & Telemetry Recovery */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="size-4 text-primary" />
            Infrastructure Maintenance
          </CardTitle>
          <CardDescription>
            Reconcile runtime locks, clean stuck agent runs, and purge sandboxes to free server capacity.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border border-t border-border">
            {/* Purge Boxd Sandboxes */}
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <div>
                <p className="text-sm font-medium">Purge All Active Boxd Sandboxes</p>
                <p className="text-xs text-muted-foreground">
                  Terminate all machines across Boxd cloud. Frees up machine slots against the 50-sandbox account limit.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                onClick={() => setTargetAction("sandboxes")}
              >
                <Trash2 className="mr-1.5 size-3.5" />
                Purge Sandboxes
              </Button>
            </div>

            {/* Reconcile Stale Runs */}
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <div>
                <p className="text-sm font-medium">Reconcile Stale Agent Runs &amp; Locks</p>
                <p className="text-xs text-muted-foreground">
                  Resets chats stuck in queued/running with dead streams to idle, cleans user billing locks, and completes idle sessions.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setTargetAction("reconcile")}
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                Reconcile Runs
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Destructive Actions */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="size-4" />
            Destructive Token Actions
          </CardTitle>
          <CardDescription className="text-destructive/70">
            These actions cannot be undone, proceed with caution.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-destructive/20 border-t border-destructive/20">
            {/* Revoke Vercel tokens */}
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <p className="text-sm text-destructive/80">
                Invalidate all user sessions by revoking all Vercel tokens.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setTargetAction("vercel")}
              >
                Revoke
              </Button>
            </div>

            {/* Revoke GitHub tokens */}
            <div className="flex items-center justify-between gap-4 px-6 py-4">
              <p className="text-sm text-destructive/80">
                Force all users to reconnect GitHub by revoking all GitHub
                tokens and installations.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setTargetAction("github")}
              >
                Revoke
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation dialog */}
      <Dialog
        open={targetAction !== null}
        onOpenChange={(open) => {
          if (!open) setTargetAction(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-destructive" />
              {targetAction === "github"
                ? "Revoke all GitHub tokens?"
                : targetAction === "vercel"
                  ? "Revoke all Vercel tokens?"
                  : targetAction === "sandboxes"
                    ? "Purge all Boxd Sandboxes?"
                    : "Reconcile Stale Runs & Locks?"}
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <span className="block">
                {targetAction === "github"
                  ? "This will delete all GitHub account links and app installations for every user. All users will need to reconnect their GitHub account."
                  : targetAction === "vercel"
                    ? "This will delete all Vercel account links and invalidate every active session. All users — including you — will be logged out immediately."
                    : targetAction === "sandboxes"
                      ? "This will immediately terminate and delete every VM machine created on Boxd. Any active terminals will disconnect, freeing up the 50-machine capacity."
                      : "This will scan the database for chats frozen in active states whose streams died, reset them to idle, clear billing run locks, and mark completed sessions."}
              </span>
              {targetAction === "vercel" && (
                <span className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  You will be signed out and redirected to login after this action completes.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={isExecuting}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant={targetAction === "reconcile" ? "default" : "destructive"}
              onClick={handleConfirm}
              disabled={isExecuting}
            >
              {isExecuting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isExecuting
                ? "Executing…"
                : targetAction === "reconcile"
                  ? "Reconcile Now"
                  : "Confirm & Execute"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
