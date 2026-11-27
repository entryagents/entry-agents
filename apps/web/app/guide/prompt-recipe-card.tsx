"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

interface PromptRecipeCardProps {
  readonly index: string;
  readonly title: string;
  readonly whenToUse: string;
  readonly prompt: string;
}

export function PromptRecipeCard({
  index,
  title,
  whenToUse,
  prompt,
}: PromptRecipeCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="overflow-hidden rounded-xl border border-(--l-border) bg-(--l-surface)">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-(--l-border) px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2.5">
            <span className="font-mono text-xs tabular-nums text-(--l-accent)">
              {index}
            </span>
            <h3 className="text-sm font-semibold tracking-tight text-(--l-fg)">
              {title}
            </h3>
          </div>
          <p className="mt-0.5 pl-6 text-xs text-(--l-fg-3)">{whenToUse}</p>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-(--l-border) bg-(--l-surface-2) px-2.5 text-xs font-medium text-(--l-fg-2) transition-[border-color,color,transform] duration-150 hover:border-(--l-fg-4) hover:text-(--l-fg) active:scale-[0.97]"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-500" strokeWidth={1.75} />
          ) : (
            <Copy className="size-3.5" strokeWidth={1.5} />
          )}
          <span>{copied ? "Copied" : "Copy prompt"}</span>
        </button>
      </div>

      <div className="max-w-full whitespace-pre-wrap break-words bg-(--l-code-bg) px-4 py-3.5 font-mono text-xs leading-relaxed text-(--l-panel-fg) sm:px-5 sm:py-4">
        {prompt}
      </div>
    </div>
  );
}
