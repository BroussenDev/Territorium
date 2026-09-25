/**
 * Map objectives: a few round zones spread over the land. The side holding
 * most of a zone's land for CAPTURE_SECONDS takes it; while held, a zone adds
 * a small gold and troop-growth bonus to its holder (see Config.ts). The
 * holder keeps it until someone else captures it, so it can be defended by
 * retaking the ground before the capture completes. One player's bonus counts
 * at most half the zones (objectiveBonusCap): holding more denies them to the
 * others but pays nothing extra, so a leader cannot snowball on them.
 *
 * Shared by the sim (ObjectiveExecution) and the client, which reads the
 * same states from GameUpdateType.Objectives.
 */
import { PseudoRandom } from "../PseudoRandom";
import { GameMap, TileRef } from "./GameMap";

/** Seconds a side must hold a zone to capture it. */
export const OBJECTIVE_CAPTURE_SECONDS = 15;
/** Worker gold added per tick for each held objective, before multipliers. */
export const OBJECTIVE_GOLD_PER_TICK = 15n;
/** Troop growth bonus per held objective, in percent. */
export const OBJECTIVE_TROOP_GROWTH_PERCENT = 5;

export interface ObjectiveState {
  id: number;
  tile: TileRef;
  radius: number;
  /** smallID of the holder, 0 when nobody holds it. */
  holder: number;
  /** smallID of the side taking it, 0 when uncontested. */
  capturer: number;
  /** Seconds of capture so far, up to OBJECTIVE_CAPTURE_SECONDS. */
  progress: number;
}

/**
 * Most zones whose bonus one player collects: half of them, rounded up (2 of
 * 3 or 4, 3 of 5 or 6).
 */
export function objectiveBonusCap(numObjectives: number): number {
  return Math.ceil(numObjectives / 2);
}

/** How many objectives a map gets: more on bigger maps. */
export function objectiveCount(numLandTiles: number): number {
  return Math.min(6, Math.max(3, Math.floor(Math.sqrt(numLandTiles) / 160)));
}

/**
 * Zone radius in tiles: wider on bigger maps, and wide enough that a fresh
 * spawn alone does not hold most of it.
 */
export function objectiveRadius(numLandTiles: number): number {
  return Math.min(16, Math.max(5, Math.floor(Math.sqrt(numLandTiles) / 60)));
}

/** Calls fn for every tile within `radius` of `center`. */
export function forEachTileInZone(
  map: GameMap,
  center: TileRef,
  radius: number,
  fn: (tile: TileRef) => void,
): void {
  const cx = map.x(center);
  const cy = map.y(center);
  const r2 = radius * radius;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (!map.isValidCoord(x, y)) continue;
      fn(map.ref(x, y));
    }
  }
}

// A zone must be mostly land, so it can be fought over on foot.
const MIN_LAND_PERCENT = 80;
const CANDIDATES_PER_OBJECTIVE = 60;
const MAX_SAMPLES = 20000;
// Keep zones off the map's outer band (poles, far corners), where nobody
// fights over them.
const EDGE_MARGIN_PERCENT = 10;

function landPercent(map: GameMap, center: TileRef, radius: number): number {
  let land = 0;
  let total = 0;
  forEachTileInZone(map, center, radius, (tile) => {
    total++;
    if (map.isLand(tile)) land++;
  });
  return total === 0 ? 0 : Math.floor((land * 100) / total);
}

/**
 * Picks the objective centers: land tiles whose zone is mostly land, spread
 * out by keeping, for each objective, the candidate farthest from those
 * already placed. Deterministic for a given map and seed.
 */
export function placeObjectives(map: GameMap, seed: number): ObjectiveState[] {
  const random = new PseudoRandom(seed);
  const count = objectiveCount(map.numLandTiles());
  const radius = objectiveRadius(map.numLandTiles());
  const w = map.width();
  const h = map.height();
  const mx = Math.max(radius, Math.floor((w * EDGE_MARGIN_PERCENT) / 100));
  const my = Math.max(radius, Math.floor((h * EDGE_MARGIN_PERCENT) / 100));
  const placed: TileRef[] = [];
  let samples = 0;

  while (placed.length < count && samples < MAX_SAMPLES) {
    let best: TileRef | null = null;
    let bestDist = -1;
    let found = 0;
    while (found < CANDIDATES_PER_OBJECTIVE && samples < MAX_SAMPLES) {
      samples++;
      const x = random.nextInt(mx, Math.max(mx + 1, w - mx));
      const y = random.nextInt(my, Math.max(my + 1, h - my));
      if (!map.isValidCoord(x, y)) continue;
      const tile = map.ref(x, y);
      if (!map.isLand(tile)) continue;
      if (landPercent(map, tile, radius) < MIN_LAND_PERCENT) continue;
      found++;
      let dist = Number.MAX_SAFE_INTEGER;
      for (const other of placed) {
        dist = Math.min(dist, map.euclideanDistSquared(tile, other));
      }
      if (dist > bestDist) {
        best = tile;
        bestDist = dist;
      }
      // The first objective has nothing to keep away from.
      if (placed.length === 0) break;
    }
    if (best === null) break;
    // Zones must not overlap.
    if (placed.length > 0 && bestDist <= 4 * radius * radius) break;
    placed.push(best);
  }

  return placed.map((tile, id) => ({
    id,
    tile,
    radius,
    holder: 0,
    capturer: 0,
    progress: 0,
  }));
}
