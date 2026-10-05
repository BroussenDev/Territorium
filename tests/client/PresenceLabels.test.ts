import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", () => ({
  translateText: (key: string) => key,
  getGameModeLabel: () => "game_mode.ffa",
  getMapName: (map: string | undefined) => (map ? `map.${map}` : null),
}));

import { presenceLabels } from "../../src/client/PresenceLabels";
import { GameMode, GameType, RankedType } from "../../src/core/game/Game";
import type { GameConfig } from "../../src/core/Schemas";

const config = (extra: Partial<GameConfig>) =>
  ({
    gameMap: "Europe",
    gameMode: GameMode.FFA,
    gameType: GameType.Public,
    ...extra,
  }) as GameConfig;

describe("presence labels", () => {
  it("names Territorium's own modes", () => {
    expect(presenceLabels(config({ gameVariant: "conquest" }))).toEqual({
      modeName: "game_modes.conquest_title",
      mapName: "map.Europe",
    });
    expect(presenceLabels(config({ gameVariant: "nations" })).modeName).toBe(
      "game_modes.nations_title",
    );
    expect(presenceLabels(config({ gameVariant: "versus" })).modeName).toBe(
      "game_modes.versus_title",
    );
  });

  it("names ranked, solo and plain games", () => {
    expect(
      presenceLabels(config({ rankedType: RankedType.OneVOne })).modeName,
    ).toBe("player_stats_tree.ranked");
    expect(
      presenceLabels(config({ gameType: GameType.Singleplayer })).modeName,
    ).toBe("main.solo");
    expect(presenceLabels(config({})).modeName).toBe("game_mode.ffa");
  });

  it("says nothing without a game", () => {
    expect(presenceLabels(undefined)).toEqual({});
  });
});
