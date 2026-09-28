// A clan's crest: a shape, a field color, a charge color for the symbol and
// border, and the symbol. Stored by the API as "shape:field:charge:symbol";
// the lists must match its clans.js. Clans that never picked one show a
// default drawn from their tag.

export const CREST_SHAPES = [
  "shield",
  "heater",
  "round",
  "banner",
  "diamond",
] as const;
export type CrestShape = (typeof CREST_SHAPES)[number];

export const CREST_COLORS = {
  red: "#c0392b",
  orange: "#e67e22",
  gold: "#f1c40f",
  green: "#27ae60",
  teal: "#16a085",
  blue: "#2980b9",
  navy: "#1f3a68",
  purple: "#8e44ad",
  pink: "#d6457a",
  black: "#1c1c1c",
  white: "#f5f5f5",
  silver: "#95a5a6",
} as const;
export type CrestColor = keyof typeof CREST_COLORS;
export const CREST_COLOR_NAMES = Object.keys(CREST_COLORS) as CrestColor[];

export const CREST_SYMBOLS = [
  "letter",
  "crown",
  "star",
  "swords",
  "tower",
  "flame",
  "anchor",
  "bolt",
  "moon",
  "mountain",
  "sun",
  "tree",
  "cross",
] as const;
export type CrestSymbol = (typeof CREST_SYMBOLS)[number];

export interface ClanCrest {
  shape: CrestShape;
  field: CrestColor;
  charge: CrestColor;
  symbol: CrestSymbol;
}

const isOneOf = <T extends string>(list: readonly T[], v: string): v is T =>
  (list as readonly string[]).includes(v);

export function parseCrest(raw: string | null | undefined): ClanCrest | null {
  const parts = (raw ?? "").split(":");
  if (parts.length !== 4) return null;
  const [shape, field, charge, symbol] = parts;
  if (
    !isOneOf(CREST_SHAPES, shape) ||
    !isOneOf(CREST_COLOR_NAMES, field) ||
    !isOneOf(CREST_COLOR_NAMES, charge) ||
    field === charge ||
    !isOneOf(CREST_SYMBOLS, symbol)
  ) {
    return null;
  }
  return { shape, field, charge, symbol };
}

export function formatCrest(crest: ClanCrest): string {
  return `${crest.shape}:${crest.field}:${crest.charge}:${crest.symbol}`;
}

// Fields for the default crest, each with a charge that reads on it.
const DEFAULT_PAIRS: [CrestColor, CrestColor][] = [
  ["navy", "gold"],
  ["red", "gold"],
  ["green", "white"],
  ["purple", "gold"],
  ["blue", "white"],
  ["black", "gold"],
  ["teal", "white"],
  ["orange", "black"],
];

/** The crest a clan shows until its leader picks one: its initial on a
 * shield, the colors picked from the tag so neighbors differ. */
export function defaultCrest(tag: string): ClanCrest {
  let hash = 0;
  for (const ch of tag.toUpperCase()) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  const [field, charge] = DEFAULT_PAIRS[hash % DEFAULT_PAIRS.length];
  return { shape: "shield", field, charge, symbol: "letter" };
}

export function crestOf(raw: string | null | undefined, tag: string) {
  return parseCrest(raw) ?? defaultCrest(tag);
}
