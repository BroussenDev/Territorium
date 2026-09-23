import newsItems from "../../../resources/news.json";
import {
  filterNewsByPlatform,
  getVisibleNewsItems,
  localizeNewsItem,
  NewsItem,
} from "../../../src/client/components/NewsBox";

const DISMISSED_NEWS_KEY = "dismissedNewsItems";
const allItems = newsItems as NewsItem[];

function createMockLocalStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}

describe("NewsBox", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createMockLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getVisibleNewsItems", () => {
    it("returns all items when none are dismissed", () => {
      const items = getVisibleNewsItems(allItems);
      expect(items.length).toBe(newsItems.length);
    });

    it("filters out dismissed items", () => {
      const items = getVisibleNewsItems(allItems);
      const firstId = items[0].id;
      localStorage.setItem(DISMISSED_NEWS_KEY, JSON.stringify([firstId]));
      const filtered = getVisibleNewsItems(allItems);
      expect(filtered.find((i) => i.id === firstId)).toBeUndefined();
      expect(filtered.length).toBe(items.length - 1);
    });

    it("returns empty when all items are dismissed", () => {
      const allIds = allItems.map((i) => i.id);
      localStorage.setItem(DISMISSED_NEWS_KEY, JSON.stringify(allIds));
      const items = getVisibleNewsItems(allItems);
      expect(items.length).toBe(0);
    });
  });

  describe("filterNewsByPlatform", () => {
    const everywhere: NewsItem = { id: "a", title: "A", type: "announcement" };
    const emptyList: NewsItem = {
      id: "b",
      title: "B",
      type: "announcement",
      platforms: [],
    };
    const webOnly: NewsItem = {
      id: "c",
      title: "C",
      type: "announcement",
      platforms: ["web", "crazygames"],
    };
    const items = [everywhere, emptyList, webOnly];

    it("hides items targeted at other platforms", () => {
      expect(filterNewsByPlatform(items, "steam").map((i) => i.id)).toEqual([
        "a",
        "b",
      ]);
    });

    it("shows items targeted at the current platform", () => {
      expect(filterNewsByPlatform(items, "web").map((i) => i.id)).toEqual([
        "a",
        "b",
        "c",
      ]);
    });
  });

  describe("news items structure", () => {
    it("each item has required fields", () => {
      const items = getVisibleNewsItems(allItems);
      for (const item of items) {
        expect(item.id).toBeDefined();
        expect(typeof item.id).toBe("string");
        expect(item.title).toBeDefined();
        expect(typeof item.title).toBe("string");
        const hasDescription =
          item.description !== undefined ||
          item.descriptionTranslationKey !== undefined;
        expect(hasDescription).toBe(true);
        expect(item.type).toBeDefined();
        expect(["tournament", "tutorial", "announcement", "warning"]).toContain(
          item.type,
        );
      }
    });

    it("each item has a unique id", () => {
      const items = getVisibleNewsItems(allItems);
      const ids = items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("contains an announcement entry", () => {
      const items = getVisibleNewsItems(allItems);
      expect(items.some((i) => i.type === "announcement")).toBe(true);
    });
  });
});

describe("localizeNewsItem", () => {
  const item: NewsItem = {
    id: "a",
    title: "Bienvenue",
    description: "Bon jeu",
    type: "announcement",
    translations: {
      en: { title: "Welcome", description: "Have fun" },
      de: { title: "Willkommen", description: "Viel Spaß" },
      "pt-BR": { title: "Bem-vindo", description: "Divirta-se" },
    },
  };

  test("picks the exact language, then its base, else the original", () => {
    expect(localizeNewsItem(item, "en").title).toBe("Welcome");
    expect(localizeNewsItem(item, "pt-BR").description).toBe("Divirta-se");
    expect(localizeNewsItem(item, "de-CH").title).toBe("Willkommen");
    expect(localizeNewsItem(item, "eo")).toBe(item);
  });

  test("an item without translations is shown as written", () => {
    const plain: NewsItem = { id: "b", title: "Salut", type: "announcement" };
    expect(localizeNewsItem(plain, "en")).toBe(plain);
  });
});
