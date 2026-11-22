"use client";

import { ExternalLink, Globe } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

export function FetchRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-web_fetch">) {
  const input = part.input;
  const url = input?.url ?? "...";
  const method = input?.method ?? "GET";

  const output = part.state === "output-available" ? part.output : undefined;
  const status = output?.success === true ? output.status : undefined;
  const body =
    output?.success === true && typeof output.body === "string"
      ? output.body
      : undefined;
  const outputError =
    output?.success === false ? (output.error ?? "Fetch failed") : undefined;

  const mergedState = outputError
    ? { ...state, error: state.error ?? outputError }
    : state;

  const displayUrl = url.length > 60 ? `${url.slice(0, 57)}...` : url;
  const summary = method === "GET" ? displayUrl : `${method} ${displayUrl}`;
  const meta = status !== undefined ? `${status}` : undefined;

  const hasUrl = url !== "..." && /^https?:\/\//i.test(url);
  const expandedContent =
    hasUrl || body ? (
      <div className="sable-detail-stack">
        {hasUrl && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="sable-link-row"
          >
            <Globe className="size-3.5 shrink-0" strokeWidth={1.5} />
            <span className="min-w-0 flex-1 truncate">{url}</span>
            <ExternalLink className="sable-link-out size-3" strokeWidth={1.5} />
          </a>
        )}
        {body && (
          <div className="sable-term">
            <div className="sable-term-out">
              <pre>
                {body.length > 4000
                  ? `${body.slice(0, 4000)}\n… (truncated)`
                  : body}
              </pre>
            </div>
          </div>
        )}
      </div>
    ) : undefined;

  return (
    <ToolLayout
      name="Fetch"
      icon={<Globe className="h-3.5 w-3.5" />}
      summary={summary}
      summaryClassName="font-mono"
      meta={meta}
      state={mergedState}
      expandedContent={expandedContent}
      onApprove={onApprove}
      onDeny={onDeny}
    />
  );
}
