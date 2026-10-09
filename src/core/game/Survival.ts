import { GameMap, TileRef } from "./GameMap";
import { placeCircles } from "./Objectives";

// Survival mode (gameVariant "survival"): every human on one team against
// waves of AI invaders that grow with each wave. Survive the last wave and
// wipe it out to win; the game is lost when no defender is left.
//
// The invaders never cheat: they play under the human rules (same starting
// troops, troop cap and growth as a player, see Config) whatever the
// lobby's difficulty, and grow stronger only by their numbers.

/** Waves in a game. */
export const SURVIVAL_WAVES = 10;

/** Ticks after the spawn phase before the first wave lands (1 minute). */
export const SURVIVAL_FIRST_WAVE_DELAY_TICKS = 60 * 10;

/** Ticks between two waves (2 minutes 30). */
export const SURVIVAL_WAVE_INTERVAL_TICKS = 150 * 10;

/** Most invaders a single wave brings, whatever the number of defenders. */
export const SURVIVAL_MAX_WAVE_SIZE = 40;

/**
 * Invaders in wave `wave` (1-based) against `defenders` humans: three
 * quarters of the defenders at first, a quarter more each wave, so the last
 * wave brings three times as many invaders as there are defenders.
 */
export function survivalWaveSize(wave: number, defenders: number): number {
  const size = Math.round((defenders * (2 + wave)) / 4);
  return Math.min(SURVIVAL_MAX_WAVE_SIZE, Math.max(1, size));
}

/**
 * When wave `wave` (1-based) lands, in ticks since the spawn phase ended
 * (Game.ticksSinceStart).
 */
export function survivalWaveTick(wave: number): number {
  return (
    SURVIVAL_FIRST_WAVE_DELAY_TICKS + (wave - 1) * SURVIVAL_WAVE_INTERVAL_TICKS
  );
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
