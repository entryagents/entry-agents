export interface AnsiStyle {
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  fgClass?: string;
}

export interface AnsiSegment {
  text: string;
  style: AnsiStyle;
}

const FG_COLOR_CLASSES: Record<number, string> = {
  30: "text-zinc-500",
  31: "text-rose-400",
  32: "text-emerald-400",
  33: "text-amber-400",
  34: "text-sky-400",
  35: "text-violet-400",
  36: "text-cyan-400",
  37: "text-zinc-200",
  90: "text-zinc-500",
  91: "text-rose-300",
  92: "text-emerald-300",
  93: "text-amber-300",
  94: "text-sky-300",
  95: "text-violet-300",
  96: "text-cyan-300",
  97: "text-zinc-50",
};

// Matches ANSI CSI SGR sequences (\x1b[...m) and other non-SGR CSI sequences
// eslint-disable-next-line no-control-regex
const ANSI_CSI_PATTERN = /\x1B\[([0-9;]*)([A-Za-z])/g;

function applySgrCodes(current: AnsiStyle, rawCodes: string): AnsiStyle {
  if (!rawCodes) {
    return {};
  }

  const next: AnsiStyle = { ...current };
  const codes = rawCodes.split(";").map((part) => Number.parseInt(part, 10));

  for (const code of codes) {
    if (Number.isNaN(code) || code === 0) {
      return {};
    }
    if (code === 1) {
      next.bold = true;
    } else if (code === 2) {
      next.dim = true;
    } else if (code === 3) {
      next.italic = true;
    } else if (code === 4) {
      next.underline = true;
    } else if (code === 22) {
      next.bold = false;
      next.dim = false;
    } else if (code === 23) {
      next.italic = false;
    } else if (code === 24) {
      next.underline = false;
    } else if (code === 39) {
      next.fgClass = undefined;
    } else if (FG_COLOR_CLASSES[code]) {
      next.fgClass = FG_COLOR_CLASSES[code];
    }
  }

  return next;
}

export function parseAnsiSegments(input: string): AnsiSegment[] {
  if (!input) {
    return [];
  }

  const segments: AnsiSegment[] = [];
  let currentStyle: AnsiStyle = {};
  let lastIndex = 0;

  ANSI_CSI_PATTERN.lastIndex = 0;
  let match = ANSI_CSI_PATTERN.exec(input);

  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: input.slice(lastIndex, match.index),
        style: currentStyle,
      });
    }

    const [, rawCodes = "", command = ""] = match;
    if (command === "m") {
      currentStyle = applySgrCodes(currentStyle, rawCodes);
    }

    lastIndex = match.index + match[0].length;
    match = ANSI_CSI_PATTERN.exec(input);
  }

  if (lastIndex < input.length) {
    segments.push({
      text: input.slice(lastIndex),
      style: currentStyle,
    });
  }

  return segments;
}
