import { beforeEach, describe, expect, it } from "vitest";
import { equipCosmetic, ResolvedCosmetic } from "../../src/client/Cosmetics";
import { PATTERN_KEY, UserSettings } from "../../src/core/game/UserSettings";

function resetSettings(): void {
  UserSettings.setPlayerId(null);
  localStorage.clear();
  (
    UserSettings as unknown as { cache: Map<string, string | null> }
  ).cache.clear();
}

const item = (over: Partial<ResolvedCosmetic>): ResolvedCosmetic =>
  ({
    colorPalette: null,
    relationship: "owned",
    ...over,
  }) as ResolvedCosmetic;

describe("equipCosmetic", () => {
  beforeEach(resetSettings);

  it("wears what was just bought, each kind in its own slot", () => {
    const settings = new UserSettings();
    equipCosmetic(
      item({
        type: "pattern",
        cosmetic: { name: "stripes" } as ResolvedCosmetic["cosmetic"],
        colorPalette: { name: "ocean" } as ResolvedCosmetic["colorPalette"],
        key: "pattern:stripes:ocean",
      }),
      settings,
    );
    expect(localStorage.getItem(PATTERN_KEY)).toBe("pattern:stripes:ocean");

    equipCosmetic(
      item({
        type: "flag",
        cosmetic: { name: "etendard" } as ResolvedCosmetic["cosmetic"],
        key: "flag:etendard",
      }),
      settings,
    );
    expect(settings.getFlag()).toBe("flag:etendard");

    equipCosmetic(
      item({
        type: "crown",
        cosmetic: { name: "couronne" } as ResolvedCosmetic["cosmetic"],
        key: "crown:couronne",
      }),
      settings,
    );
    expect(settings.getSelectedCrownName()).toBe("couronne");

    equipCosmetic(
      item({
        type: "effect",
        cosmetic: {
          name: "gold_wake",
          effectType: "transportShipTrail",
        } as unknown as ResolvedCosmetic["cosmetic"],
        key: "effect:transportShipTrail:gold_wake",
        effectType: "transportShipTrail",
      }),
      settings,
    );
    expect(settings.getSelectedEffectName("transportShipTrail")).toBe(
      "gold_wake",
    );
  });

  it("puts a nuke explosion in its bomb's slot", () => {
    const settings = new UserSettings();
    equipCosmetic(
      item({
        type: "effect",
        cosmetic: {
          name: "big_boom",
          effectType: "nukeExplosion",
          attributes: { nukeType: "Hydrogen Bomb" },
        } as unknown as ResolvedCosmetic["cosmetic"],
        key: "effect:nukeExplosion:big_boom",
        effectType: "nukeExplosion",
      }),
      settings,
    );
    expect(settings.getSelectedEffectName("Hydrogen Bomb")).toBe("big_boom");
  });
});
