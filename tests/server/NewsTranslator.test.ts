import { describe, expect, test } from "vitest";
import type { NewsItem } from "../../src/core/ApiSchemas";
import {
  DEEPL_TARGETS,
  type TranslateFn,
  markdownToXml,
  translateNews,
  xmlToMarkdown,
} from "../../src/server/NewsTranslator";

// Fake DeepL: prefixes every text with the target language and records calls.
function fakeTranslator(fail: string[] = []) {
  const calls: { texts: string[]; target: string }[] = [];
  const translate: TranslateFn = async (texts, target) => {
    calls.push({ texts, target });
    if (fail.includes(target)) throw new Error("down");
    return texts.map((t) => `[${target}] ${t}`);
  };
  return { translate, calls };
}

const news = (id: string, title: string, description?: string): NewsItem => ({
  id,
  title,
  type: "announcement",
  ...(description !== undefined ? { description } : {}),
});

describe("markdownToXml / xmlToMarkdown", () => {
  test("keeps link targets out of the translated text", () => {
    const { xml, urls } = markdownToXml(
      "Rejoins le [Discord](https://discord.gg/abc) & va sur https://x.fr/a?b=1",
    );
    expect(xml).not.toContain("discord.gg");
    expect(xml).toContain("&amp;");
    expect(urls).toEqual(["https://discord.gg/abc", "https://x.fr/a?b=1"]);
    const translated = xml
      .replace("Rejoins le", "Join the")
      .replace("va sur", "go to");
    expect(xmlToMarkdown(translated, urls)).toBe(
      "Join the [Discord](https://discord.gg/abc) & go to https://x.fr/a?b=1",
    );
  });

  test("puts back a link the translation dropped", () => {
    const { urls } = markdownToXml(
      "Rejoins le [Discord](https://discord.gg/abc)",
    );
    expect(xmlToMarkdown("Discordに参加して", urls)).toBe(
      "Discordに参加して https://discord.gg/abc",
    );
  });
});

describe("translateNews", () => {
  test("translates title and description into every game language", async () => {
    const { translate, calls } = fakeTranslator();
    const [out] = await translateNews(
      [news("a", "Bienvenue", "Bon jeu **à tous**")],
      [],
      translate,
    );
    // One request per distinct DeepL language (de and de-CH share DE).
    expect(calls).toHaveLength(new Set(Object.values(DEEPL_TARGETS)).size);
    expect(out.translations?.en).toEqual({
      title: "[EN-US] Bienvenue",
      description: "[EN-US] Bon jeu **à tous**",
    });
    expect(out.translations?.["de-CH"]).toEqual(out.translations?.de);
    expect(Object.keys(out.translations!)).toHaveLength(
      Object.keys(DEEPL_TARGETS).length,
    );
  });

  test("reuses translations of unchanged items and retranslates edited ones", async () => {
    const first = fakeTranslator();
    const saved = await translateNews(
      [news("a", "Un"), news("b", "Deux")],
      [],
      first.translate,
    );
    const second = fakeTranslator();
    const out = await translateNews(
      // Reordered, "b" edited, and the admin page echoing stale translations.
      [
        { ...news("b", "Deux bis"), translations: saved[1].translations },
        news("a", "Un"),
      ],
      saved,
      second.translate,
    );
    expect(second.calls.every((c) => c.texts.length === 1)).toBe(true);
    expect(second.calls[0].texts).toEqual(["Deux bis"]);
    expect(out[0].translations?.fr?.title).toBe("[FR] Deux bis");
    expect(out[1].translations).toEqual(saved[0].translations);
  });

  test("skips languages that fail and retries when all of them do", async () => {
    const { translate } = fakeTranslator(["JA"]);
    const [partial] = await translateNews([news("a", "Salut")], [], translate);
    expect(partial.translations?.ja).toBeUndefined();
    expect(partial.translations?.fr?.title).toBe("[FR] Salut");

    const down: TranslateFn = async () => {
      throw new Error("quota");
    };
    const [none] = await translateNews([news("b", "Salut")], [], down);
    expect(none.translations).toBeUndefined();
  });

  test("without a translator the feed is saved as written", async () => {
    const [out] = await translateNews([news("a", "Salut")], [], null);
    expect(out).toEqual(news("a", "Salut"));
  });
});
