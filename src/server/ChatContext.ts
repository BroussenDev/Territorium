// The recent chat of one game, kept in memory so that a flagged line can
// travel to the staff with the conversation around it ("je vais te tuer" can
// be a threat or a remark about an attack). A ring buffer, per game: the
// last MAX_LINES lines of the last MAX_AGE_MS, every channel the game has.
// Nothing here leaves the server on its own: only the lines around a line
// that is reported are attached to that report.

/** Who could read a line: everyone, the sender's team or allies, or some players. */
export type ChatChannel = "all" | "team" | "private";

/** What the filter did with a line (absent: it was sent as typed). */
export type ChatLineAction = "masked" | "blocked" | "removed" | "flagged";

export interface ChatContextLine {
  /** Wall clock, ms since the epoch. */
  t: number;
  /** Sender's clientID, to tell authors apart. */
  id: string;
  name: string;
  ch: ChatChannel;
  /** The line as the player typed it (also when it was masked or blocked). */
  text: string;
  act?: ChatLineAction;
  /** For a team or private line, the players who could read it. */
  to?: string[];
  /** The line being reported. */
  hit?: boolean;
}

export interface ChatContext {
  lines: ChatContextLine[];
  /** The in-game situation between the players, when known. */
  situation?: string;
}

export const CHAT_CONTEXT_MAX_LINES = 50;
export const CHAT_CONTEXT_MAX_AGE_MS = 5 * 60_000;
/** Lines of the conversation that come before the flagged one. */
export const CHAT_CONTEXT_BEFORE = 15;
/** Cap on the lines attached to one report, the flagged line included. */
export const CHAT_CONTEXT_MAX_SENT = 40;
export const CHAT_CONTEXT_LINE_LENGTH = 300;
const MAX_RECIPIENTS = 8;
const NAME_LENGTH = 32;

export interface ChatContextEntry extends ChatContextLine {
  /** Order of arrival, to find the lines before and after. */
  seq: number;
}

export class ChatContextBuffer {
  private lines: ChatContextEntry[] = [];
  private seq = 0;

  constructor(private readonly now: () => number = Date.now) {}

  /** Records a line; returns the entry, whose `act` the caller may set later. */
  record(line: Omit<ChatContextLine, "t" | "hit">): ChatContextEntry {
    const t = this.now();
    const entry: ChatContextEntry = {
      ...line,
      name: line.name.slice(0, NAME_LENGTH),
      text: line.text.slice(0, CHAT_CONTEXT_LINE_LENGTH),
      ...(line.to !== undefined
        ? {
            to: line.to
              .slice(0, MAX_RECIPIENTS)
              .map((n) => n.slice(0, NAME_LENGTH)),
          }
        : {}),
      t,
      seq: this.seq++,
    };
    this.lines.push(entry);
    this.trim(t);
    return entry;
  }

  private trim(now: number) {
    while (
      this.lines.length > CHAT_CONTEXT_MAX_LINES ||
      (this.lines.length > 0 && now - this.lines[0].t > CHAT_CONTEXT_MAX_AGE_MS)
    ) {
      this.lines.shift();
    }
  }

  /** The latest line by `id` still in the buffer. */
  lastBy(id: string): ChatContextEntry | undefined {
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if (this.lines[i].id === id) return this.lines[i];
    }
    return undefined;
  }

  /** Whether the entry is still in the buffer (it ages out). */
  has(entry: ChatContextEntry): boolean {
    this.trim(this.now());
    return this.lines.some((l) => l.seq === entry.seq);
  }

  size(): number {
    return this.lines.length;
  }

  /**
   * The conversation around `entry`: up to CHAT_CONTEXT_BEFORE lines before
   * it (any player), the line itself marked, and the lines that followed it
   * so far. Capped at CHAT_CONTEXT_MAX_SENT lines.
   */
  around(entry: ChatContextEntry): ChatContext {
    this.trim(this.now());
    const i = this.lines.findIndex((l) => l.seq === entry.seq);
    // The entry itself aged out (a very old call): just the line.
    if (i < 0) return { lines: [toLine(entry, true)] };
    const before = this.lines.slice(Math.max(0, i - CHAT_CONTEXT_BEFORE), i);
    const room = CHAT_CONTEXT_MAX_SENT - before.length - 1;
    const after = this.lines.slice(i + 1, i + 1 + Math.max(0, room));
    return {
      lines: [
        ...before.map((l) => toLine(l, false)),
        toLine(this.lines[i], true),
        ...after.map((l) => toLine(l, false)),
      ],
    };
  }
}

function toLine(l: ChatContextEntry, hit: boolean): ChatContextLine {
  return {
    t: l.t,
    id: l.id,
    name: l.name,
    ch: l.ch,
    text: l.text,
    ...(l.act !== undefined ? { act: l.act } : {}),
    ...(l.to !== undefined ? { to: l.to } : {}),
    ...(hit ? { hit: true } : {}),
  };
}
