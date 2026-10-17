/**
 * Real countries in the player's language: "Senegal" reads "Sénégal" in
 * French. Map manifests name nations in English, and only a nation that is a
 * whole country (its name matches its ISO flag code's English name) is
 * translated — a region such as "Punjab" or "Bavaria" keeps its own name.
 * The browser's Intl.DisplayNames supplies the names in every language.
 */

/** Manifest spellings that differ from the standard English country name. */
const ALIASES: Record<string, string> = {
  "cabo verde": "CV",
  "dr congo": "CD",
  "hong kong": "HK",
  "islamic republic of iran": "IR",
  macau: "MO",
  myanmar: "MM",
  palestine: "PS",
  "republic of armenia": "AM",
  "republic of azerbaijan": "AZ",
  "republic of congo": "CG",
  "republic of turkiye": "TR",
  "russian federation": "RU",
  "saint helena": "SH",
  "saint kitts and nevis": "KN",
  "saint lucia": "LC",
  "st vincent & the grenadines": "VC",
  svalbard: "SJ",
  "syrian arab republic": "SY",
  "turks and caicos": "TC",
  turkey: "TR",
  "united states of america": "US",
};

const english = safeDisplayNames("en");
const byLanguage = new Map<string, Intl.DisplayNames | null>();

function safeDisplayNames(lang: string): Intl.DisplayNames | null {
  try {
    // Intl quietly falls back to the browser's own language for one it
    // doesn't know; keep the original name instead.
    if (Intl.DisplayNames.supportedLocalesOf([lang]).length === 0) return null;
    return new Intl.DisplayNames([lang], { type: "region", fallback: "none" });
  } catch {
    return null;
  }
}

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z]/g, "");
}

/** The ISO region code for a nation, or null when it isn't a whole country. */
export function countryCode(name: string, flag: string): string | null {
  if (!/^[a-z]{2}$/i.test(flag)) return null;
  const code = flag.toUpperCase();
  if (ALIASES[name.trim().toLowerCase()] === code) return code;
  const englishName = english?.of(code);
  return englishName !== undefined && normalize(englishName) === normalize(name)
    ? code
    : null;
}

/** The nation's name in `lang`, or the name unchanged if it can't be. */
export function localizedCountryName(
  name: string,
  flag: string,
  lang: string,
): string {
  const code = countryCode(name, flag);
  if (code === null) return name;
  let names = byLanguage.get(lang);
  if (names === undefined) {
    names = safeDisplayNames(lang);
    byLanguage.set(lang, names);
  }
  return names?.of(code) ?? name;
}

/**
 * Whether the map's name font can draw `name`: it carries Latin letters with
 * their accents (Latin-1), not Cyrillic, Chinese or Japanese. A country name
 * localized into those reads well in the HTML panels but would come out as
 * garbage over the map.
 */
export function drawableOnMap(name: string): boolean {
  for (const char of name) {
    if ((char.codePointAt(0) ?? 0) > 0xff) return false;
  }
  return true;
}

/**
 * A display name with its country localized: a nation's whole name, or the
 * "Country | Player" prefix a human carries in Nations games.
 */
export function localizeCountryInDisplayName(
  displayName: string,
  flag: string,
  isNation: boolean,
  lang: string,
): string {
  const bar = displayName.indexOf(" | ");
  if (bar > 0) {
    const country = displayName.slice(0, bar);
    return localizedCountryName(country, flag, lang) + displayName.slice(bar);
  }
  return isNation ? localizedCountryName(displayName, flag, lang) : displayName;
}
