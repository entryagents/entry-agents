"use client";

import { forwardRef, memo, type ReactNode, useMemo } from "react";
import { cn } from "@/lib/utils";

export type ComposerPillKind = "command" | "mention" | "skill" | "shell";

export interface ComposerTokenPart {
  text: string;
  kind?: ComposerPillKind;
}

export interface ComposerKnownTokens {
  commands: ReadonlySet<string>;
  skills: ReadonlySet<string>;
  dollar?: boolean;
  shell?: boolean;
}

export const BUILTIN_COMPOSER_COMMANDS = new Set([
  "inbox",
  "compact",
  "clear",
  "team",
  "team-plan",
]);

/** Fast guard: ordinary prose without trigger prefixes skips tokenization. */
export function mayHavePills(text: string): boolean {
  return (
    text.startsWith("/") ||
    text.startsWith("!") ||
    text.includes("@") ||
    text.includes("$")
  );
}

/**
 * Splits a composer draft into plain text runs and recognised pill tokens.
 * 1:1 port of Sable's `Highlight.tsx` tokenizer.
 */
export function tokenizeComposerText(
  text: string,
  known: ComposerKnownTokens,
): ComposerTokenPart[] {
  const out: ComposerTokenPart[] = [];
  let i = 0;

  const push = (to: number, kind?: ComposerPillKind) => {
    if (to > i) {
      out.push({ text: text.slice(i, to), kind });
    }
    i = to;
  };

  if (known.shell && text.startsWith("!")) {
    push(1, "shell");
  } else if (text.startsWith("/")) {
    const match = /^\/([\w:.-]+)/.exec(text);
    if (match && (known.commands.has(match[1]) || known.skills.has(match[1]))) {
      push(match[0].length, "command");
    }
  }

  if (known.shell) {
    push(text.length);
    return out;
  }

  const re = known.dollar ? /(^|\s)([@$])([^\s@$]+)/g : /(^|\s)(@)([^\s@]+)/g;
  re.lastIndex = i;

  for (let match = re.exec(text); match; match = re.exec(text)) {
    const start = match.index + match[1].length;
    const isSkill = match[2] === "$";
    // Strip trailing sentence punctuation ("@README.md." or "@src/app.ts,").
    const body = match[3].replace(
      /(?:[,;:!?)\]'"]|\.(?=[,;:!?)\]'"]*$))+$/,
      "",
    );
    if (!body) continue;
    if (isSkill && known.skills.size > 0 && !known.skills.has(body)) continue;
    push(start);
    push(start + 1 + body.length, isSkill ? "skill" : "mention");
  }

  push(text.length);
  return out;
}

interface ComposerHighlightProps {
  text: string;
  skillNames: readonly string[];
  shell: boolean;
  className?: string;
}

/**
 * Draws soft pills behind recognised tokens in the composer. Sits underneath
 * the textarea with identical typography, padding, and wrapping so pills track
 * line wraps and scrolling exactly while the real text stays in the textarea.
 */
export const ComposerHighlight = memo(
  forwardRef<HTMLDivElement, ComposerHighlightProps>(function ComposerHighlight(
    { text, skillNames, shell, className },
    ref,
  ) {
    const known = useMemo<ComposerKnownTokens>(
      () => ({
        commands: BUILTIN_COMPOSER_COMMANDS,
        skills: new Set(skillNames),
        dollar: skillNames.length > 0,
        shell,
      }),
      [skillNames, shell],
    );

    const parts = useMemo(
      () => (mayHavePills(text) ? tokenizeComposerText(text, known) : null),
      [text, known],
    );

    if (!parts || !parts.some((p) => p.kind)) {
      return null;
    }

    const nodes: ReactNode[] = parts.map((part, idx) =>
      part.kind ? (
        <mark
          key={idx}
          data-kind={part.kind}
          className={cn(
            "text-transparent",
            part.kind === "shell"
              ? "mx-[-1px] rounded-[4px] bg-zinc-200 px-[1px] py-[2px] dark:bg-[#232328]"
              : "rounded-[5px] bg-muted-foreground/20 shadow-[0_0_0_2px_color-mix(in_oklab,var(--muted-foreground)_20%,transparent)] [box-decoration-break:clone] [-webkit-box-decoration-break:clone] dark:bg-white/[0.12] dark:shadow-[0_0_0_2px_rgb(255_255_255/0.12)]",
          )}
        >
          {part.text}
        </mark>
      ) : (
        part.text
      ),
    );

    return (
      <div
        ref={ref}
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 select-none overflow-hidden whitespace-pre-wrap break-words text-transparent",
          className,
        )}
      >
        {nodes}
        {"​"}
      </div>
    );
  }),
);
