"use client";

import { Sparkles } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

function getDisplayString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function SkillRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-skill">) {
  const input = part.input;
  const skillName = getDisplayString(input?.skill)?.replace(/^\//, "");
  const rawArgs = getDisplayString(input?.args);

  const output = part.state === "output-available" ? part.output : undefined;
  const outputRecord =
    output && typeof output === "object"
      ? (output as Record<string, unknown>)
      : undefined;
  const outputError =
    output?.success === false ? (output?.error ?? "Skill failed") : undefined;
  const skillDescription = getDisplayString(outputRecord?.skillDescription);
  const loadedContent = getDisplayString(outputRecord?.content);

  const mergedState = outputError
    ? { ...state, error: state.error ?? outputError }
    : state;

  const hasExpandedDetails = Boolean(
    rawArgs || skillDescription || loadedContent,
  );

  const expandedContent = hasExpandedDetails ? (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/40 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            /{skillName ?? "skill"}
          </span>
          {output?.success && (
            <span className="font-mono text-[10px] text-muted-foreground">
              SKILL.md loaded into context
            </span>
          )}
        </div>
      </div>
      {skillDescription && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {skillDescription}
        </p>
      )}
      {rawArgs && (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">
            Arguments
          </p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded border border-border bg-background/80 p-2 font-mono text-[11px] leading-relaxed text-foreground">
            {rawArgs}
          </pre>
        </div>
      )}
      {loadedContent && (
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">
            Skill Instructions Preview
          </p>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded border border-border bg-background/80 p-2.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {loadedContent.slice(0, 1400)}
            {loadedContent.length > 1400 ? "\n\n… (truncated preview)" : ""}
          </pre>
        </div>
      )}
    </div>
  ) : undefined;

  return (
    <ToolLayout
      name="Invoked Skill"
      icon={<Sparkles className="h-3.5 w-3.5 text-emerald-500" />}
      summary={
        skillName
          ? `/${skillName}${rawArgs ? ` · ${rawArgs}` : ""}`
          : "Loading skill..."
      }
      summaryClassName="font-mono text-emerald-600 dark:text-emerald-400"
      state={mergedState}
      nameClassName={mergedState.error ? "text-red-500" : undefined}
      expandedContent={expandedContent}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
