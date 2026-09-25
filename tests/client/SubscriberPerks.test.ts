import { html, render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Api", () => ({
  changeSubscriptionTier: vi.fn(),
  getApiBase: vi.fn(() => "https://api.test"),
  getUserMe: vi.fn(async () => false),
  invalidateUserMe: vi.fn(),
  purchaseCosmeticPack: vi.fn(),
  purchaseWithCurrency: vi.fn(),
}));

vi.mock("../../src/client/InGameModal", () => ({
  showInGameAlert: vi.fn(async () => true),
  showInGameConfirm: vi.fn(async () => true),
}));

vi.mock("../../src/client/Utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Utils")>()),
  translateText: vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key} ${JSON.stringify(params)}` : key,
  ),
}));

import { getUserMe, purchaseWithCurrency } from "../../src/client/Api";
import type { ResolvedCosmetic } from "../../src/client/Cosmetics";
import {
  discountedPrice,
  purchaseCosmetic,
  shopDiscountPercent,
  subscriptionPerks,
} from "../../src/client/Cosmetics";
import { goldFramed } from "../../src/client/components/leaderboard/GoldFrame";
import type { UserMeResponse } from "../../src/core/ApiSchemas";
import type { Flag, Subscription } from "../../src/core/CosmeticSchemas";

const getUserMeMock = getUserMe as unknown as ReturnType<typeof vi.fn>;
const purchaseMock = purchaseWithCurrency as unknown as ReturnType<
  typeof vi.fn
>;

function userMe(hard: number, soft: number, discount?: number) {
  return {
    user: {},
    player: {
      publicId: "aB3xK9zQ",
      currency: { hard, soft },
      ...(discount === undefined ? {} : { shopDiscountPercent: discount }),
    },
  } as unknown as UserMeResponse;
}

const FLAG = {
  name: "lion",
  priceHard: 100,
  priceSoft: 100,
  rarity: "rare",
} as unknown as Flag;

const flag: ResolvedCosmetic = {
  type: "flag",
  cosmetic: FLAG,
  colorPalette: null,
  relationship: "purchasable",
  key: "flag:lion",
} as ResolvedCosmetic;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("discountedPrice", () => {
  it("takes the discount off, rounded in the player's favour", () => {
    expect(discountedPrice(100, 10)).toBe(90);
    // 15% of 250 is 37.5: the player saves 38.
    expect(discountedPrice(250, 15)).toBe(212);
    expect(discountedPrice(1, 5)).toBe(0);
  });

  it("leaves the price alone without a discount", () => {
    expect(discountedPrice(250, 0)).toBe(250);
  });
});

describe("shopDiscountPercent", () => {
  it("reads the subscriber discount, zero for guests and older APIs", () => {
    expect(shopDiscountPercent(false)).toBe(0);
    expect(shopDiscountPercent(userMe(0, 0))).toBe(0);
    expect(shopDiscountPercent(userMe(0, 0, 15))).toBe(15);
  });
});

describe("subscriptionPerks", () => {
  const tier = (over: Partial<Subscription>) =>
    ({ name: "souverain", ...over }) as unknown as Subscription;

  it("lists nothing for a tier without perks", () => {
    expect(subscriptionPerks(tier({}))).toEqual([]);
  });

  it("lists the discount, history, gold frame and gift", () => {
    const labels = subscriptionPerks(
      tier({
        queuePriority: true,
        shopDiscountPercent: 15,
        historyDays: 365,
        goldFrame: true,
        giftFlare: "crown:couronne_souveraine",
      }),
    ).map((p) => p.label);
    expect(labels).toEqual([
      "cosmetics.queue_priority",
      'cosmetics.shop_discount {"percent":15}',
      'cosmetics.history_days {"days":365}',
      "cosmetics.gold_frame",
      'cosmetics.subscription_gift {"name":"Couronne Souveraine"}',
    ]);
  });
});

describe("purchaseCosmetic with a subscriber discount", () => {
  it("checks the balance against the discounted emerald price", async () => {
    getUserMeMock.mockResolvedValue(userMe(80, 0, 10));
    const result = await purchaseCosmetic(flag, "hard");
    // 100 emeralds at -10% is 90: 80 in the wallet leaves 10 to find.
    expect(result).toMatchObject({ shortfall: 10, canTopUp: true });
    expect(purchaseMock).not.toHaveBeenCalled();
  });

  it("buys when the wallet covers the discounted price", async () => {
    getUserMeMock.mockResolvedValue(userMe(90, 0, 10));
    purchaseMock.mockResolvedValue({ ok: false, code: "debt", debt: 1 });
    await purchaseCosmetic(flag, "hard");
    expect(purchaseMock).toHaveBeenCalledWith(
      "flag",
      "lion",
      "hard",
      undefined,
    );
  });

  it("never discounts medal prices", async () => {
    getUserMeMock.mockResolvedValue(userMe(0, 80, 10));
    const result = await purchaseCosmetic(flag, "soft");
    expect(result).toMatchObject({ shortfall: 20, canTopUp: false });
  });
});

describe("goldFramed", () => {
  const draw = (framed: boolean | undefined) => {
    const host = document.createElement("div");
    render(goldFramed(framed, html`<span>Alice</span>`), host);
    return host;
  };

  it("wraps the name in a gold frame for the top tier", () => {
    const host = draw(true);
    const frame = host.querySelector("[data-gold-frame]");
    expect(frame?.textContent).toBe("Alice");
    expect(frame?.getAttribute("title")).toBe("leaderboard_modal.gold_frame");
  });

  it("leaves everyone else's name bare", () => {
    expect(draw(false).querySelector("[data-gold-frame]")).toBeNull();
    expect(draw(undefined).textContent).toBe("Alice");
  });
});
