import { ChatNotice, ClientID } from "../core/Schemas";
import { censorChat } from "./Censor";

// The chat's automatic moderation, one per game. On top of the burst limit
// (ClientMsgRateLimiter) it:
//  - blocks hate speech outright,
//  - masks insults and swearing,
//  - blocks links and a line sent twice in a row,
//  - calms shouting and long runs of one character.
// Hate and insults are strikes: at STRIKES_TO_MUTE the player is muted, for
// longer each time. The sender hears why through a notice; nobody else does.

const STRIKES_TO_MUTE = 3;
const HATE_STRIKES = 2;
const INSULT_STRIKES = 1;
const MUTE_SECONDS = [120, 300, 900];
const REPEAT_WINDOW_MS = 30_000;

// Words are matched on a folded copy of the line: lowercase, no accents,
// leetspeak read as letters (see fold). Each letter may repeat and be split
// by dots, dashes, underscores or stars; a space stands for any gap.
const HATE = [
  "bougnoule",
  "bougnoul",
  "youpin",
  "youpins",
  "negre",
  "negres",
  "bamboula",
  "sale arabe",
  "sale arabes",
  "sale noir",
  "sale noirs",
  "sale juif",
  "sale juifs",
  "sale chinois",
  "gas the jews",
  "maricon",
  "maricones",
  "viado",
  "frocio",
  "schwuchtel",
  "пидор",
  "пидорас",
];

const INSULTS = [
  // French
  "connard",
  "connards",
  "connasse",
  "connasses",
  "salope",
  "salopes",
  "salaud",
  "pute",
  "putes",
  "encule",
  "encules",
  "enculee",
  "enculer",
  "fdp",
  "ntm",
  "nique",
  "niquer",
  "niktamer",
  "ta gueule",
  "batard",
  "batards",
  "pd",
  "pede",
  "pedes",
  "tapette",
  "gouine",
  "abruti",
  "abrutis",
  "debile",
  "mongol",
  "gogol",
  "attarde",
  "teube",
  "trisomique",
  "va te faire foutre",
  "vtff",
  "va mourir",
  "va crever",
  "suicide toi",
  // English
  "fuck you",
  "fuck u",
  "fck you",
  "stfu",
  "motherfucker",
  "bitch",
  "bitches",
  "cunt",
  "dick",
  "dickhead",
  "asshole",
  "bastard",
  "whore",
  "slut",
  "retard",
  "retarded",
  "dumbass",
  "wanker",
  "twat",
  "kys",
  "kill yourself",
  "kill urself",
  "neck yourself",
  // Spanish, German, Italian, Portuguese, Polish, Turkish, Russian
  "puta",
  "puto",
  "cabron",
  "pendejo",
  "gilipollas",
  "hurensohn",
  "fotze",
  "wichser",
  "schlampe",
  "missgeburt",
  "arschloch",
  "fick dich",
  "vaffanculo",
  "stronzo",
  "coglione",
  "puttana",
  "caralho",
  "arrombado",
  "kurwa",
  "chuj",
  "jebac",
  "orospu",
  "amk",
  "siktir",
  "suka",
  "сука",
  "хуй",
];

const SWEARING = [
  "merde",
  "putain",
  "ptn",
  "fuck",
  "fucking",
  "shit",
  "bullshit",
  "scheisse",
  "mierda",
  "cazzo",
  "blyat",
  "блять",
];

const LINK =
  /(https?:\/\/|www\.|discord\.(gg|com\/invite)|\b[a-z0-9-]{2,}\.(com|net|org|fr|io|gg|xyz|ru|be|ch|ca|co|me|tv|ly|link|app|dev|info|site|online|shop|store)\b)/i;

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** The line folded one UTF-16 unit for one, so matches map back onto it. */
function fold(text: string): string {
  let out = "";
  for (const unit of text.split("")) {
    const base = unit.normalize("NFD").toLowerCase()[0] ?? unit;
    out += LEET[base] ?? base;
  }
  return out;
}

function matcher(words: string[]): RegExp {
  const body = words
    .map((w) =>
      [...w]
        .map((ch) => (ch === " " ? "[\\s._*\\-]+" : `${ch}+`))
        .join("[._*\\-]*"),
    )
    .join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, "gu");
}

const hateMatcher = matcher(HATE);
const insultMatcher = matcher(INSULTS);
const swearMatcher = matcher(SWEARING);

/** Masks what `re` finds in `text`; says whether it found anything. */
function mask(text: string, re: RegExp): { text: string; hit: boolean } {
  let hit = false;
  const chars = text.split("");
  for (const m of fold(text).matchAll(re)) {
    hit = true;
    for (let i = m.index; i < m.index + m[0].length; i++) {
      if (!/\s/.test(chars[i])) chars[i] = "*";
    }
  }
  return { text: chars.join(""), hit };
}

export function hasLink(text: string): boolean {
  return LINK.test(text);
}

export function isHateSpeech(text: string): boolean {
  return censorChat(text) !== text || mask(text, hateMatcher).hit;
}

/** Long runs of one character cut to four ("NOOOOOOON" -> "NOOOON"). */
export function collapseRuns(text: string): string {
  return text.replace(/(.)\1{4,}/gsu, "$1$1$1$1");
}

/** A shouted line (mostly capitals, 8+ letters) in lowercase. */
export function calmShouting(text: string): string {
  let letters = 0;
  let upper = 0;
  for (const ch of text) {
    if (ch.toLowerCase() === ch.toUpperCase()) continue;
    letters++;
    if (ch === ch.toUpperCase()) upper++;
  }
  return letters >= 8 && upper / letters >= 0.7 ? text.toLowerCase() : text;
}

export interface ChatVerdict {
  /** The line to relay, or null when it is dropped. */
  text: string | null;
  /** What to tell the sender, if anything. */
  notice: ChatNotice | null;
  /** How long the sender stays muted, for a "muted" notice. */
  seconds?: number;
}

interface SenderState {
  strikes: number;
  mutes: number;
  mutedUntil: number;
  lastLine: string | null;
  lastAt: number;
}

export class ChatModerator {
  private readonly senders = new Map<ClientID, SenderState>();

  private state(from: ClientID): SenderState {
    let s = this.senders.get(from);
    if (s === undefined) {
      s = { strikes: 0, mutes: 0, mutedUntil: 0, lastLine: null, lastAt: 0 };
      this.senders.set(from, s);
    }
    return s;
  }

  private mutedVerdict(s: SenderState, now: number): ChatVerdict {
    return {
      text: null,
      notice: "muted",
      seconds: Math.ceil((s.mutedUntil - now) / 1000),
    };
  }

  /** Adds strikes; true when they earn a mute, which then starts. */
  private strike(s: SenderState, count: number, now: number): boolean {
    s.strikes += count;
    if (s.strikes < STRIKES_TO_MUTE) return false;
    const seconds = MUTE_SECONDS[Math.min(s.mutes, MUTE_SECONDS.length - 1)];
    s.mutes++;
    s.strikes = 0;
    s.mutedUntil = now + seconds * 1000;
    return true;
  }

  /** Judges a cleaned, non-empty line from `from` sent at `now` (ms). */
  moderate(from: ClientID, line: string, now: number): ChatVerdict {
    const s = this.state(from);
    if (now < s.mutedUntil) return this.mutedVerdict(s, now);

    let text = collapseRuns(line);
    if (hasLink(text)) return { text: null, notice: "link" };

    const key = fold(text).replace(/\s+/g, " ");
    if (key === s.lastLine && now - s.lastAt < REPEAT_WINDOW_MS) {
      return { text: null, notice: "repeated" };
    }
    s.lastLine = key;
    s.lastAt = now;

    if (isHateSpeech(text)) {
      return this.strike(s, HATE_STRIKES, now)
        ? this.mutedVerdict(s, now)
        : { text: null, notice: "blocked" };
    }

    const insults = mask(text, insultMatcher);
    text = mask(insults.text, swearMatcher).text;
    text = calmShouting(text);
    if (!insults.hit) return { text, notice: null };
    return this.strike(s, INSULT_STRIKES, now)
      ? { ...this.mutedVerdict(s, now), text }
      : { text, notice: "warned" };
  }
}
