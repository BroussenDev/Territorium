import { PlayerView } from "../../client/view";
import { PseudoRandom } from "../PseudoRandom";
import { GameStartInfo } from "../Schemas";
import {
  Cell,
  Game,
  Gold,
  Nation,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "./Game";
import { Nation as ManifestNation } from "./TerrainMapLoader";

// Nations mode: every player starts as a real country of the giant world map,
// with its whole territory and a capital city on the real capital.

/** One manifest nation, as listed in the map's countries.json. */
export interface NationsCountry {
  /** Real capital city name, absent for unplayable countries. */
  capital?: string;
  /** Tile the capital city is built on. */
  coordinates?: [number, number];
  /** Unplayable countries (Antarctica) stay neutral land. */
  playable: boolean;
  /** Land tiles of the country on the full-size map. */
  tiles: number;
}

export interface NationsCountriesFile {
  width: number;
  height: number;
  /** Indexed like the manifest's nations. */
  countries: NationsCountry[];
}

export interface NationsMapData {
  /** Per tile: manifest nation index + 1, or 0 for land no country owns. */
  ids: Uint8Array;
  countries: NationsCountry[];
}

/** A player of a Nations game and the country (manifest index) they play. */
export interface NationsSeat {
  info: PlayerInfo;
  country: number;
}

export const NATIONS_MAX_PLAYERS = 80;
export const NATIONS_PERCENT_TILES_OWNED_TO_WIN = 50;
export const CAPITAL_GOLD_BONUS_PERCENT = 10;
export const CAPITAL_TROOP_GROWTH_BONUS_PERCENT = 10;
/** How long a player defends 10% worse after losing their capital. */
export const CAPITAL_FALLEN_DEBUFF_TICKS = 60 * 10;
export const CAPITAL_FALLEN_DEFENSE_MULT = 0.9;
/** How long before a player can proclaim a new capital. */
export const CAPITAL_REBUILD_DELAY_TICKS = 2 * 60 * 10;
/** Most extra gold / troops the smallest country starts with. */
export const MAX_COMPENSATION_GOLD = 400_000;
export const MAX_COMPENSATION_TROOPS = 75_000;

/**
 * Decodes countries.bin: (id byte, LEB128 run length) pairs covering the map
 * row by row.
 */
export function decodeCountryIds(bin: Uint8Array, size: number): Uint8Array {
  const ids = new Uint8Array(size);
  let pos = 0;
  let i = 0;
  while (i < bin.length) {
    const id = bin[i++];
    let run = 0;
    let factor = 1;
    let byte: number;
    do {
      byte = bin[i++];
      run += (byte & 0x7f) * factor;
      factor *= 128;
    } while (byte & 0x80);
    if (pos + run > size) {
      throw new Error("countries.bin is larger than the map");
    }
    ids.fill(id, pos, pos + run);
    pos += run;
  }
  if (pos !== size) {
    throw new Error(`countries.bin covers ${pos} of ${size} tiles`);
  }
  return ids;
}

/**
 * Small countries start richer so the lobby stays fair: the further below the
 * median playable country, the more gold and troops, up to the maximum for a
 * country of (almost) no land. Countries at or above the median get nothing.
 */
export function startCompensation(
  tiles: number,
  medianTiles: number,
): { gold: Gold; troops: number } {
  if (medianTiles <= 0 || tiles >= medianTiles) {
    return { gold: 0n, troops: 0 };
  }
  const deficit = 1 - tiles / medianTiles;
  return {
    gold: BigInt(Math.floor(MAX_COMPENSATION_GOLD * deficit)),
    troops: Math.floor(MAX_COMPENSATION_TROOPS * deficit),
  };
}

export function medianPlayableTiles(countries: NationsCountry[]): number {
  const sizes = countries
    .filter((c) => c.playable)
    .map((c) => c.tiles)
    .sort((a, b) => a - b);
  if (sizes.length === 0) return 0;
  return sizes[Math.floor(sizes.length / 2)];
}

export function hasCapital(player: Player | PlayerView): boolean {
  return player.units(UnitType.City).some((u) => u.isCapital());
}

/** Within the minute of weakness after losing a capital. */
export function isCapitalFallen(game: Game, player: Player): boolean {
  const lost = player.capitalLostTick();
  return lost >= 0 && game.ticks() - lost < CAPITAL_FALLEN_DEBUFF_TICKS;
}

/** Ticks left before the player may proclaim a new capital (0 = now). */
export function capitalRebuildTicksLeft(
  lostTick: number,
  ticks: number,
): number {
  if (lostTick < 0) return 0;
  return Math.max(0, lostTick + CAPITAL_REBUILD_DELAY_TICKS - ticks);
}

export function isPlayableCountry(
  countries: NationsCountry[],
  index: number,
): boolean {
  return countries[index]?.playable === true;
}

/**
 * Seats a Nations game. Humans play the country the server stamped on them
 * (or, failing that, a free one drawn at random); every playable country left
 * over is played by a nation AI.
 */
export function seatNationsGame(
  players: GameStartInfo["players"],
  manifestNations: ManifestNation[],
  countries: NationsCountry[],
  random: PseudoRandom,
): { humans: PlayerInfo[]; nations: Nation[]; seats: NationsSeat[] } {
  const taken = new Set<number>();
  const wanted = players.map((p) => {
    const pick = p.nation;
    if (
      pick === undefined ||
      taken.has(pick) ||
      !isPlayableCountry(countries, pick)
    ) {
      return undefined;
    }
    taken.add(pick);
    return pick;
  });
  const free = () =>
    countries
      .map((_, i) => i)
      .filter((i) => isPlayableCountry(countries, i) && !taken.has(i));

  const seats: NationsSeat[] = [];
  const humans = players.map((p, k) => {
    let country = wanted[k];
    if (country === undefined) {
      const options = free();
      if (options.length > 0) {
        country = random.randElement(options);
        taken.add(country);
      }
    }
    const info = new PlayerInfo(
      p.username,
      PlayerType.Human,
      p.clientID,
      random.nextID(),
      p.isLobbyCreator ?? false,
      p.clanTag,
      p.friends ?? [],
      null,
      country !== undefined ? (manifestNations[country].flag ?? null) : null,
    );
    if (country !== undefined) seats.push({ info, country });
    return info;
  });

  const nations = free().map((country) => {
    const n = manifestNations[country];
    const info = new PlayerInfo(
      n.name,
      PlayerType.Nation,
      null,
      random.nextID(),
      false,
      null,
      [],
      null,
      n.flag ?? null,
    );
    seats.push({ info, country });
    const at = countries[country].coordinates;
    return new Nation(
      at !== undefined ? new Cell(at[0], at[1]) : undefined,
      info,
    );
  });
  return { humans, nations, seats };
}
