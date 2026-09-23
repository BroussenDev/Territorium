import type { Logger } from "winston";
import type { NewsItem } from "../core/ApiSchemas";

// Machine translation of the homepage news: the admin writes an item once, in
// any language, and every player reads it in theirs. Done once, when the feed
// is saved, so players never wait on (or leak their language to) DeepL.

export type NewsTranslations = NonNullable<NewsItem["translations"]>;

// Game language (resources/lang/*.json) -> DeepL target language. Languages
// DeepL does not offer are left out: their players read the original text.
export const DEEPL_TARGETS: Record<string, string> = {
  ar: "AR",
  bg: "BG",
  cs: "CS",
  da: "DA",
  de: "DE",
  "de-CH": "DE",
  el: "EL",
  en: "EN-US",
  es: "ES",
  et: "ET",
  fi: "FI",
  fr: "FR",
  he: "HE",
  hu: "HU",
  id: "ID",
  it: "IT",
  ja: "JA",
  ko: "KO",
  nl: "NL",
  pl: "PL",
  "pt-BR": "PT-BR",
  "pt-PT": "PT-PT",
  ro: "RO",
  ru: "RU",
  sk: "SK",
  sl: "SL",
  "sv-SE": "SV",
  tr: "TR",
  uk: "UK",
  vi: "VI",
  "zh-CN": "ZH-HANS",
  "zh-TW": "ZH-HANT",
};

// Translates a batch of texts into one DeepL target language.
export type TranslateFn = (
  texts: string[],
  target: string,
) => Promise<string[]>;

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// Descriptions are markdown. Links are sent as XML tags so DeepL translates
// the label but never touches the URL, then turned back into markdown.
export function markdownToXml(md: string): { xml: string; urls: string[] } {
  const urls: string[] = [];
  const xml = escapeXml(md).replace(
    /\[([^\]]*)\]\(([^)\s]+)\)|(https?:\/\/[^\s)]+)/g,
    (_m, label: string | undefined, href: string | undefined, bare) => {
      if (bare !== undefined) {
        urls.push(unescapeXml(bare));
        return `<u i="${urls.length - 1}"/>`;
      }
      urls.push(unescapeXml(href!));
      return `<a i="${urls.length - 1}">${label}</a>`;
    },
  );
  return { xml, urls };
}

export function xmlToMarkdown(xml: string, urls: string[]): string {
  const used = new Set<number>();
  const url = (i: string) => {
    used.add(Number(i));
    return urls[Number(i)] ?? "";
  };
  const withLinks = xml
    .replace(
      /<a i="(\d+)">([\s\S]*?)<\/a>/g,
      (_m, i: string, label: string) => `[${label}](${url(i)})`,
    )
    .replace(/<u i="(\d+)"\s*\/>/g, (_m, i: string) => url(i));
  // DeepL sometimes drops a tag (seen in Japanese). Never lose the link:
  // put it back at the end, where markdown turns it into a link again.
  const lost = urls.filter((_u, i) => !used.has(i));
  return [unescapeXml(withLinks), ...lost].join(" ");
}

export function deeplTranslator(apiKey: string): TranslateFn {
  // Free-plan keys end in ":fx" and live on their own host.
  const host = apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";
  return async (texts, target) => {
    const response = await fetch(`${host}/v2/translate`, {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: texts,
        target_lang: target,
        tag_handling: "xml",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`DeepL ${target}: HTTP ${response.status}`);
    }
    const json = (await response.json()) as {
      translations: { text: string }[];
    };
    return json.translations.map((t) => t.text);
  };
}

const sameText = (a: NewsItem, b: NewsItem) =>
  a.title === b.title && (a.description ?? "") === (b.description ?? "");

/**
 * Fills in `translations` for every item. An item whose text did not change
 * since it was last saved keeps the translations it already had, so
 * reordering or re-saving the feed costs nothing. A language that fails is
 * skipped (its players see the original) rather than failing the save.
 */
export async function translateNews(
  items: NewsItem[],
  previous: NewsItem[],
  translate: TranslateFn | null,
  log?: Logger,
): Promise<NewsItem[]> {
  const before = new Map(previous.map((i) => [i.id, i]));
  const out = items.map((item): NewsItem => {
    const old = before.get(item.id);
    const rest = { ...item };
    delete rest.translations;
    return old?.translations && sameText(old, item)
      ? { ...rest, translations: old.translations }
      : rest;
  });
  const todo = out.filter((i) => i.translations === undefined);
  if (translate === null || todo.length === 0) return out;

  // One request per DeepL language, for all the items that need it: each
  // item contributes its title and, if any, its description.
  const sources = todo.map((i) => ({
    title: markdownToXml(i.title),
    description:
      i.description !== undefined ? markdownToXml(i.description) : undefined,
  }));
  const texts = sources.flatMap((s) =>
    s.description ? [s.title.xml, s.description.xml] : [s.title.xml],
  );
  const results = new Map<string, NewsTranslations[string][]>();
  for (const target of new Set(Object.values(DEEPL_TARGETS))) {
    try {
      const translated = await translate(texts, target);
      let k = 0;
      results.set(
        target,
        sources.map((s) => {
          const title = xmlToMarkdown(translated[k++], s.title.urls);
          if (!s.description) return { title };
          const description = xmlToMarkdown(
            translated[k++],
            s.description.urls,
          );
          return { title, description };
        }),
      );
    } catch (error) {
      log?.warn(`News translation to ${target} failed`, error);
    }
  }
  todo.forEach((item, n) => {
    const translations: NewsTranslations = {};
    for (const [lang, target] of Object.entries(DEEPL_TARGETS)) {
      const t = results.get(target)?.[n];
      if (t) translations[lang] = t;
    }
    // Nothing came back (DeepL down, quota spent): leave it untranslated so
    // the next save tries again.
    if (Object.keys(translations).length > 0) item.translations = translations;
  });
  return out;
}
