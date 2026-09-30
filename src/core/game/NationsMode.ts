import { GameView, PlayerView } from "../../client/view";
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
  Tick,
  UnitType,
} from "./Game";
import { TileRef } from "./GameMap";

// Nations mode: every player starts as a real country of the giant world map,
// with its whole territory and a capital city on the real capital.

/** One country of the map's countries.json. */
export interface NationsCountry {
  name: string;
  /** Flag code, as in resources/flags. */
  flag?: string;
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
  /** Country id - 1 in countries.bin. */
  countries: NationsCountry[];
}

export interface NationsMapData {
  /** Per tile: country index + 1, or 0 for land no country owns. */
  ids: Uint8Array;
  countries: NationsCountry[];
}

/** A player of a Nations game and the country (index) they play. */
export interface NationsSeat {
  info: PlayerInfo;
  country: number;
}

export const NATIONS_MAX_PLAYERS = 80;
export const NATIONS_PERCENT_TILES_OWNED_TO_WIN = 50;
export const CAPITAL_GOLD_BONUS_PERCENT = 10;
export const CAPITAL_TROOP_GROWTH_BONUS_PERCENT = 10;
/**
 * For the first CAPITAL_SHIELD_SECONDS of the game, the land within
 * CAPITAL_SHIELD_RADIUS tiles of each country's original capital can't be
 * taken or bombed by anyone else, so no country is wiped out before it can
 * react.
 */
export const CAPITAL_SHIELD_RADIUS = 5;
export const CAPITAL_SHIELD_SECONDS = 60;
/** How long a player defends 10% worse after losing their capital. */
export const CAPITAL_FALLEN_DEBUFF_TICKS = 60 * 10;
export const CAPITAL_FALLEN_DEFENSE_MULT = 0.9;
/** How long before a player can proclaim a new capital. */
export const CAPITAL_REBUILD_DELAY_TICKS = 2 * 60 * 10;
/**
 * However small a country gets, it holds as many troops as a country of this
 * many tiles (the biggest third of the countries are larger), so small
 * countries aren't wiped out in the first minutes. Tuned with
 * tests/perf/fullgame/NationsBalanceSim.ts.
 */
export const NATIONS_MIN_TROOP_CAP_TILES = 20_000;
/** Alliances between neighbouring countries last this much longer. */
export const REGIONAL_ALLIANCE_DURATION_PERCENT = 150;
/**
 * A player left with this share of their home country may surrender to a
 * neighbour at war with them and become their vassal: for VASSAL_DURATION_TICKS
 * neither can attack the other, and the vassal pays VASSAL_TRIBUTE_PERCENT of
 * its gold income to its overlord.
 */
export const VASSAL_MAX_LAND_PERCENT = 25;
export const VASSAL_TRIBUTE_PERCENT = 25;
export const VASSAL_DURATION_TICKS = 10 * 60 * 10;
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
 * Small countries start richer so the lobby stays fair: the further below
 * NATIONS_MIN_TROOP_CAP_TILES, the more gold and troops, up to the maximum for
 * a country of (almost) no land. Countries at or above it get nothing.
 */
export function startCompensation(tiles: number): {
  gold: Gold;
  troops: number;
} {
  if (tiles >= NATIONS_MIN_TROOP_CAP_TILES) {
    return { gold: 0n, troops: 0 };
  }
  const deficit = 1 - tiles / NATIONS_MIN_TROOP_CAP_TILES;
  return {
    gold: BigInt(Math.floor(MAX_COMPENSATION_GOLD * deficit)),
    troops: Math.floor(MAX_COMPENSATION_TROOPS * deficit),
  };
}

/**
 * How long a new or extended alliance lasts. In Nations mode, neighbours
 * (sharing a border at that moment) get a regional alliance that lasts 50%
 * longer, so countries can build a stable front with the ones next door.
 */
export function allianceDurationBetween(
  game: Game,
  a: Player,
  b: Player,
): Tick {
  const base = game.config().allianceDuration();
  if (!isRegionalAlliance(game, a, b)) return base;
  return Math.floor((base * REGIONAL_ALLIANCE_DURATION_PERCENT) / 100);
}

export function isRegionalAlliance(game: Game, a: Player, b: Player): boolean {
  return game.config().isNationsMode() && a.sharesBorderWith(b);
}

/** Which of the two pays tribute to the other, if either. */
export function vassalSide(
  player: Player,
  other: Player,
): "self" | "other" | undefined {
  if (player.overlord() === other) return "self";
  if (other.overlord() === player) return "other";
  return undefined;
}

export function hasCapital(player: Player | PlayerView): boolean {
  return player.units(UnitType.City).some((u) => u.isCapital());
}

/** Seconds left of the capital shield (0 once it is over). */
export function capitalShieldSecondsLeft(game: Game | GameView): number {
  if (!game.config().isNationsMode()) return 0;
  return Math.max(0, CAPITAL_SHIELD_SECONDS - game.elapsedGameSeconds());
}

/**
 * Whether `by` may not take `tile` yet: it lies in the shielded zone around
 * its owner's original capital (their spawn tile in Nations mode).
 */
export function isCapitalShielded(
  game: Game,
  tile: TileRef,
  by: Player,
): boolean {
  if (capitalShieldSecondsLeft(game) <= 0) return false;
  const owner = game.owner(tile);
  if (!owner.isPlayer() || owner === by) return false;
  const capital = owner.spawnTile();
  return (
    capital !== undefined &&
    game.euclideanDistSquared(tile, capital) <=
      CAPITAL_SHIELD_RADIUS * CAPITAL_SHIELD_RADIUS
  );
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
      country !== undefined ? (countries[country].flag ?? null) : null,
      country !== undefined ? countries[country].name : null,
    );
    if (country !== undefined) seats.push({ info, country });
    return info;
  });

  const nations = free().map((country) => {
    const n = countries[country];
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
