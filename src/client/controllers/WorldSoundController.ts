import { EventBus } from "../../core/EventBus";
import { UserSettings } from "../../core/game/UserSettings";
import { Controller } from "../Controller";
import {
  AMBIENCE_LAYERS,
  AMBIENCE_MIN_SCALE,
  ambienceLevels,
  LAYER_UNIT_TYPES,
  LayerCounts,
  LayerLevels,
  smoothToward,
  worldVolumeGain,
} from "../sound/WorldSoundMath";
import { PlayWorldPlacementEvent, worldSynth } from "../sound/WorldSounds";
import { TransformHandler } from "../TransformHandler";
import { GameView } from "../view";

// Ambience is recomputed twice a second: a unit-grid query and a handful of
// AudioParam writes, nothing per frame.
const UPDATE_INTERVAL_MS = 500;
// Structures this far (in tiles) from the view centre are never counted, so a
// huge zoomed-out view cannot make the query expensive.
const MAX_COUNT_RADIUS_TILES = 60;
const MIN_COUNT_RADIUS_TILES = 8;
// A placement cue is level 1 at the top of the slider; cues are short, so
// they sit well above the ambience bed.
const PLACEMENT_LEVEL = 0.8;
// A burst of placements (a mass build) must not stack into a wall of sound.
const MIN_PLACEMENT_GAP_MS = 80;

const COUNTED_TYPES = AMBIENCE_LAYERS.map((l) => LAYER_UNIT_TYPES[l]);

/**
 * Plays the synthesized world sounds: a short cue when the local player places
 * a structure, and a soft ambient bed (city bustle, port waves and gulls,
 * factory hum, trains on rails) that grows with the zoom and with how many of
 * those structures are in view. Client only; it reads the game views and the
 * camera and never touches the simulation.
 */
export class WorldSoundController implements Controller {
  private readonly counts: Record<(typeof AMBIENCE_LAYERS)[number], number> = {
    city: 0,
    port: 0,
    factory: 0,
    rail: 0,
  };
  private levels: LayerLevels = { city: 0, port: 0, factory: 0, rail: 0 };
  private lastUpdateAt = 0;
  private lastPlacementAt = -Infinity;

  constructor(
    private readonly game: GameView,
    private readonly eventBus: EventBus,
    private readonly transformHandler: TransformHandler,
    private readonly userSettings: UserSettings,
  ) {}

  init(): void {
    this.eventBus.on(PlayWorldPlacementEvent, this.onPlacement);
  }

  getTickIntervalMs(): number {
    return UPDATE_INTERVAL_MS;
  }

  private audible(): boolean {
    if (!this.userSettings.worldSounds()) return false;
    if (typeof document === "undefined") return false;
    if (document.hidden) return false;
    if (this.userSettings.muteOnBlur() && !document.hasFocus()) return false;
    return true;
  }

  private onPlacement = (e: PlayWorldPlacementEvent): void => {
    if (!this.audible()) return;
    const now = performance.now();
    if (now - this.lastPlacementAt < MIN_PLACEMENT_GAP_MS) return;
    this.lastPlacementAt = now;
    worldSynth()?.playPlacement(
      e.sound,
      PLACEMENT_LEVEL * worldVolumeGain(this.userSettings.worldSoundsVolume()),
    );
  };

  tick(): void {
    const now = performance.now();
    const dt =
      this.lastUpdateAt === 0 ? UPDATE_INTERVAL_MS : now - this.lastUpdateAt;
    this.lastUpdateAt = now;

    const audible = this.audible();
    const scale = this.transformHandler.scale;
    // Far-out views need no query at all.
    const wanted = audible && scale >= AMBIENCE_MIN_SCALE;
    if (wanted) this.countStructures(scale);
    else for (const l of AMBIENCE_LAYERS) this.counts[l] = 0;

    const target = ambienceLevels(scale, this.counts as LayerCounts);
    for (const l of AMBIENCE_LAYERS) {
      this.levels[l] = smoothToward(this.levels[l], target[l], dt);
    }
    const synth = audible ? worldSynth() : null;
    if (synth === null) return;
    synth.setAmbience(
      this.levels,
      worldVolumeGain(this.userSettings.worldSoundsVolume()),
      true,
    );
  }

  private countStructures(scale: number): void {
    for (const l of AMBIENCE_LAYERS) this.counts[l] = 0;
    const { screenX, screenY } = this.transformHandler.screenCenter();
    if (!this.game.isValidCoord(screenX, screenY)) return;
    const tile = this.game.ref(screenX, screenY);
    const halfViewTiles =
      Math.max(
        this.transformHandler.width(),
        this.transformHandler.boundingRect().height,
      ) /
      2 /
      scale;
    const radius = Math.max(
      MIN_COUNT_RADIUS_TILES,
      Math.min(MAX_COUNT_RADIUS_TILES, halfViewTiles),
    );
    for (const { unit } of this.game.nearbyUnits(tile, radius, COUNTED_TYPES)) {
      for (const l of AMBIENCE_LAYERS) {
        if (LAYER_UNIT_TYPES[l] === unit.type()) {
          this.counts[l]++;
          break;
        }
      }
    }
  }
}
