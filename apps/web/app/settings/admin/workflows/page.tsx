"use client";

import { useState } from "react";
import { AdminWorkflowSection } from "../components/admin-workflow-section";

const WINDOWS = [
  { id: "24h", label: "24 hours" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
] as const;

export default function AdminWorkflowsPage() {
  const [windowParam, setWindowParam] = useState<"24h" | "7d" | "30d">("7d");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">
            Workflow telemetry
          </h1>
          <p className="text-xs text-muted-foreground">
            Track Vercel Workflow step invocations, estimated events, retries,
            and highest-volume runs.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/20 p-1">
          {WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWindowParam(w.id)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                windowParam === w.id
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <AdminWorkflowSection windowParam={windowParam} />
    </div>
  );
}
