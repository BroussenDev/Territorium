import { Cell, UnitType } from "../core/game/Game";
import { UserSettings } from "../core/game/UserSettings";
import { applyGraphicsOverrides } from "./render/gl/RenderOverrides";
import {
  createRenderSettings,
  type RenderSettings,
} from "./render/gl/RenderSettings";
import { renderDpr } from "./render/gl/utils/Dpr";
import type { TransformHandler } from "./TransformHandler";
import type { GameView, UnitView } from "./view";

// Finds the structure under the cursor. Structure icons are drawn at a screen
// size of their own (structure.vert.glsl), several tiles wide unless zoomed
// in close, so a click anywhere on the icon must pick it, not only a click
// on the few tiles around its centre.

type StructureSettings = RenderSettings["structure"];

// Extra pixels around an icon that still count as on it.
const SLACK_PX = 4;
// Never less than this, so the small dots of far zoom stay clickable.
const MIN_RADIUS_PX = 10;

/**
 * Radius on screen, in CSS pixels, of a structure icon drawn at `zoom`
 * (device pixels per tile): the same sizing as structure.vert.glsl.
 */
export function structureIconRadiusPx(
  s: StructureSettings,
  zoom: number,
  dpr: number,
  shapeScale: number,
): number {
  let iconScale: number;
  if (zoom <= s.dotsZoomThreshold) {
    iconScale = s.dotScale;
  } else if (zoom >= s.iconGrowZoom) {
    iconScale = zoom / s.iconGrowZoom;
  } else {
    iconScale = Math.min(1, zoom / s.iconScaleFactorZoomedOut);
  }
  return (s.iconSize * iconScale * shapeScale) / (2 * dpr);
}

export interface PickCandidate<T> {
  item: T;
  /** The icon's centre on screen, in CSS pixels. */
  x: number;
  y: number;
  /** The icon's radius on screen, in CSS pixels. */
  radius: number;
}

/** The candidate whose icon holds the point, the closest to its centre. */
export function pickAt<T>(
  candidates: Iterable<PickCandidate<T>>,
  x: number,
  y: number,
): T | null {
  let best: T | null = null;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.hypot(c.x - x, c.y - y);
    const reach = Math.max(c.radius, MIN_RADIUS_PX) + SLACK_PX;
    if (dist <= reach && dist < bestDist) {
      best = c.item;
      bestDist = dist;
    }
  }
  return best;
}

function structureSettings(): StructureSettings {
  const settings = createRenderSettings();
  applyGraphicsOverrides(settings, new UserSettings().graphicsOverrides());
  return settings.structure;
}

/**
 * The structure of one of `types` whose icon is under the screen point, and
 * that `accept` takes, or null.
 */
export function pickStructure(
  game: GameView,
  transform: TransformHandler,
  screenX: number,
  screenY: number,
  types: readonly UnitType[],
  accept: (unit: UnitView) => boolean,
): UnitView | null {
  const cell = transform.screenToWorldCoordinates(screenX, screenY);
  if (!game.isValidCoord(cell.x, cell.y)) return null;
  const s = structureSettings();
  const dpr = renderDpr();
  const zoom = transform.scale * dpr;
  const radiusOf = (type: UnitType) =>
    structureIconRadiusPx(s, zoom, dpr, s.shapes[type]?.scale ?? 1);
  // Search as far as the largest icon reaches, in tiles.
  const maxPx = Math.max(MIN_RADIUS_PX, ...types.map(radiusOf)) + SLACK_PX;
  const searchTiles = Math.ceil(maxPx / transform.scale) + 1;
  const candidates: PickCandidate<UnitView>[] = [];
  for (const { unit } of game.nearbyUnits(
    game.ref(cell.x, cell.y),
    searchTiles,
    types,
  )) {
    if (!accept(unit)) continue;
    const tile = unit.tile();
    const centre = transform.worldToScreenCoordinates(
      new Cell(game.x(tile) + 0.5, game.y(tile) + 0.5),
    );
    candidates.push({
      item: unit,
      x: centre.x,
      y: centre.y,
      radius: radiusOf(unit.type()),
    });
  }
  return pickAt(candidates, screenX, screenY);
}
