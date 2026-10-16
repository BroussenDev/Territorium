import { GameConfig } from "../Schemas";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  HumansVsNations,
} from "./Game";
import { GameMap, TileRef } from "./GameMap";
import { placeCircles } from "./Objectives";

// Survival mode (gameVariant "survival"): every human on one team against
// waves of AI invaders. The defenders win by holding out until
// SURVIVAL_HOLD_TICKS after the last wave, or at once by bringing down the
// warlord who leads it; the game is lost when no defender is left.
//
// The invaders play under the human rules (same troop growth and gold as a
// player, see Config) whatever the lobby's difficulty. What grows from wave
// to wave is how many land and what they land with: each wave is measured
// against the defenders as they stand when it lands (see
// survivalLandingStrength), so a late wave threatens a late-game empire the
// way the first one threatens a fresh start.

/**
 * - normal: the main body of invaders;
 * - blitz: half as many, landing soon after the wave before, before the
 *   defenders have rebuilt;
 * - boss: one warlord, far stronger than any defender, with an escort.
 */
export type SurvivalWaveKind = "normal" | "blitz" | "boss";

/** Each wave's kind, in landing order. */
export const SURVIVAL_SCHEDULE: readonly SurvivalWaveKind[] = [
  "normal",
  "normal",
  "blitz",
  "normal",
  "boss",
  "normal",
  "blitz",
  "normal",
  "normal",
  "boss",
];

/** Waves in a game. */
export const SURVIVAL_WAVES = SURVIVAL_SCHEDULE.length;

/** Ticks after the spawn phase before the first wave lands (1 minute). */
export const SURVIVAL_FIRST_WAVE_DELAY_TICKS = 60 * 10;

/** Ticks between a wave and the next (1 minute 45). */
export const SURVIVAL_WAVE_INTERVAL_TICKS = 105 * 10;

/** Ticks between a wave and a blitz wave right behind it (50 seconds). */
export const SURVIVAL_BLITZ_DELAY_TICKS = 50 * 10;

/** How long the defenders must hold out after the last wave (2:30). */
export const SURVIVAL_HOLD_TICKS = 150 * 10;

/** Most invaders a single wave brings, whatever the number of defenders. */
export const SURVIVAL_MAX_WAVE_SIZE = 40;

/** Most defenders in a Survival game: every one more brings bigger waves,
 *  so the game stays a team, not a crowd. */
export const SURVIVAL_MAX_PLAYERS = 16;

/** The kind of wave `wave` (1-based). */
export function survivalWaveKind(wave: number): SurvivalWaveKind {
  return SURVIVAL_SCHEDULE[wave - 1] ?? "normal";
}

/**
 * Invaders in wave `wave` (1-based) against `defenders` humans. A normal
 * wave brings three quarters of the defenders at first, a quarter more each
 * wave (three times the defenders by the tenth); a blitz wave half that; a
 * boss wave its warlord and half that as escort.
 */
export function survivalWaveSize(wave: number, defenders: number): number {
  const base = Math.round((defenders * (2 + wave)) / 4);
  const size =
    survivalWaveKind(wave) === "normal" ? base : 1 + Math.floor(base / 2);
  return Math.min(SURVIVAL_MAX_WAVE_SIZE, Math.max(1, size));
}

/**
 * When wave `wave` (1-based) lands, in ticks since the spawn phase ended
 * (Game.ticksSinceStart).
 */
export function survivalWaveTick(wave: number): number {
  let tick = SURVIVAL_FIRST_WAVE_DELAY_TICKS;
  for (let w = 2; w <= wave; w++) {
    tick +=
      survivalWaveKind(w) === "blitz"
        ? SURVIVAL_BLITZ_DELAY_TICKS
        : SURVIVAL_WAVE_INTERVAL_TICKS;
  }
  return tick;
}

/**
 * Where a game stands `sinceStart` ticks after the spawn phase: the last
 * wave that landed (0 before the first) and when the next one lands, in the
 * same ticks (null once all have).
 */
export function survivalWaveState(sinceStart: number): {
  wave: number;
  nextWaveTick: number | null;
} {
  let wave = 0;
  while (wave < SURVIVAL_WAVES && survivalWaveTick(wave + 1) <= sinceStart) {
    wave++;
  }
  return {
    wave,
    nextWaveTick: wave < SURVIVAL_WAVES ? survivalWaveTick(wave + 1) : null,
  };
}

/** What the defenders stand at when a wave lands (averages over the alive). */
export interface SurvivalDefenderLevel {
  troops: number;
  tiles: number;
}

/**
 * What one invader of wave `wave` lands with, against defenders at `level`:
 * - troops: a share of the defenders' average troops, rising wave after
 *   wave (never below `startTroops`, a player's starting troops);
 * - capTiles: the land its troop cap counts at least (Config.maxTroops), a
 *   share of the defenders' average land, so the troops it lands with fit
 *   under its cap instead of draining away (the beachhead of a fleet, not a
 *   bonus: it grows its troops like any player from there).
 * A boss wave's warlord lands with more troops than the average defender
 * holds, its escort like any invader.
 */
export function survivalLandingStrength(
  wave: number,
  role: "invader" | "boss",
  level: SurvivalDefenderLevel,
  startTroops: number,
): { troops: number; capTiles: number } {
  const troopShare =
    role === "boss"
      ? wave >= SURVIVAL_WAVES
        ? SURVIVAL_FINAL_BOSS_TROOP_SHARE
        : SURVIVAL_BOSS_TROOP_SHARE
      : SURVIVAL_FIRST_TROOP_SHARE + SURVIVAL_TROOP_SHARE_STEP * (wave - 1);
  const tileShare =
    role === "boss" ? SURVIVAL_BOSS_CAP_TILE_SHARE : SURVIVAL_CAP_TILE_SHARE;
  return {
    troops: Math.max(startTroops, Math.round(level.troops * troopShare)),
    capTiles: Math.round(level.tiles * tileShare),
  };
}

// Landing strength (survivalLandingStrength), tuned by simulating whole
// games on the Survival maps with Hard nations playing the defenders: they
// fall around wave 7 of 10, so a coordinated human team can go the
// distance while a late wave still threatens a late-game empire.
const SURVIVAL_FIRST_TROOP_SHARE = 0.15;
const SURVIVAL_TROOP_SHARE_STEP = 0.025;
const SURVIVAL_BOSS_TROOP_SHARE = 1.25;
const SURVIVAL_FINAL_BOSS_TROOP_SHARE = 2;
const SURVIVAL_CAP_TILE_SHARE = 0.4;
const SURVIVAL_BOSS_CAP_TILE_SHARE = 2;

/** The regional maps Survival plays on (room for the waves to land). */
export const SURVIVAL_MAPS: readonly GameMapType[] = [
  GameMapType.Europe,
  GameMapType.Africa,
  GameMapType.NorthAmerica,
  GameMapType.SouthAmerica,
  GameMapType.Asia,
  GameMapType.Australia,
  GameMapType.Mena,
  GameMapType.Mars,
];

/**
 * A Survival game's rules, fixed whoever hosts it (public lobby, private
 * lobby, solo): only the map, among SURVIVAL_MAPS, is the host's choice.
 */
export function survivalGameConfig(
  gameType: GameType,
  gameMap: GameMapType,
): GameConfig {
  return {
    gameMap: SURVIVAL_MAPS.includes(gameMap) ? gameMap : SURVIVAL_MAPS[0],
    gameMapSize: GameMapSize.Normal,
    gameType,
    gameMode: GameMode.Team,
    playerTeams: HumansVsNations,
    maxPlayers:
      gameType === GameType.Singleplayer ? undefined : SURVIVAL_MAX_PLAYERS,
    difficulty: Difficulty.Hard,
    nations: "default",
    // No tribes: the open land is where the invaders arrive.
    bots: 0,
    donateGold: true,
    donateTroops: true,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
    disabledUnits: [],
    disableClanTags: true,
    overtime: { enabled: false },
    publicGameModifiers: {},
    gameVariant: "survival",
  };
}

/** Where a Survival game stands, published to the clients (GameView). */
export interface SurvivalStatus {
  /** Waves landed so far. */
  wavesLanded: number;
  /** The warlords landed so far, in order. */
  bosses: SurvivalBoss[];
  /** Invaders each defender has eliminated, keyed by smallID. */
  eliminations: Record<number, number>;
}

export interface SurvivalBoss {
  smallID: number;
  wave: number;
}

export function emptySurvivalStatus(): SurvivalStatus {
  return { wavesLanded: 0, bosses: [], eliminations: {} };
}

/** Landing zones reserved for the invaders. */
export const SURVIVAL_ZONES = 4;

// Share of the land the landing zones cover together.
const SURVIVAL_ZONE_LAND_SHARE = 0.12;

/**
 * A landing zone: open land the defenders cannot take, kept for the waves
 * to land on (they can still fight the invaders inside it).
 */
export interface SurvivalZone {
  x: number;
  y: number;
  radius: number;
}

/** Radius of each landing zone, so that together they cover ~12% of land. */
export function survivalZoneRadius(landTiles: number): number {
  const area = (landTiles * SURVIVAL_ZONE_LAND_SHARE) / SURVIVAL_ZONES;
  return Math.max(8, Math.round(Math.sqrt(area / Math.PI)));
}

/** The landing zones of a game, spread over the map (deterministic). */
export function placeSurvivalZones(map: GameMap, seed: number): SurvivalZone[] {
  const radius = survivalZoneRadius(map.numLandTiles());
  return placeCircles(map, seed, SURVIVAL_ZONES, radius).map((tile) => ({
    x: map.x(tile),
    y: map.y(tile),
    radius,
  }));
}

/** Whether `tile` lies in one of the landing zones. */
export function inSurvivalZone(
  map: GameMap,
  zones: readonly SurvivalZone[],
  tile: TileRef,
): boolean {
  if (zones.length === 0) return false;
  const x = map.x(tile);
  const y = map.y(tile);
  for (const z of zones) {
    const dx = x - z.x;
    const dy = y - z.y;
    if (dx * dx + dy * dy <= z.radius * z.radius) return true;
  }
  return false;
}
