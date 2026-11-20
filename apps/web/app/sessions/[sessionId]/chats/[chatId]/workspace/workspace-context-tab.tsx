"use client";

import { formatTokens } from "@entry-agents/shared";
import { Gauge } from "lucide-react";
import { useMemo } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import { extractCachedInputTokens } from "@/lib/chat/usage-extract";
import type { ModelOption } from "@/lib/model-options";
import { DEFAULT_CONTEXT_LIMIT, estimateModelUsageCost } from "@/lib/models";

interface WorkspaceContextTabProps {
  messages: WebAgentUIMessage[];
  modelId: string;
  modelOptions: ModelOption[];
}

const R = 52;
const STROKE = 11;
const C = 2 * Math.PI * R;

const STEPS = [
  "var(--ink)",
  "color-mix(in oklch, var(--ink) 68%, transparent)",
  "color-mix(in oklch, var(--ink) 40%, transparent)",
] as const;

interface ContextBreakdown {
  latestUncached: number;
  latestCached: number;
  latestOutput: number;
  latestTotal: number;
  totalInput: number;
  totalCached: number;
  totalOutput: number;
  turns: number;
  costUsd: number | undefined;
  activeModelId: string;
  limit: number;
}

function useContextBreakdown(
  messages: WebAgentUIMessage[],
  modelId: string,
  modelOptions: ModelOption[],
): ContextBreakdown {
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
      <div className="rail-empty">
        <Gauge size={22} strokeWidth={1.3} aria-hidden="true" />
        <p>Context window usage appears after the first assistant turn.</p>
      </div>
    );
  }

  const pct = data.limit > 0 ? Math.min(1, data.latestTotal / data.limit) : 0;
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
      <div className="rail-scroll">
        <div className="cx-wrap">
          <div className="cx-ring">
            <Ring segments={segments} limit={data.limit} />
            <div className="cx-center">
              <div className="cx-pct">{Math.round(pct * 100)}%</div>
              <div className="cx-sub">of {formatTokens(data.limit)}</div>
            </div>
          </div>

          <ul className="cx-legend">
            {segments.map((s) => (
              <li key={s.key}>
                <span className="cx-dot" style={{ background: s.color }} />
                <span>{s.label}</span>
                <span className="cx-val">{formatTokens(s.value)}</span>
              </li>
            ))}
            <li>
              <span
                className="cx-dot"
                style={{
                  background: "var(--surface-2)",
                  boxShadow: "inset 0 0 0 1px var(--line)",
                }}
              />
              <span>Free</span>
              <span className="cx-val">{formatTokens(free)}</span>
            </li>
          </ul>

          <div className="cx-section">
            <div className="cx-h">This session</div>
            <dl className="cx-stats">
              <div>
                <dt>Turns</dt>
                <dd>{data.turns}</dd>
              </div>
              <div>
                <dt>Total in</dt>
                <dd>{formatTokens(data.totalInput)}</dd>
              </div>
              <div>
                <dt>Cached</dt>
                <dd>{formatTokens(data.totalCached)}</dd>
              </div>
              <div>
                <dt>Total out</dt>
                <dd>{formatTokens(data.totalOutput)}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{costLabel}</dd>
              </div>
              <div>
                <dt>Model</dt>
                <dd title={data.activeModelId}>{activeLabel}</dd>
              </div>
            </dl>
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
    <svg viewBox="0 0 130 130" width="130" height="130" aria-hidden="true">
      <circle
        cx="65"
        cy="65"
        r={R}
        fill="none"
        stroke="var(--surface-2)"
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
