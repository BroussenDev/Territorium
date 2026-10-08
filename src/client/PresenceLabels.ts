import { GameType } from "../core/game/Game";
import type { GameConfig } from "../core/Schemas";
import { getGameModeLabel, getMapName, translateText } from "./Utils";

/**
 * What friends read about the player's game on Steam and Discord, in the
 * player's language: the mode as the game names it (Conquest, Nations,
 * Versus, Ranked, Solo, or the free-for-all / team label) and the map.
 */
export function presenceLabels(config: GameConfig | undefined): {
  modeName?: string;
  mapName?: string;
} {
  if (config === undefined) return {};
  return {
    modeName: presenceModeName(config),
    mapName: getMapName(config.gameMap) ?? undefined,
  };
}

export function presenceModeName(config: GameConfig): string {
  if (config.rankedType !== undefined) {
    return translateText("player_stats_tree.ranked");
  }
  switch (config.gameVariant) {
    case "conquest":
      return translateText("game_modes.conquest_title");
    case "survival":
      return translateText("game_modes.survival_title");
    case "nations":
      return translateText("game_modes.nations_title");
    case "versus":
      return translateText("game_modes.versus_title");
    case "training":
      return translateText("main.tutorial");
  }
  if (config.gameType === GameType.Singleplayer) {
    return translateText("main.solo");
  }
  return getGameModeLabel(config);
}
