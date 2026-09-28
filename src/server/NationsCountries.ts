import { GameMapType } from "../core/game/Game";
import { isPlayableCountry } from "../core/game/NationsMode";
import { NodeMapLoader } from "./NodeMapLoader";

let playable: Promise<(index: number) => boolean> | null = null;
let playableIndexes: number[] | null = null;

// Whether a country of the giant world map (countries.json index) can be
// picked in a Nations lobby. Read from disk once per process.
export function nationsPlayable(): Promise<(index: number) => boolean> {
  playable ??= (async () => {
    const json = await new NodeMapLoader().getMapData(GameMapType.GiantWorldMap)
      .countriesJson!();
    playableIndexes = json.countries
      .map((_, i) => i)
      .filter((i) => isPlayableCountry(json.countries, i));
    return (index: number) => isPlayableCountry(json.countries, index);
  })();
  return playable;
}

// The playable countries, once nationsPlayable() has loaded them.
export function loadedPlayableNations(): readonly number[] | null {
  return playableIndexes;
}

// Hands every player without a country a free playable one, drawn with
// random() in [0, 1). picks: each player's country or undefined, in order.
// Players stay without one when no country is left.
export function assignFreeNations(
  picks: (number | undefined)[],
  playable: readonly number[],
  random: () => number,
): (number | undefined)[] {
  const taken = new Set(picks.filter((p) => p !== undefined));
  const free = playable.filter((i) => !taken.has(i));
  return picks.map((pick) => {
    if (pick !== undefined || free.length === 0) return pick;
    const k = Math.floor(random() * free.length);
    return free.splice(k, 1)[0];
  });
}
