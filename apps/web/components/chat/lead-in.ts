/**
 * Lead-ins: ported 1:1 from Leonxlnx/sable src/features/timeline/lead-in.ts.
 *
 * The one-line announcements an agent writes before a step ("Let me read the handler.",
 * "Now I'll run the tests."). They say what the next step does, so they read as part of
 * the work rather than the final report.
 */

export const LEAD_MAX = 200;

const OPENERS = [
  "ok",
  "okay",
  "alright",
  "now",
  "next",
  "first",
  "then",
  "so",
  "great",
  "good",
  "perfect",
  "excellent",
  "nice",
  "right",
  "sure",
  "got it",
  "and",
];

const FILLERS = [
  "ok",
  "okay",
  "alright",
  "great",
  "good",
  "perfect",
  "excellent",
  "nice",
  "right",
  "sure",
  "got it",
];

const PHRASES = [
  "let me",
  "let's",
  "i'll",
  "i will",
  "i'm going to",
  "i am going to",
  "i'm now going to",
  "i need to",
  "i want to",
  "i should",
  "we need to",
  "time to",
];

const DOING = [
  "checking",
  "looking",
  "reading",
  "searching",
  "scanning",
  "inspecting",
  "reviewing",
  "opening",
  "exploring",
  "investigating",
  "verifying",
  "tracing",
  "pulling",
  "grabbing",
  "digging",
];

const SAYING = [
  "note",
  "mention",
  "point out",
  "flag",
  "say",
  "warn",
  "add that",
  "clarify",
  "stress",
  "emphasize",
  "emphasise",
  "highlight",
  "admit",
  "be clear",
  "be honest",
  "summarize",
  "summarise",
  "recap",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const OPENER = `(?:(?:${OPENERS.map(esc).join("|")})[,!.]?\\s+)`;
const ANNOUNCE = new RegExp(
  `^${OPENER}*(?:${[...PHRASES, ...DOING].map(esc).join("|")}|i'm (?:now )?(?:${DOING.join("|")}))\\b`,
);
const SAYS = new RegExp(
  `^${OPENER}*(?:${PHRASES.map(esc).join("|")})\\s+(?:(?:also|just|briefly|quickly|first)\\s+)?(?:${SAYING.map(esc).join("|")})\\b`,
);
const FINDING = new RegExp(`^${OPENER}*(?:${DOING.join("|")})\\b[^,]*,\\s*\\S`);
const FILLER = new RegExp(`^(?:${FILLERS.map(esc).join("|")})[,!.]*$`);
const LEADING = new RegExp(`^${OPENER}*`);
const STARTS = [
  ...PHRASES,
  ...DOING,
  ...DOING.map((d) => `i'm ${d}`),
  ...OPENERS,
];

function plain(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/[‘’]/g, "'")
    .trim();
}

const sentences = (s: string) => s.split(/(?<=[.!?:])\s+/).filter(Boolean);

function mayStart(part: string): boolean {
  const rest = part.replace(LEADING, "");
  if (!rest) return true;
  return STARTS.some(
    (p) =>
      p.startsWith(rest) ||
      (rest.startsWith(p) && /^[\s,!.]/.test(rest.slice(p.length) || " ")),
  );
}

export function isLeadIn(text: string, streaming = false): boolean {
  if (text.length > LEAD_MAX + 40) return false;
  const t = plain(text).toLowerCase();
  if (!t) return streaming;
  if (t.length > LEAD_MAX || t.includes("\n")) return false;
  const parts = sentences(t);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!p) continue;
    if (
      p.endsWith("?") ||
      p.startsWith("let me know") ||
      p.startsWith("let's discuss")
    ) {
      return false;
    }
    if (SAYS.test(p)) return false;
    if (FINDING.test(p) && !ANNOUNCE.test(p.slice(p.indexOf(",") + 1).trim())) {
      return false;
    }
    if (ANNOUNCE.test(p) || FILLER.test(p)) continue;
    if (streaming && i === parts.length - 1 && mayStart(p)) continue;
    return false;
  }
  return true;
}
