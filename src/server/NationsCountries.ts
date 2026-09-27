import { GameMapType } from "../core/game/Game";
import { isPlayableCountry } from "../core/game/NationsMode";
import { NodeMapLoader } from "./NodeMapLoader";

let playable: Promise<(index: number) => boolean> | null = null;

// Whether a manifest nation of the giant world map can be picked in a Nations
// lobby. Read from disk once per process.
export function nationsPlayable(): Promise<(index: number) => boolean> {
  playable ??= (async () => {
    const json = await new NodeMapLoader().getMapData(GameMapType.GiantWorldMap)
      .countriesJson!();
    return (index: number) => isPlayableCountry(json.countries, index);
  })();
  return playable;
}
