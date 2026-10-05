import type { ResolvedCosmetic } from "./Cosmetics";

/** How the store's item grids can be ordered. */
export const STORE_SORTS = [
  "featured",
  "price_asc",
  "price_desc",
  "rarity",
  "name",
] as const;
export type StoreSort = (typeof STORE_SORTS)[number];

const SORT_KEY = "settings.storeSort";

const RARITY_RANK: Record<string, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

// Medals are worth a tenth of an emerald in the catalog's prices, so an item
// sold only for medals sorts among the emerald prices at that rate.
const MEDALS_PER_EMERALD = 10;

type Priced = { priceHard?: number; priceSoft?: number; rarity?: string };

function priced(resolved: ResolvedCosmetic): Priced {
  return (resolved.cosmetic ?? {}) as Priced;
}

/** An item's price in emeralds, or null when it has none (free items). */
export function emeraldPrice(resolved: ResolvedCosmetic): number | null {
  const { priceHard, priceSoft } = priced(resolved);
  if (priceHard !== undefined) return priceHard;
  if (priceSoft !== undefined) return priceSoft / MEDALS_PER_EMERALD;
  return null;
}

export function rarityRank(resolved: ResolvedCosmetic): number {
  return RARITY_RANK[priced(resolved).rarity ?? "common"] ?? 0;
}

/**
 * The groups in the chosen order (a group is an item and its variants, sorted
 * by its first item). "featured" keeps the catalog's own order. Ties keep it
 * too, so the order never jumps around between renders.
 */
export function sortStoreGroups<G extends readonly ResolvedCosmetic[]>(
  groups: readonly G[],
  sort: StoreSort,
  label: (resolved: ResolvedCosmetic) => string,
): G[] {
  const list = [...groups];
  if (sort === "featured") return list;
  const price = (g: G) => emeraldPrice(g[0]);
  const compare = (a: G, b: G): number => {
    switch (sort) {
      case "price_asc":
      case "price_desc": {
        const pa = price(a);
        const pb = price(b);
        // Items without a price always come last.
        if (pa === null || pb === null)
          return (pa === null ? 1 : 0) - (pb === null ? 1 : 0);
        return sort === "price_asc" ? pa - pb : pb - pa;
      }
      case "rarity":
        return (
          rarityRank(b[0]) - rarityRank(a[0]) ||
          (price(b) ?? 0) - (price(a) ?? 0)
        );
      case "name":
        return label(a[0]).localeCompare(label(b[0]));
    }
  };
  return list
    .map((group, index) => ({ group, index }))
    .sort((a, b) => compare(a.group, b.group) || a.index - b.index)
    .map((entry) => entry.group);
}

export function savedStoreSort(): StoreSort {
  try {
    const saved = localStorage.getItem(SORT_KEY);
    return (STORE_SORTS as readonly string[]).includes(saved ?? "")
      ? (saved as StoreSort)
      : "featured";
  } catch {
    return "featured";
  }
}

export function saveStoreSort(sort: StoreSort): void {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    // The choice just won't be remembered.
  }
}
