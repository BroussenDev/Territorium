import { describe, expect, it } from "vitest";
import type { ResolvedCosmetic } from "../../src/client/Cosmetics";
import {
  emeraldPrice,
  sortStoreGroups,
  type StoreSort,
} from "../../src/client/StoreSort";

const item = (
  key: string,
  cosmetic: { priceHard?: number; priceSoft?: number; rarity?: string } | null,
) => ({ key, cosmetic }) as unknown as ResolvedCosmetic;

const ITEMS = [
  item("cheap", { priceHard: 50, priceSoft: 500, rarity: "common" }),
  item("medals", { priceSoft: 3000, rarity: "rare" }),
  item("free", null),
  item("dear", { priceHard: 900, rarity: "legendary" }),
  item("mid", { priceHard: 200, rarity: "rare" }),
];
const groups = ITEMS.map((i) => [i]);
const keys = (sort: StoreSort) =>
  sortStoreGroups(groups, sort, (r) => r.key).map((g) => g[0].key);

describe("store sorting", () => {
  it("keeps the catalog order when featured", () => {
    expect(keys("featured")).toEqual([
      "cheap",
      "medals",
      "free",
      "dear",
      "mid",
    ]);
  });

  it("sorts by price, medal-only items at a tenth of an emerald, free last", () => {
    expect(emeraldPrice(ITEMS[1])).toBe(300);
    expect(keys("price_asc")).toEqual([
      "cheap",
      "mid",
      "medals",
      "dear",
      "free",
    ]);
    expect(keys("price_desc")).toEqual([
      "dear",
      "medals",
      "mid",
      "cheap",
      "free",
    ]);
  });

  it("puts the rarest first, the dearer of a rarity first", () => {
    expect(keys("rarity")).toEqual(["dear", "medals", "mid", "cheap", "free"]);
  });

  it("sorts by name", () => {
    expect(keys("name")).toEqual(["cheap", "dear", "free", "medals", "mid"]);
  });

  it("does not change the groups it was given", () => {
    keys("price_desc");
    expect(groups.map((g) => g[0].key)).toEqual([
      "cheap",
      "medals",
      "free",
      "dear",
      "mid",
    ]);
  });
});
