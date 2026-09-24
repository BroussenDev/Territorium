import { beforeEach, describe, expect, it, vi } from "vitest";

// Subscriptions and currency packs priced in medals or emeralds are paid from
// the wallet through POST /shop/purchase, never through a checkout.

vi.mock("../../src/client/Api", () => ({
  changeSubscriptionTier: vi.fn(),
  getApiBase: vi.fn(() => "https://api.test"),
  getUserMe: vi.fn(async () => false),
  invalidateUserMe: vi.fn(),
  purchaseCosmeticPack: vi.fn(),
  purchaseWithCurrency: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../src/client/InGameModal", () => ({
  showInGameAlert: vi.fn(async () => true),
  showInGameConfirm: vi.fn(async () => true),
}));

vi.mock("../../src/client/Utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Utils")>()),
  translateText: vi.fn((key: string) => key),
}));

vi.mock("../../src/client/Payments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Payments")>()),
  startPurchase: vi.fn(async () => ({ outcome: "redirecting" })),
}));

import { getUserMe, purchaseWithCurrency } from "../../src/client/Api";
import type { ResolvedCosmetic } from "../../src/client/Cosmetics";
import { purchaseCosmetic } from "../../src/client/Cosmetics";
import {
  showInGameAlert,
  showInGameConfirm,
} from "../../src/client/InGameModal";
import { startPurchase } from "../../src/client/Payments";
import type { Pack, Subscription } from "../../src/core/CosmeticSchemas";

const getUserMeMock = vi.mocked(getUserMe);
const purchaseMock = vi.mocked(purchaseWithCurrency);
const confirmMock = vi.mocked(showInGameConfirm);
const alertMock = vi.mocked(showInGameAlert);

function signedIn(soft: number, hard: number, tier: string | null = null) {
  getUserMeMock.mockResolvedValue({
    user: {},
    player: {
      currency: { soft, hard },
      subscription:
        tier === null
          ? null
          : {
              tier,
              status: "active",
              cancelAtPeriodEnd: true,
              currentPeriodEnd: new Date(Date.now() + 86_400_000),
              provider: null,
            },
    },
  } as never);
}

const sub = (name: string): ResolvedCosmetic =>
  ({
    type: "subscription",
    cosmetic: {
      name,
      priceSoft: 2500,
      priceHard: 250,
    } as unknown as Subscription,
    colorPalette: null,
    relationship: "purchasable",
    key: `subscription:${name}`,
  }) as ResolvedCosmetic;

const pack: ResolvedCosmetic = {
  type: "pack",
  cosmetic: {
    name: "bourse",
    displayName: "Bourse",
    priceSoft: 600,
  } as unknown as Pack,
  colorPalette: null,
  relationship: "purchasable",
  key: "pack:bourse",
};

beforeEach(() => {
  vi.clearAllMocks();
  purchaseMock.mockResolvedValue({ ok: true });
  confirmMock.mockResolvedValue(true);
});

describe("purchaseCosmetic with medals or emeralds", () => {
  it("buys a subscription from the wallet, not through a checkout", async () => {
    signedIn(3000, 0);
    await purchaseCosmetic(sub("vassal"), "soft");
    expect(purchaseMock).toHaveBeenCalledWith("subscription", "vassal", "soft");
    expect(startPurchase).not.toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
    expect(alertMock).toHaveBeenCalledWith(
      "store.subscription_purchase_success",
    );
  });

  it("extends the held tier without asking", async () => {
    signedIn(3000, 0, "vassal");
    await purchaseCosmetic(sub("vassal"), "soft");
    expect(confirmMock).not.toHaveBeenCalled();
    expect(purchaseMock).toHaveBeenCalledOnce();
  });

  it("asks before switching tier, and stops if the player declines", async () => {
    signedIn(0, 500, "vassal");
    confirmMock.mockResolvedValue(false);
    await purchaseCosmetic(sub("seigneur"), "hard");
    expect(confirmMock).toHaveBeenCalledOnce();
    expect(purchaseMock).not.toHaveBeenCalled();
  });

  it("reports the shortfall before any request", async () => {
    signedIn(100, 0);
    const result = await purchaseCosmetic(pack, "soft");
    expect(result).toMatchObject({ shortfall: 500, canTopUp: false });
    expect(purchaseMock).not.toHaveBeenCalled();
  });

  it("buys a currency pack with medals", async () => {
    signedIn(600, 0);
    await purchaseCosmetic(pack, "soft");
    expect(purchaseMock).toHaveBeenCalledWith("pack", "bourse", "soft");
    expect(alertMock).toHaveBeenCalledWith(
      "store.currency_pack_purchase_success",
    );
  });
});
