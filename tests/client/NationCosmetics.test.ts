import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResolvedCosmetic } from "../../src/client/Cosmetics";
import {
  applyNationArt,
  clanNationArt,
  loadNationArt,
  nationCrownSvg,
  nationFlagSvg,
  wantsNationArt,
  withClanArt,
  withCrestPreview,
} from "../../src/client/NationCosmetics";
import { NATION_CROWN_NAME } from "../../src/core/NationPack";
import { PlayerCosmetics } from "../../src/core/Schemas";

const art = { flag: "data:flag", crown: "data:crown" };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Nation pack art", () => {
  it("draws the country flag into the standard and the crown", () => {
    for (const svg of [nationFlagSvg("data:x"), nationCrownSvg("data:x")]) {
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(doc.querySelector("parsererror")).toBeNull();
      expect(doc.querySelector("image")?.getAttribute("href")).toBe("data:x");
    }
  });

  it("only swaps the Nation pack items the player equipped", () => {
    const equipped: PlayerCosmetics = {
      flag: "/cosmetics/flags/etendard_national.svg",
      crown: { name: "laurier", url: "/cosmetics/crowns/laurier.svg" },
    };
    expect(wantsNationArt(equipped)).toBe(true);
    const shown: PlayerCosmetics = { ...equipped, flag: "/flags/fr.svg" };
    applyNationArt(shown, equipped, art);
    expect(shown.flag).toBe("data:flag");
    expect(shown.crown?.url).toBe("/cosmetics/crowns/laurier.svg");

    const crownOnly: PlayerCosmetics = {
      flag: "/cosmetics/flags/echiquier.svg",
      crown: { name: NATION_CROWN_NAME, url: "/c.svg" },
    };
    const shown2: PlayerCosmetics = { ...crownOnly, flag: "/flags/fr.svg" };
    applyNationArt(shown2, crownOnly, art);
    expect(shown2.flag).toBe("/flags/fr.svg");
    expect(shown2.crown).toEqual({
      name: NATION_CROWN_NAME,
      url: "data:crown",
    });

    expect(wantsNationArt({ flag: "/cosmetics/flags/echiquier.svg" })).toBe(
      false,
    );
  });

  it("draws each country once and keeps the plain flag on failure", async () => {
    const fetch = vi.fn(async (url: string) =>
      url.includes("/xx.svg")
        ? { ok: false, status: 404 }
        : { ok: true, text: async () => "<svg/>" },
    );
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const first = await loadNationArt("de");
    expect(first?.flag.startsWith("data:image/svg+xml")).toBe(true);
    expect(await loadNationArt("de")).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(1);

    expect(await loadNationArt("xx")).toBeNull();
  });

  it("draws the wearer's clan crest in the round, on the clan's colors", () => {
    const wearer = { tag: "AAA", crest: "round:red:gold:star" };
    const art = clanNationArt(wearer);
    expect(clanNationArt(wearer)).toBe(art);
    for (const url of [art.flag, art.crown]) {
      const svg = decodeURIComponent(url.split(",")[1]);
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(doc.querySelector("parsererror")).toBeNull();
      // The crest: its red field and gold charge.
      expect(doc.querySelector('[fill="#c0392b"]')).not.toBeNull();
      expect(doc.querySelector('[color="#f1c40f"]')).not.toBeNull();
      // The field behind it, quartered in the same colors.
      const field = atob(
        doc.querySelector("image")!.getAttribute("href")!.split(",")[1],
      );
      expect(field).toContain("#c0392b");
      expect(field).toContain("#f1c40f");
    }

    const letter = decodeURIComponent(
      clanNationArt({ tag: "bee", crest: "shield:navy:gold:letter" }).flag,
    );
    expect(letter).toContain(">B</text>");
  });

  it("puts the crest on the equipped Nation items, in game and in previews", () => {
    const wearer = { tag: "AAA", crest: "round:red:gold:star" };
    const art = clanNationArt(wearer);
    const equipped: PlayerCosmetics = {
      flag: "/cosmetics/flags/etendard_national.svg",
      crown: { name: NATION_CROWN_NAME, url: "/c.svg" },
      clanCrest: wearer,
    };
    const shown = withClanArt(equipped);
    expect(shown.flag).toBe(art.flag);
    expect(shown.crown?.url).toBe(art.crown);
    expect(equipped.flag).toBe("/cosmetics/flags/etendard_national.svg");
    const plain: PlayerCosmetics = { flag: "/cosmetics/flags/x.svg" };
    expect(withClanArt(plain)).toBe(plain);

    const item = {
      type: "flag",
      cosmetic: { name: "etendard_national", url: "/e.svg" },
    } as unknown as ResolvedCosmetic;
    expect(
      (withCrestPreview(item, wearer).cosmetic as { url: string }).url,
    ).toBe(art.flag);
    expect(withCrestPreview(item, null)).toBe(item);
  });

  it("puts the crest over the country flag in a Nations game", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, text: async () => "<svg/>" })),
    );
    const wearer = { tag: "AAA", crest: "round:red:gold:star" };
    const plain = await loadNationArt("it");
    const crested = await loadNationArt("it", wearer);
    expect(crested).not.toBe(plain);
    expect(decodeURIComponent(crested!.flag)).toContain("#c0392b");
    expect(decodeURIComponent(plain!.flag)).not.toContain("#c0392b");
  });
});
