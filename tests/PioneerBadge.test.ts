import { describe, expect, it } from "vitest";
import { PlayerCosmeticRefsSchema, PlayerCosmetics } from "../src/core/Schemas";
import { PIONEER_FLARE, stampPioneer } from "../src/server/Privilege";

describe("stampPioneer", () => {
  it("stamps the badge for an account that holds it", () => {
    const cosmetics: PlayerCosmetics = {};
    stampPioneer(cosmetics, ["pattern:a", PIONEER_FLARE]);
    expect(cosmetics.pioneer).toBe(true);
  });

  it("removes a badge the account does not hold", () => {
    const cosmetics: PlayerCosmetics = { pioneer: true };
    stampPioneer(cosmetics, ["pattern:a"]);
    expect(cosmetics.pioneer).toBeUndefined();
    stampPioneer(cosmetics, undefined);
    expect(cosmetics.pioneer).toBeUndefined();
  });

  it("cannot be claimed in the cosmetics a client sends", () => {
    const refs = PlayerCosmeticRefsSchema.parse({ pioneer: true });
    expect(refs).not.toHaveProperty("pioneer");
  });
});
