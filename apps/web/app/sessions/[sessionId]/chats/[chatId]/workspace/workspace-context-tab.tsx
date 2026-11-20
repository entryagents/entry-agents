"use client";

import { formatTokens } from "@entry-agents/shared";
import { Gauge } from "lucide-react";
import { type CSSProperties, useMemo } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { extractCachedInputTokens } from "@/lib/chat/usage-extract";
import type { ModelOption } from "@/lib/model-options";
import { DEFAULT_CONTEXT_LIMIT, estimateModelUsageCost } from "@/lib/models";

interface WorkspaceContextTabProps {
  messages: WebAgentUIMessage[];
  modelId: string;
  modelOptions: ModelOption[];
}

const R = 50;
const STROKE = 14;
const C = 2 * Math.PI * R;

const STEPS = [
  "var(--text)",
  "var(--text-2)",
  "var(--text-3)",
  "color-mix(in oklab, var(--text-3) 55%, transparent)",
] as const;

function useContextBreakdown(
  messages: WebAgentUIMessage[],
  modelId: string,
  modelOptions: ModelOption[],
) {
  return useMemo(() => {
    let latestUncached = 0;
    let latestCached = 0;
    let latestOutput = 0;
    let latestTotal = 0;

    let totalInput = 0;
    let totalCached = 0;
    let totalOutput = 0;
    let totalCost = 0;
    let hasAnyCost = false;
    let turns = 0;
    let activeModelId = modelId;

    for (const msg of messages) {
      if (msg.role === "user") {
        turns += 1;
        continue;
      }
      if (msg.role !== "assistant") continue;

      const meta = msg.metadata;
      if (!meta) continue;
      if (meta.modelId) {
        activeModelId = meta.modelId;
      }

      const lastUsage = meta.lastStepUsage;
      if (lastUsage) {
        const inp = lastUsage.inputTokens ?? 0;
        const cached = extractCachedInputTokens(lastUsage);
        const out = lastUsage.outputTokens ?? 0;
        latestCached = Math.min(cached, inp);
        latestUncached = Math.max(0, inp - latestCached);
        latestOutput = out;
        latestTotal = inp + out;
      }

      const msgUsage = meta.totalMessageUsage ?? meta.lastStepUsage;
      if (msgUsage) {
        const inp = msgUsage.inputTokens ?? 0;
        const cached = extractCachedInputTokens(msgUsage);
        const out = msgUsage.outputTokens ?? 0;
        totalInput += inp;
        totalCached += cached;
        totalOutput += out;

        if (typeof meta.totalMessageCost === "number") {
          totalCost += meta.totalMessageCost;
          hasAnyCost = true;
        } else {
          const msgModel = meta.modelId ?? modelId;
          const costSpec = modelOptions.find((m) => m.id === msgModel)?.cost;
          const est = estimateModelUsageCost(
            {
              inputTokens: inp,
              cachedInputTokens: cached,
              outputTokens: out,
            },
            costSpec,
          );
          if (typeof est === "number") {
            totalCost += est;
            hasAnyCost = true;
          }
        }
      }
    }

    const activeOption = modelOptions.find((m) => m.id === activeModelId);
    const limit = activeOption?.contextWindow ?? DEFAULT_CONTEXT_LIMIT;

    return {
      latestUncached,
      latestCached,
      latestOutput,
      latestTotal,
      totalInput,
      totalCached,
      totalOutput,
      turns,
      costUsd: hasAnyCost ? totalCost : undefined,
      activeModelId,
      limit,
    };
  }, [messages, modelId, modelOptions]);
}

export function WorkspaceContextTab({
  messages,
  modelId,
  modelOptions,
}: WorkspaceContextTabProps) {
  const data = useContextBreakdown(messages, modelId, modelOptions);

  if (data.latestTotal === 0 && data.totalInput === 0) {
    return (
      <div className="rail-col">
        <div className="rail-bar">
          <span className="rail-bar-title">Context</span>
        </div>
        <div className="rail-empty">
          <Gauge size={22} strokeWidth={1.3} aria-hidden="true" />
          <p className="rail-empty-title">No context usage yet</p>
          <p>
            Context window breakdown appears after the first assistant turn.
          </p>
        </div>
      </div>
    );
  }

  const pct = data.limit > 0 ? Math.min(1, data.latestTotal / data.limit) : 0;
  const pctRounded = Math.round(pct * 100);
  const free = Math.max(0, data.limit - data.latestTotal);

  const segments = [
    {
      key: "input",
      label: "Input",
      value: data.latestUncached,
      color: STEPS[0],
    },
    {
      key: "cached",
      label: "Cached",
      value: data.latestCached,
      color: STEPS[1],
    },
    {
      key: "output",
      label: "Output",
      value: data.latestOutput,
      color: STEPS[2],
    },
  ];

  const costLabel =
    data.costUsd === undefined
      ? "—"
      : data.costUsd < 0.01
        ? `$${data.costUsd.toFixed(4)}`
        : `$${data.costUsd.toFixed(2)}`;

  const activeLabel =
    modelOptions.find((m) => m.id === data.activeModelId)?.shortLabel ??
    data.activeModelId;

  return (
    <div className="rail-col">
      <div className="rail-bar">
        <span className="rail-bar-title">Context</span>
        <span className="rail-bar-meta ml-auto">{pctRounded}% used</span>
      </div>
      <div className="rail-scroll">
        <div className="rail-stack cx-stack">
          <div className="sable-card cx-card">
            <div className="cx-figure">
              <div className="cx-ring">
                <Ring segments={segments} limit={data.limit} />
              </div>
              <div className="cx-numbers">
                <div
                  className="cx-pct"
                  data-warn={pctRounded >= 80 ? "" : undefined}
                >
                  {pctRounded}
                  <span className="cx-pct-sign">%</span>
                </div>
                <div className="cx-of">
                  {formatTokens(data.latestTotal)} / {formatTokens(data.limit)}
                </div>
                <div className="cx-left">{formatTokens(free)} remaining</div>
              </div>
            </div>

            <div className="cx-legend">
              {segments.map((s) => {
                const share =
                  data.limit > 0 ? Math.round((s.value / data.limit) * 100) : 0;
                return (
                  <div key={s.key} className="cx-row">
                    <span
                      className="cx-swatch"
                      style={{ "--c": s.color } as CSSProperties}
                    />
                    <span className="cx-name">{s.label}</span>
                    <span className="cx-tokens">{formatTokens(s.value)}</span>
                    <span className="cx-share">{share}%</span>
                  </div>
                );
              })}
              <div className="cx-row cx-row-quiet">
                <span className="cx-swatch cx-swatch-free" />
                <span className="cx-name">Free</span>
                <span className="cx-tokens">{formatTokens(free)}</span>
                <span className="cx-share">
                  {Math.max(0, 100 - pctRounded)}%
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="rail-h">This session</div>
            <div className="cx-stats">
              <div className="sable-card cx-stat">
                <span className="cx-stat-value">{data.turns}</span>
                <span className="cx-stat-label">Turns</span>
              </div>
              <div className="sable-card cx-stat">
                <span className="cx-stat-value">
                  {formatTokens(data.totalInput)}
                </span>
                <span className="cx-stat-label">Total in</span>
              </div>
              <div className="sable-card cx-stat">
                <span className="cx-stat-value">
                  {formatTokens(data.totalOutput)}
                </span>
                <span className="cx-stat-label">Total out</span>
              </div>
              <div className="sable-card cx-stat" data-wide="">
                <span className="cx-stat-value">
                  {formatTokens(data.totalCached)}
                </span>
                <span className="cx-stat-label">Cached input</span>
              </div>
              <div className="sable-card cx-stat" data-wide="">
                <span className="cx-stat-value">{costLabel}</span>
                <span className="cx-stat-label">Est. cost</span>
              </div>
              {activeLabel ? (
                <div className="sable-card cx-stat col-span-6">
                  <span
                    className="cx-stat-value truncate"
                    title={data.activeModelId}
                  >
                    {activeLabel}
                  </span>
                  <span className="cx-stat-label">Active model</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ring({
  segments,
  limit,
}: {
  segments: Array<{ key: string; value: number; color: string }>;
  limit: number;
}) {
  let offset = 0;

  return (
    <svg viewBox="0 0 130 130" width="116" height="116" aria-hidden="true">
      <circle
        cx="65"
        cy="65"
        r={R}
        fill="none"
        stroke="var(--ring-track)"
        strokeWidth={STROKE}
      />
      <g transform="rotate(-90 65 65)">
        {segments.map((seg) => {
          if (seg.value <= 0 || limit <= 0) return null;
          const frac = Math.min(1, seg.value / limit);
          const len = frac * C;
          const dashOffset = -offset;
          offset += len;
          return (
            <circle
              key={seg.key}
              className="cx-arc"
              cx="65"
              cy="65"
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE}
              strokeDasharray={`${len} ${C}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="butt"
            />
          );
        })}
      </g>
    </svg>
  );
}
