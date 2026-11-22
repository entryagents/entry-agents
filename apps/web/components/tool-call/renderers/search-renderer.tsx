"use client";

import { ExternalLink, Globe, Search } from "lucide-react";
import type { ToolRendererProps } from "@/app/lib/render-tool";
import { ToolLayout } from "../tool-layout";

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function SearchRenderer({
  part,
  state,
  onApprove,
  onDeny,
}: ToolRendererProps<"tool-web_search">) {
  const input = part.input;
  const queries = input?.queries ?? [];
  const summary =
    queries.length > 0 ? queries.join(" • ") : (input?.objective ?? "...");

  const output = part.state === "output-available" ? part.output : undefined;
  const results = output?.success === true ? output.results : undefined;
  const outputError =
    output?.success === false ? (output.error ?? "Search failed") : undefined;

  const mergedState = outputError
    ? { ...state, error: state.error ?? outputError }
    : state;

  const meta =
    results !== undefined
      ? `${results.length} ${results.length === 1 ? "result" : "results"}`
      : undefined;

  const expandedContent =
    results && results.length > 0 ? (
      <div className="sable-detail-stack">
        <ul className="sable-links">
          {results.map((result, i) => (
            <li key={`${result.url}-${i}`}>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="sable-link-row"
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="min-w-0 flex-1 truncate">
                  {result.title || result.url}
                </span>
                <span className="sable-link-host">{hostOf(result.url)}</span>
                <ExternalLink className="sable-link-out h-3 w-3" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    ) : undefined;

  return (
    <ToolLayout
      name="Search"
      icon={<Search className="h-3.5 w-3.5" />}
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
