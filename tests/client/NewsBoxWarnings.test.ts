import { describe, expect, it } from "vitest";
import {
  inGameLink,
  withBrowserWarning,
} from "../../src/client/components/NewsBox";
import type { NewsItem } from "../../src/core/ApiSchemas";

const news: NewsItem[] = [{ id: "a", title: "A", type: "announcement" }];

describe("news box", () => {
  it("warns Firefox players only", () => {
    const firefox =
      "Mozilla/5.0 (Windows NT 10.0; rv:131.0) Gecko/20100101 Firefox/131.0";
    const chrome =
      "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36";
    expect(withBrowserWarning(news, firefox).map((n) => n.id)).toEqual([
      "firefox-performance",
      "a",
    ]);
    expect(withBrowserWarning(news, chrome)).toEqual(news);
  });

  it("opens the game's own pages in place", () => {
    expect(inGameLink("#modal=help")).toBe(true);
    expect(inGameLink(`${location.origin}/#modal=store`)).toBe(true);
    expect(inGameLink("https://example.com/x")).toBe(false);
  });
});
