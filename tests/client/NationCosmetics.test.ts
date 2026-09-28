import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyNationArt,
  loadNationArt,
  NATION_CROWN_NAME,
  nationCrownSvg,
  nationFlagSvg,
  wantsNationArt,
} from "../../src/client/NationCosmetics";
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
});
