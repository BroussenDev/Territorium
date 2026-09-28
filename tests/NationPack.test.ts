import { describe, expect, it } from "vitest";
import {
  NATION_CROWN_NAME,
  stampNationCrest,
  wearerCrest,
  wearsNationPack,
} from "../src/core/NationPack";
import { PlayerCosmetics } from "../src/core/Schemas";

const clans = [
  { tag: "AAA", crest: "round:red:gold:star" },
  { tag: "BBB", crest: null },
];

describe("Nation pack crest", () => {
  it("shows the crest of the clan whose tag is worn, else the first clan", () => {
    expect(wearerCrest(clans, "bbb")).toEqual({
      tag: "BBB",
      crest: "shield:green:white:letter",
    });
    expect(wearerCrest(clans, null)).toEqual({
      tag: "AAA",
      crest: "round:red:gold:star",
    });
    expect(wearerCrest(clans, "ZZZ")?.tag).toBe("AAA");
    expect(wearerCrest([], "AAA")).toBeNull();
    expect(wearerCrest(undefined, "AAA")).toBeNull();
  });

  it("stamps the crest only on a Nation pack wearer", () => {
    const flag: PlayerCosmetics = {
      flag: "https://cdn/cosmetics/flags/etendard_national.svg",
    };
    expect(wearsNationPack(flag)).toBe(true);
    stampNationCrest(flag, clans, "AAA");
    expect(flag.clanCrest).toEqual({
      tag: "AAA",
      crest: "round:red:gold:star",
    });

    const crown: PlayerCosmetics = {
      crown: { name: NATION_CROWN_NAME, url: "/c.svg" },
    };
    stampNationCrest(crown, clans, null);
    expect(crown.clanCrest?.tag).toBe("AAA");

    const other: PlayerCosmetics = { flag: "/cosmetics/flags/echiquier.svg" };
    stampNationCrest(other, clans, "AAA");
    expect(other.clanCrest).toBeUndefined();

    const clanless: PlayerCosmetics = { ...flag, clanCrest: undefined };
    stampNationCrest(clanless, [], null);
    expect(clanless.clanCrest).toBeUndefined();
  });
});
