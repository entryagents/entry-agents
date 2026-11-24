/**
 * Lead-ins: ported 1:1 from Leonxlnx/sable src/features/timeline/lead-in.ts.
 *
 * The one-line announcements an agent writes before a step ("Let me read the handler.",
 * "Now I'll run the tests."). They say what the next step does, so they read as part of
 * the work: folded with the steps they announce, and named by the live line while those
 * steps run. A text that also says what the agent found ("The guard answers 403. Let me
 * fix it.") is a note: it closes a checkpoint and stays in view while the turn runs.
 */

/** Longer than this, a text is never a lead-in (a plan, a report). */
export const LEAD_MAX = 200;

/** Words that may open an announcement before its verb: "Now, let me...", "Perfect! Let me...". */
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

/**
 * Nods that stand as a sentence of their own and say nothing the work line does not ("Perfect.",
 * "That works."), and the one word for a step that is done ("Committed.", "Pushed."), which only
 * repeats the step's own row. Never the answer of a turn that said more.
 */
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
  "done",
  "cool",
  "fine",
  "i see",
  "understood",
  "makes sense",
  "looks good",
  "all good",
  "that works",
  "that worked",
  "all done",
  "all set",
  "that's it",
  "that is it",
  "that's all",
  "that is all",
  "committed",
  "pushed",
  "fixed",
  "saved",
  "merged",
  "landed",
  "reverted",
  "applied",
  "updated",
  "installed",
  "deployed",
  "published",
  "released",
  "shipped",
  "built",
  "added",
  "removed",
  "written",
  "sent",
  "finished",
  "completed",
];

/** How an announcement goes on: the agent says what it is about to do. */
const PHRASES = [
  "let me",
  "let's",
  "i'll",
  "i will",
  "i'm going to",
  "i am going to",
  "i'm now going to",
  "i'm about to",
  "i need to",
  "i want to",
  "i should",
  "we need to",
  "time to",
  "going to",
  "about to",
  "lass mich",
  "lass uns",
  "ich werde",
  "ich schaue",
  "ich prüfe",
  "ich sehe mir",
];

/** "I'm checking ...", or the bare form "Checking ...", "Running the tests now.": what it is doing now. */
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
  "running",
  "rerunning",
  "re-running",
  "starting",
  "moving",
  "switching",
  "trying",
  "retrying",
  "fixing",
  "updating",
  "adding",
  "writing",
  "rewriting",
  "editing",
  "creating",
  "building",
  "rebuilding",
  "testing",
  "applying",
  "implementing",
  "installing",
  "committing",
  "pushing",
  "wiring",
  "removing",
  "renaming",
  "refactoring",
  "cleaning",
  "waiting",
  "continuing",
  "filming",
  "measuring",
  "comparing",
  "confirming",
  "fetching",
  "launching",
  "restarting",
  "patching",
  "replacing",
  "rechecking",
  "double-checking",
  "type-checking",
];

/**
 * Verbs that make an announcement a report after all: "I should note the key is read from .env",
 * "I need to point out the tests were failing before". What the agent says, not what it does next.
 */
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
const DOING_HEAD = new RegExp(
  `^${OPENER}*(?:i'm (?:now )?)?(?:${DOING.map(esc).join("|")})\\b`,
);
const MODAL_HEAD = new RegExp(
  `^${OPENER}*(?:i need to|we need to|i should)\\b`,
);
const HAPPENED =
  /\b(?:showed|shows|broke|failed|passed|worked|fixed|found|gave|took|caused|made|revealed|turned out|did|didn't|was|were|is|are)\b/;
const REQUIRES =
  /\b(?:requires?|required|needs?|needed|depends?|depended|wants?|expects?|blocks?|blocked|prevents?|prevented|asks?|asked|involves?|affects?|affected|means|may|might|won't|cannot|wouldn't|shouldn't|couldn't|unless|otherwise|for (?:this|that|it|them) to|in order to|so that|before you|you'll|you will|you need|you must)\b/;
const FILLER = new RegExp(`^(?:${FILLERS.map(esc).join("|")})[,!.]*$`);
const LEADING = new RegExp(`^${OPENER}*`);
const STARTS = [
  ...PHRASES,
  ...DOING,
  ...DOING.map((d) => `i'm ${d}`),
  ...OPENERS,
];

const MOVES = [
  "now",
  "next",
  "then",
  "first",
  "second",
  "third",
  "finally",
  "lastly",
  "next up",
  "up next",
  "on to",
  "onto",
  "back to",
  "time for",
  "and now",
  "now for",
  "now on to",
];
const NOD = `(?:(?:${[...FILLERS, "and", "so"].map(esc).join("|")})[,!.]?\\s+)`;
const NAMES =
  "the|a|an|this|that|these|those|its|their|my|our|each|every|all|both|some|another|one|two|three|four|other|same|remaining";
const MOVE_HEAD = new RegExp(
  `^${NOD}*(?:${MOVES.map(esc).join("|")})[,:]?\\s+(?:for\\s+|to\\s+)?`,
);
const NAME_SET = new Set(NAMES.split("|"));

function afterMove(p: string): string[] | null {
  const head = MOVE_HEAD.exec(p);
  if (!head) return null;
  const rest = p.slice(head[0].length).trim();
  return rest ? rest.split(/\s+/) : [];
}

function moveShape(p: string): boolean {
  const words = afterMove(p);
  if (!words?.length || words.length > 5 || words.some((w) => /[,;]/.test(w))) {
    return false;
  }
  const first =
    words.length === 1 ? words[0].replace(/[.:!…]+$/u, "") : words[0];
  return NAME_SET.has(first);
}

function movingShape(p: string): boolean {
  const words = afterMove(p);
  return !!words && words.length <= 5 && !words.some((w) => /[,;.!?]/.test(w));
}

const STATES =
  /\b(?:is|are|was|were|isn't|aren't|wasn't|has|have|had|does|do|did|doesn't|don't|can|can't|could|will|would|should|must|pass(?:es|ed)?|fail(?:s|ed)?|work(?:s|ed)?|throws?|ran|compiles?|built|match(?:es|ed)?|renders?|holds?|stays?|answers?|returns?|looks?|reads?|fits?|lands?|stands?|exists?|agrees?|differs?|behaves?|breaks?|broke|hangs?|crash(?:es|ed)?|succeed(?:s|ed)?|got|gets?|seems?|appears?|remains?|takes?|gives?|goes|went|comes?|came|became|becomes?|happens?|happened|keeps?|lets?|makes?|means?|says?|said|only|not|no|never|still|already|also)\b/;

const isMove = (p: string) => moveShape(p) && !STATES.test(p);

function states(p: string): boolean {
  const doing = DOING_HEAD.exec(p);
  if (doing) {
    const rest = p.slice(doing[0].length);
    const clause = rest.split(",")[0];
    if (HAPPENED.test(rest) || STATES.test(clause) || REQUIRES.test(clause)) {
      return true;
    }
    const after = rest.slice(clause.length + 1).trim();
    return (
      !!after &&
      !ANNOUNCE.test(after) &&
      (STATES.test(after) || REQUIRES.test(after))
    );
  }
  const modal = MODAL_HEAD.exec(p);
  if (modal) {
    const rest = p.slice(modal[0].length);
    return HAPPENED.test(rest) || STATES.test(rest) || REQUIRES.test(rest);
  }
  return false;
}

const CONTRAST = [
  "but",
  "however",
  "although",
  "because",
  "aber",
  "jedoch",
  "allerdings",
  "obwohl",
  "weil",
];
const CONTRAST_AFTER_COMMA = [
  "though",
  "since",
  "whereas",
  "doch",
  "denn",
  "sondern",
];
const TURN = new RegExp(
  `(?:\\s[-–—]+\\s|[,;]\\s*(?:${[...CONTRAST, ...CONTRAST_AFTER_COMMA].join("|")})\\b|\\s(?:${CONTRAST.join("|")})\\b)`,
);
const GERMAN_STATES =
  /(?:^|\s)(?:ist|sind|war|waren|hat|haben|hatte|fehlt|fehlen|fehlte|schlägt|schlug|scheitert|gescheitert|fehlgeschlagen|kaputt|läuft|lief|geht|ging|klappt|bricht|brach|nicht|kein|keine|keinen|schon|bereits|noch)(?=[\s,.!:;]|$)/;

function turnsToState(p: string, writing: boolean): boolean {
  const m = TURN.exec(p);
  if (!m) return false;
  const rest = p
    .slice(m.index + m[0].length)
    .replace(/^[\s,:]+/, "")
    .replace(/^(?:zuerst|erst|dann|jetzt|nun|vorher)[,]?\s+/, "")
    .trim();
  if (!rest) return false;
  const said = [STATES.exec(rest), HAPPENED.exec(rest)]
    .filter((match): match is RegExpExecArray => !!match)
    .sort((a, b) => a.index - b.index)[0];
  const told =
    /^[a-z]+ing\b/i.test(rest) &&
    !!said &&
    !/\b(?:what|whether|if|how|which|why|where|when|who)\b/i.test(
      rest.slice(0, said.index),
    );
  if (!told && (ANNOUNCE.test(rest) || FILLER.test(rest) || isMove(rest))) {
    return false;
  }
  if (writing && !told && mayStart(rest)) return false;
  return (
    rest.split(/\s+/).length >= 3 ||
    STATES.test(rest) ||
    HAPPENED.test(rest) ||
    REQUIRES.test(rest) ||
    GERMAN_STATES.test(rest)
  );
}

function plain(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/[‘’]/g, "'")
    .trim();
}

const sentences = (s: string) => s.split(/(?<=[.!?:;])\s+/).filter(Boolean);

function mayStart(part: string): boolean {
  const rest = part.replace(LEADING, "");
  if (!rest) return true;
  if (movingShape(part) && !STATES.test(part)) return true;
  if (
    STARTS.some(
      (p) =>
        p.startsWith(rest) ||
        (rest.startsWith(p) && /^[\s,!.]/.test(rest.slice(p.length) || " ")),
    )
  ) {
    return true;
  }
  return [...MOVES, ...FILLERS].some(
    (p) =>
      p.startsWith(rest) ||
      (rest.startsWith(p) && /^[,!.]*$/.test(rest.slice(p.length))),
  );
}

/**
 * Whether a text is a lead-in. While it streams, a text that may still become one counts as one
 * (an empty one too): it shows the moment it is plainly something else, and a lead-in never shows
 * and then folds away. Questions and anything over one line or `LEAD_MAX` are never lead-ins.
 */
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
    if (states(p)) return false;
    if (
      ANNOUNCE.test(p) &&
      turnsToState(p, streaming && i === parts.length - 1)
    ) {
      return false;
    }
    if (ANNOUNCE.test(p) || FILLER.test(p) || isMove(p)) continue;
    if (streaming && i === parts.length - 1 && mayStart(p)) continue;
    return false;
  }
  return true;
}

const SUBJECT =
  /^(?:let me|let's|i'll|i will|i'm (?:now )?going to|i am going to|i'm about to|i need to|i want to|i should|we need to|time to|going to|about to|lass mich|lass uns)\s+(?:(?:first|now|also|quickly|just|then|next|go ahead and|start by)\s+)*/i;

/**
 * A lead-in as the live line's title, in the voice of a step's own title:
 * "Now let me run the tests." → "Run the tests", "I'm checking the routes" → "Checking the routes".
 * A nod alone ("Good.", "Committed.") announces nothing and returns "".
 */
export function leadTitle(text: string): string {
  const parts = sentences(plain(text).replace(/\s+/g, " "));
  const first = parts.find((p) => !FILLER.test(p.toLowerCase()));
  if (!first) return "";
  let s = first.replace(new RegExp(LEADING.source, "i"), "");
  s = s.replace(SUBJECT, "").replace(/^i'm\s+(?:now\s+)?/i, "");
  s = s.replace(/[\s.:!…]+$/u, "");
  if (!s) return first.replace(/[\s.:!…]+$/u, "");
  return s[0].toUpperCase() + s.slice(1);
}
