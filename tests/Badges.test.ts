import { describe, expect, it } from "vitest";
import {
  badgeFlare,
  NO_BADGE,
  ownedBadges,
  shownBadge,
} from "../src/core/Badges";
import { PlayerCosmetics } from "../src/core/Schemas";
import { stampBadge } from "../src/server/Privilege";

const PIONEER = badgeFlare("pionnier");

describe("shownBadge", () => {
  it("shows the first badge held when the player never picked", () => {
    expect(shownBadge(null, ["pattern:a", PIONEER])).toBe("pionnier");
    expect(shownBadge(undefined, ["pattern:a"])).toBeUndefined();
  });

  it("shows the picked badge only when it is held", () => {
    expect(shownBadge("pionnier", [PIONEER])).toBe("pionnier");
    expect(shownBadge("pionnier", [])).toBeUndefined();
    // An unknown pick falls back to what the player holds.
    expect(shownBadge("dragon", [PIONEER])).toBe("pionnier");
  });

  it("shows nothing when the player picked no badge", () => {
    expect(shownBadge(NO_BADGE, [PIONEER])).toBeUndefined();
  });

  it("lists the badges an account holds", () => {
    expect(ownedBadges([PIONEER, "flag:fr"])).toEqual(["pionnier"]);
    expect(ownedBadges(undefined)).toEqual([]);
  });
});

describe("stampBadge", () => {
  it("stamps the shown badge from the account's items", () => {
    const cosmetics: PlayerCosmetics = {};
    stampBadge(cosmetics, undefined, [PIONEER]);
    expect(cosmetics.badge).toBe("pionnier");
  });

  it("refuses a badge the account does not hold, whatever the client sends", () => {
    const cosmetics: PlayerCosmetics = { badge: "pionnier" };
    stampBadge(cosmetics, "pionnier", ["pattern:a"]);
    expect(cosmetics.badge).toBeUndefined();
  });

  it("removes the badge when the player picked none", () => {
    const cosmetics: PlayerCosmetics = {};
    stampBadge(cosmetics, NO_BADGE, [PIONEER]);
    expect(cosmetics.badge).toBeUndefined();
  });
});
