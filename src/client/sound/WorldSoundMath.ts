import { UnitType } from "../../core/game/Game";
import type { SoundEffect } from "./Sounds";

// Pure decisions behind the synthesized world sounds: which cue a structure
// gets and how loud each ambient layer is. No audio objects in here, so it is
// all unit-testable; WorldSynth turns the numbers into sound.

/** A placement cue the client synthesizes itself. */
export type PlacementSound =
  | "city"
  | "port"
  | "factory"
  | "station"
  | "defense-post"
  | "missile-silo"
  | "sam"
  | "radar"
  | "warship";

const PLACEMENT_BY_TYPE: ReadonlyMap<UnitType, PlacementSound> = new Map([
  [UnitType.City, "city"],
  [UnitType.Port, "port"],
  [UnitType.Factory, "factory"],
  [UnitType.DefensePost, "defense-post"],
  [UnitType.MissileSilo, "missile-silo"],
  [UnitType.SAMLauncher, "sam"],
  [UnitType.Radar, "radar"],
  [UnitType.Warship, "warship"],
]);

/** The synthesized cue for a structure type, null when it has none. */
export function placementSoundFor(type: UnitType): PlacementSound | null {
  return PLACEMENT_BY_TYPE.get(type) ?? null;
}

// What played before the synthesized cues, kept for when "World sounds" is off.
const LEGACY_EFFECT: Record<PlacementSound, SoundEffect> = {
  city: "build-city",
  port: "build-port",
  factory: "build-factory",
  station: "build-train-station",
  "defense-post": "build-defense-post",
  "missile-silo": "silo-built",
  sam: "sam-built",
  radar: "sam-built",
  warship: "build-warship",
};

export type PlacementCue =
  | { kind: "world"; sound: PlacementSound }
  | { kind: "effect"; effect: SoundEffect };

/** What to play when a structure of `type` is placed (null = nothing). */
export function placementCueFor(
  type: UnitType,
  worldSoundsOn: boolean,
): PlacementCue | null {
  const sound = placementSoundFor(type);
  if (sound === null) return null;
  return worldSoundsOn
    ? { kind: "world", sound }
    : { kind: "effect", effect: LEGACY_EFFECT[sound] };
}

/** The train station cue, which has no unit type of its own. */
export function stationCue(worldSoundsOn: boolean): PlacementCue {
  return worldSoundsOn
    ? { kind: "world", sound: "station" }
    : { kind: "effect", effect: LEGACY_EFFECT.station };
}

export type AmbienceLayer = "city" | "port" | "factory" | "rail";
export const AMBIENCE_LAYERS: readonly AmbienceLayer[] = [
  "city",
  "port",
  "factory",
  "rail",
];

/** Unit types counted for each layer (rail = trains running on the rails). */
export const LAYER_UNIT_TYPES: Readonly<Record<AmbienceLayer, UnitType>> = {
  city: UnitType.City,
  port: UnitType.Port,
  factory: UnitType.Factory,
  rail: UnitType.Train,
};

export type LayerCounts = Readonly<Record<AmbienceLayer, number>>;
export type LayerLevels = Record<AmbienceLayer, number>;

// Below this zoom (pixels per tile) the world is too far to hear; fully
// present from FULL_SCALE up.
export const AMBIENCE_MIN_SCALE = 3;
export const AMBIENCE_FULL_SCALE = 12;
// One layer never passes this, and all layers together never pass TOTAL_CAP,
// so a crowded view stays a soft texture.
export const LAYER_CAP = 0.7;
export const TOTAL_CAP = 1;

/** 0 when zoomed out, 1 when zoomed in close, smooth in between. */
export function zoomFactor(scale: number): number {
  const t =
    (scale - AMBIENCE_MIN_SCALE) / (AMBIENCE_FULL_SCALE - AMBIENCE_MIN_SCALE);
  const c = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return c * c * (3 - 2 * c);
}

/** Saturating in the number of visible structures: 0, 0.35, 0.58, ... -> 1. */
export function countFactor(count: number): number {
  if (!(count > 0)) return 0;
  return 1 - Math.pow(0.65, Math.min(count, 40));
}

/** Target level (0-1) of every ambient layer for a view. */
export function ambienceLevels(
  scale: number,
  counts: LayerCounts,
): LayerLevels {
  const zoom = zoomFactor(scale);
  const levels: LayerLevels = { city: 0, port: 0, factory: 0, rail: 0 };
  let sum = 0;
  for (const layer of AMBIENCE_LAYERS) {
    levels[layer] = zoom * countFactor(counts[layer]) * LAYER_CAP;
    sum += levels[layer];
  }
  if (sum > TOTAL_CAP) {
    for (const layer of AMBIENCE_LAYERS) levels[layer] *= TOTAL_CAP / sum;
  }
  return levels;
}

/** Slider position (0-1) to gain, with the same audio taper as the mixer. */
export function worldVolumeGain(slider: number): number {
  const c = Math.max(0, Math.min(1, Number.isFinite(slider) ? slider : 0));
  return c * c;
}

/** One-pole smoothing toward a target: rises quicker than it falls. */
export function smoothToward(
  current: number,
  target: number,
  dtMs: number,
  riseMs = 700,
  fallMs = 1400,
): number {
  if (dtMs <= 0) return current;
  const tau = target > current ? riseMs : fallMs;
  const k = 1 - Math.exp(-dtMs / tau);
  return current + (target - current) * k;
}
