import { ChatNotice, ClientID } from "../core/Schemas";
import { censorChat } from "./Censor";
import { CJK_LEXICON, CJK_SAFE, LEXICONS, lexiconWords } from "./ChatLexicon";

// The chat's automatic moderation, one per game. On top of the burst limit
// (ClientMsgRateLimiter) it:
//  - blocks hate speech outright,
//  - masks insults and swearing,
//  - blocks links and a line sent twice in a row,
//  - calms shouting and long runs of one character.
// Hate and insults are strikes: at STRIKES_TO_MUTE the player is muted, for
// longer each time. The sender hears why through a notice; nobody else does.
// The gravest lines are TGS's (TGS-110): hate aimed at a group ("nique les
// noirs", slurs, Nazi references), threats ("kys", "je vais te tuer") and
// sexual violence or harassment ("je te viole", "suce") are removed for
// everyone, their author is muted for the rest of the game, the other
// players are told, and the staff gets a ticket with the line.

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
  "nigger",
  "niggers",
  "nigga",
  "niggas",
  "negresse",
  "faggot",
  "faggots",
  "fag",
  "fags",
  "tranny",
  "trannies",
  "chink",
  "chinks",
  "spic",
  "spics",
  "kike",
  "kikes",
  "paki",
  "gook",
  "wetback",
  "beaner",
  "coon",
  "tapette",
  "tapettes",
  "gouine",
  "gouines",
  "fiotte",
  "fiottes",
  "tarlouze",
  "tantouze",
  "nazi",
  "nazis",
  "hitler",
  "auschwitz",
  "zyklon",
  "third reich",
  "kkk",
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

// TGS-110: threats and pushing someone to self-harm.
const THREATS = [
  "kys",
  "kill yourself",
  "kill urself",
  "go die",
  "suicide toi",
  "suicides toi",
  "va te suicider",
  "va crever",
  "je vais te tuer",
  "je vais te trouver",
  "je sais ou tu habites",
  "i will kill you",
  "ill kill you",
  "i know where you live",
  "je vais te violer",
  "te voy a matar",
  "matate",
  "bring dich um",
  "je te tue",
  "je te tuerai",
  "je vais vous tuer",
  "je vais te buter",
  "je te bute",
  "je vais te crever",
  "tue toi",
  "pends toi",
  "pendez vous",
  "va te pendre",
  "va te tuer",
  "hang yourself",
  "off yourself",
  "i hope you die",
  "hope you die",
  "hope u die",
  "kill u",
  "gonna kill you",
  "ima kill you",
  "going to kill you",
  "i will murder you",
  "ill murder you",
  "ojala te mueras",
  "suicidate",
  "ich bring dich um",
  "ich werde dich toten",
  "ti ammazzo",
  "ammazzati",
  "ti uccido",
  "vou te matar",
  "vai se matar",
];

// Sexual violence and sexual harassment aimed at someone. "viol" alone is a
// whole word, so "violet", "violon" and "violent" are left alone; "viole" only
// counts with a person next to it ("te viole"), "baiser" only as "te baiser".
const SEXUAL = [
  "viol",
  "violer",
  "violee",
  "violez",
  "violeur",
  "violeurs",
  "violerai",
  "violerais",
  "te viole",
  "te violes",
  "t viole",
  "vous viole",
  "je viole",
  "on viole",
  "te baiser",
  "te baise",
  "t baise",
  "t baiser",
  "baise ta",
  "baise ton",
  "baise tes",
  "suce",
  "suces",
  "suce moi",
  "te sucer",
  "me sucer",
  "te sodomiser",
  "sodomise",
  "sodomiser",
  "rape",
  "raped",
  "raping",
  "rapist",
  "rapists",
  "suck my",
  "suck dick",
  "suck cock",
  "suck me",
  "blow me",
  "eat my ass",
  "i will fuck you",
  "ill fuck you",
  "gonna fuck you",
  "ima fuck you",
  "violar",
  "violarte",
  "te violo",
  "violador",
  "violacion",
  "chupamela",
  "chupame",
  "chupa mela",
  "vergewaltigen",
  "vergewaltige",
  "vergewaltigt",
  "vergewaltiger",
  "ich ficke dich",
  "lutsch meinen",
  "lutsch mir",
  "stupro",
  "stuprare",
  "ti stupro",
  "succhiamelo",
  "ti scopo",
  "estuprar",
  "estupro",
  "estuprador",
  "chupa meu",
];

// "crève" (die!) with its accent, as opposed to "crevé" (tired).
const DIE_ACCENT = /(?<![\p{L}])crève(?![\p{L}])/u;
// "meurs"/"crève" aimed at someone through an insult. The bare words are
// ordinary ("je meurs de faim").
const DIE_INSULT =
  /(?<![\p{L}])(?:meurs|creve|crevez)\s+(?:sale|connard|connasse|salope|enfoire|batard|fdp|pute|putain|bouffon|noob)(?![\p{L}])/u;
// "pd" as a whole word; not "PD:" (the Spanish P.S.).
const PD = /(?<![\p{L}\p{N}])p+d+(?![\p{L}\p{N}:])/u;

// TGS-110: violence or contempt next to a group of people, a few words apart.
const HATE_VERBS =
  "nique|niquer|nik|nike|niker|mort aux|mort a|crever|crevez|tuer|tuez|bruler|gazer|fuck|kill|death to|hate|gas|burn";
const GROUPS =
  "noirs?|noire|negros?|blacks?|arabes?|arabs?|beurs?|rebeus?|juifs?|juives?|jews?|musulmans?|muslims?|chinois|asiatiques?|gays?|pedes?|homos?|lesbiennes?|trans|roms?|gitans?|migrants?|blancs?|whites?";
const groupHate = new RegExp(
  `(?<![\\p{L}])(?:${HATE_VERBS})(?:\\s+\\p{L}+){0,2}\\s+(?:${GROUPS})(?![\\p{L}])`,
  "u",
);
// "Dirty" only right before the group ("sale arabe"): a few words apart it
// is ordinary talk ("sale partie des blancs", the white team).
const dirtyGroup = new RegExp(
  `(?<![\\p{L}])(?:sale|sales|dirty)\\s+(?:${GROUPS})(?![\\p{L}])`,
  "u",
);
const NAZI =
  /(?<![\p{L}])(?:heil hitler|sieg heil|white power|1488)(?![\p{L}])/u;

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

// Letters that do not decompose into a base letter and a mark.
const EXTRA: Record<string, string> = {
  ł: "l",
  ı: "i",
  đ: "d",
  ø: "o",
  ى: "ي",
  ة: "ه",
  ٱ: "ا",
  ک: "ك",
  ی: "ي",
};

// Latin letters passed off as Cyrillic ones ("cyка").
const LOOKALIKE: Record<string, string> = {
  a: "а",
  c: "с",
  e: "е",
  o: "о",
  p: "р",
  x: "х",
  y: "у",
  k: "к",
  m: "м",
  h: "н",
  t: "т",
  b: "в",
};

const CYRILLIC_WORD = /[\p{L}\p{N}]*\p{Script=Cyrillic}[\p{L}\p{N}]*/gu;
const SAFE_WORDS = new RegExp(CJK_SAFE.join("|"), "gu");

/**
 * The line folded one UTF-16 unit for one, so matches map back onto it:
 * lowercase, without accents (Latin, Cyrillic, Arabic marks), leetspeak read
 * as letters, Latin lookalikes inside a Cyrillic word read as Cyrillic, and
 * harmless words that contain a CJK term blanked out.
 */
function fold(text: string): string {
  let out = "";
  for (const unit of text.split("")) {
    const code = unit.charCodeAt(0);
    let base: string;
    if ((code >= 0x64b && code <= 0x65f) || code === 0x640 || code === 0x670) {
      base = "_"; // Arabic vowel marks and tatweel: a gap inside a word
    } else if (code < 0x530 || (code >= 0x600 && code <= 0x6ff)) {
      base = unit.normalize("NFD").toLowerCase()[0] ?? unit;
    } else {
      base = unit.toLowerCase()[0] ?? unit;
    }
    base = EXTRA[base] ?? base;
    out += LEET[base] ?? base;
  }
  return out
    .replace(CYRILLIC_WORD, (w) =>
      [...w].map((ch) => LOOKALIKE[ch] ?? ch).join(""),
    )
    .replace(SAFE_WORDS, (w) => " ".repeat(w.length));
}

function matcher(words: string[], wild = false): RegExp {
  const body = words
    .map((w) =>
      [...fold(w)]
        .map((ch) =>
          ch === " "
            ? "[\\s._*\\-]+"
            : // "n*gre": a star may stand in for a vowel.
              wild && "aeiou".includes(ch)
              ? `[${ch}*]+`
              : `${escapeRe(ch)}+`,
        )
        .join("[._*\\-]*"),
    )
    .join("|");
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, "gu");
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Chinese, Japanese and Korean words: found anywhere in a line. */
function cjkMatcher(words: string[]): RegExp {
  return new RegExp(words.map(escapeRe).join("|"), "gu");
}

type Kind = "insults" | "swearing" | "hate" | "threats" | "sexual";

/** A list's matchers: its spaced words, and the CJK terms of the lexicon. */
function matchers(words: string[], kind: Kind, wild = false): RegExp[] {
  return [
    matcher([...words, ...lexiconWords(kind, LEXICONS)], wild),
    cjkMatcher(lexiconWords(kind, CJK_LEXICON)),
  ];
}

const hateMatcher = matchers(HATE, "hate", true);
const sexualMatcher = matchers(SEXUAL, "sexual", true);
const insultMatcher = matchers(INSULTS, "insults");
const swearMatcher = matchers(SWEARING, "swearing");
const threatMatcher = matchers(THREATS, "threats");

/** Masks what `res` find in `text`; says whether they found anything. */
function mask(
  text: string,
  res: readonly RegExp[],
): { text: string; hit: boolean } {
  let hit = false;
  const chars = text.split("");
  const folded = fold(text);
  for (const re of res) {
    for (const m of folded.matchAll(re)) {
      hit = true;
      for (let i = m.index; i < m.index + m[0].length; i++) {
        if (!/\s/.test(chars[i])) chars[i] = "*";
      }
    }
  }
  return { text: chars.join(""), hit };
}

export function hasLink(text: string): boolean {
  return LINK.test(text);
}

const SPLIT_LETTERS =
  /(?<![\p{L}\p{N}])(?:[\p{L}\p{N}@$][ ._*-]+){2,}[\p{L}\p{N}@$](?![\p{L}\p{N}])/gu;

/** "v i o l e" or "k.y.s" joined back into one word. */
function despace(text: string): string {
  return text.replace(SPLIT_LETTERS, (m) => m.replace(/[ ._*-]+/g, ""));
}

export type SevereKind = "hate" | "threat" | "sexual";

function severeOne(text: string): SevereKind | null {
  const folded = fold(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
  if (
    groupHate.test(folded) ||
    dirtyGroup.test(folded) ||
    NAZI.test(folded) ||
    NAZI.test(text.toLowerCase()) ||
    PD.test(fold(text)) ||
    mask(text, hateMatcher).hit
  ) {
    return "hate";
  }
  if (mask(text, sexualMatcher).hit) return "sexual";
  if (
    mask(text, threatMatcher).hit ||
    DIE_ACCENT.test(text.toLowerCase()) ||
    DIE_INSULT.test(folded)
  ) {
    return "threat";
  }
  return null;
}

/**
 * A line TGS removes for everyone (TGS-110): "hate" aimed at a group of
 * people (slurs, Nazi references), a "threat" (death, suicide) or "sexual"
 * violence or harassment. null for anything else, ordinary insults included.
 * Read on the line as typed and with its apostrophes and spaced-out letters
 * ("t'viole", "v i o l") put back together.
 */
export function severeChat(text: string): SevereKind | null {
  const plain = text.replace(/['’`´]/g, " ");
  return (
    severeOne(plain) ?? severeOne(despace(plain)) ?? severeOne(despace(text))
  );
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
  /** A line TGS removed (TGS-110): tell everyone and the staff. */
  severe?: SevereKind;
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
    // Muted by TGS: for the rest of the game.
    if (s.mutedUntil === Infinity) return { text: null, notice: "tgs_muted" };
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

    const severe = severeChat(text);
    if (severe !== null) {
      s.mutedUntil = Infinity;
      return { text: null, notice: "tgs_muted", severe };
    }

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
