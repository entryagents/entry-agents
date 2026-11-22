"use client";

import { Terminal } from "lucide-react";
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
    <div className="sable-detail-stack">
      <div className="sable-detail-fields">
        {skillName && (
          <div className="sable-detail-field">
            <span className="sable-detail-label">Skill</span>
            <span className="sable-detail-value sable-detail-mono">
              /{skillName}
            </span>
          </div>
        )}
        {rawArgs && (
          <div className="sable-detail-field">
            <span className="sable-detail-label">Args</span>
            <span className="sable-detail-value sable-detail-mono">
              {rawArgs}
            </span>
          </div>
        )}
      </div>
      {skillDescription && (
        <div className="sable-detail-quiet">{skillDescription}</div>
      )}
      {loadedContent ? (
        <div className="sable-term">
          <div className="sable-term-out">
            <pre>
              {loadedContent.slice(0, 1400)}
              {loadedContent.length > 1400 ? "\n\n… (truncated preview)" : ""}
            </pre>
          </div>
        </div>
      ) : (
        <div className="sable-detail-quiet">
          {state.running ? "Loading the skill" : "No output"}
        </div>
      )}
    </div>
  ) : undefined;

  return (
    <ToolLayout
      name="Skill"
      icon={
        <Terminal
          className="size-3.5 text-muted-foreground"
          strokeWidth={1.5}
        />
      }
      summary={
        skillName
          ? `/${skillName}${rawArgs ? ` · ${rawArgs}` : ""}`
          : "Loading skill..."
      }
      summaryClassName="font-mono text-muted-foreground"
      state={mergedState}
      nameClassName={mergedState.error ? "text-red-500" : undefined}
      expandedContent={expandedContent}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
