import type { Controller } from "../Controller";
import type { GameView } from "../view/GameView";

/**
 * Records downscaled ownership snapshots of the map during a game, for the
 * end-screen video. Each snapshot is one byte per cell (a palette index), so
 * a 480 px map costs ~115 KB per frame. Capture runs in small time slices from
 * idle callbacks, so it never stalls a game tick or the render loop.
 */

/** Longest side of a snapshot, in cells. */
export const SNAPSHOT_MAX_SIDE = 480;
/** Hard cap on kept frames, whatever the memory budget says. */
export const SNAPSHOT_MAX_FRAMES = 600;
/** Budget for the snapshot bytes kept in memory. */
export const SNAPSHOT_MEMORY_BUDGET_BYTES = 60 * 1024 * 1024;
/** Game ticks between two snapshots at the start (10 ticks = 1 s). */
export const SNAPSHOT_BASE_STRIDE_TICKS = 10;
/** Palette index meaning "owned by a player with no colour slot left". */
export const SNAPSHOT_OTHER_OWNER_INDEX = 255;
/** Milliseconds of sampling per idle slice. */
const SLICE_BUDGET_MS = 4;

export type RgbColor = readonly [number, number, number];

export interface SnapshotGrid {
  /** Map cells per snapshot cell along each axis. */
  scale: number;
  width: number;
  height: number;
}

/** The part of GameView the recorder reads. */
export type SnapshotSource = Pick<
  GameView,
  | "ticks"
  | "width"
  | "height"
  | "ref"
  | "ownerID"
  | "terrainByte"
  | "playerBySmallID"
>;

export interface TerritorySnapshot {
  /** Game tick the snapshot was taken at. */
  tick: number;
  /** Palette index per grid cell, row-major. 0 = no owner. */
  owners: Uint8Array;
}

/** Everything the video renderer needs, read-only once recording is over. */
export interface TerritoryRecording {
  grid: SnapshotGrid;
  /** Terrain byte per grid cell, sampled once. */
  terrain: Uint8Array;
  /** Palette: index -> colour. Index 0 is unused (no owner). */
  colors: readonly RgbColor[];
  frames: readonly TerritorySnapshot[];
}

/** Grid for a map, scaled so its longest side is at most `maxSide`. */
export function snapshotGrid(
  mapWidth: number,
  mapHeight: number,
  maxSide = SNAPSHOT_MAX_SIDE,
): SnapshotGrid {
  const scale = Math.max(
    1,
    Math.ceil(Math.max(mapWidth, mapHeight) / Math.max(1, maxSide)),
  );
  return {
    scale,
    width: Math.ceil(mapWidth / scale),
    height: Math.ceil(mapHeight / scale),
  };
}

/** How many frames of `frameBytes` fit the budget, capped at `maxFrames`. */
export function maxFramesForBudget(
  frameBytes: number,
  budgetBytes = SNAPSHOT_MEMORY_BUDGET_BYTES,
  maxFrames = SNAPSHOT_MAX_FRAMES,
): number {
  const fit = Math.floor(budgetBytes / Math.max(1, frameBytes));
  return Math.max(2, Math.min(maxFrames, fit));
}

/**
 * Drops every other frame so the kept ones stay evenly spread, keeping the
 * first and the last frame (the end of the game is always kept).
 */
export function thinFrames<T>(frames: readonly T[]): T[] {
  const last = frames.length - 1;
  return frames.filter((_, i) => i % 2 === 0 || i === last);
}

/**
 * Decides when to take the next snapshot. The stride (in game ticks) doubles
 * each time the kept frames fill up, so a long game keeps about `maxFrames`
 * evenly spaced frames whatever its length.
 */
export class SnapshotCadence {
  private stride: number;
  private lastTick = Number.NEGATIVE_INFINITY;

  constructor(
    readonly maxFrames: number,
    baseStride = SNAPSHOT_BASE_STRIDE_TICKS,
  ) {
    this.stride = Math.max(1, baseStride);
  }

  currentStride(): number {
    return this.stride;
  }

  isDue(tick: number): boolean {
    return tick - this.lastTick >= this.stride;
  }

  /** Records that a snapshot was started at `tick`. */
  markStarted(tick: number): void {
    this.lastTick = tick;
  }

  /** Called after the frames were thinned: the stride doubles. */
  onThinned(): void {
    this.stride *= 2;
  }
}

/**
 * Maps owner smallIDs to palette indices (1..254). Owners past the last slot
 * share the "other owner" grey, which only happens in very large lobbies.
 */
export class OwnerPalette {
  private readonly indexBySmallID = new Map<number, number>();
  private readonly colorList: RgbColor[] = [[0, 0, 0]];

  /** Index of an owner already registered, or -1 when it is new. */
  known(smallID: number): number {
    if (smallID === 0) return 0;
    return this.indexBySmallID.get(smallID) ?? -1;
  }

  /** Registers a new owner's colour (null when unknown) and returns its index. */
  register(smallID: number, rgb: RgbColor | null): number {
    if (rgb === null || this.colorList.length >= SNAPSHOT_OTHER_OWNER_INDEX) {
      this.indexBySmallID.set(smallID, SNAPSHOT_OTHER_OWNER_INDEX);
      return SNAPSHOT_OTHER_OWNER_INDEX;
    }
    const index = this.colorList.length;
    this.colorList.push(rgb);
    this.indexBySmallID.set(smallID, index);
    return index;
  }

  /** Index for an owner, registering its colour on first sight. */
  indexFor(smallID: number, color: () => RgbColor | null): number {
    const index = this.known(smallID);
    return index >= 0 ? index : this.register(smallID, color());
  }

  colors(): RgbColor[] {
    return this.colorList.slice();
  }
}

/**
 * Fills rows [fromRow, toRow) of `owners` (and of `terrain` when given) by
 * sampling the source at the centre of each grid cell.
 */
export function sampleRows(
  source: Pick<SnapshotSource, "ref" | "ownerID" | "terrainByte">,
  grid: SnapshotGrid,
  palette: OwnerPalette,
  colorOf: (smallID: number) => RgbColor | null,
  owners: Uint8Array,
  terrain: Uint8Array | null,
  fromRow: number,
  toRow: number,
): void {
  const { scale, width } = grid;
  const half = Math.floor(scale / 2);
  for (let gy = fromRow; gy < toRow; gy++) {
    const y = gy * scale + half;
    for (let gx = 0; gx < width; gx++) {
      const x = gx * scale + half;
      const ref = source.ref(x, y);
      const cell = gy * width + gx;
      const smallID = source.ownerID(ref);
      let index = palette.known(smallID);
      if (index < 0) index = palette.register(smallID, colorOf(smallID));
      owners[cell] = index;
      if (terrain !== null) terrain[cell] = source.terrainByte(ref);
    }
  }
}

interface CaptureJob {
  tick: number;
  owners: Uint8Array;
  nextRow: number;
}

export interface TerritorySnapshotOptions {
  /** Runs a callback when the browser is idle (defaults to requestIdleCallback). */
  schedule?: (callback: () => void) => void;
  /** Monotonic clock in ms (defaults to performance.now). */
  now?: () => number;
  budgetBytes?: number;
  maxFrames?: number;
}

function defaultSchedule(callback: () => void): void {
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => callback(), { timeout: 250 });
  } else {
    setTimeout(callback, 4);
  }
}

/**
 * Records territory snapshots as the game runs. Wire `tick` into the renderer
 * loop; call `requestFinal` when the game is decided.
 */
export class TerritorySnapshotRecorder implements Controller {
  private readonly grid: SnapshotGrid;
  private readonly cadence: SnapshotCadence;
  private readonly palette = new OwnerPalette();
  private readonly schedule: (callback: () => void) => void;
  private readonly now: () => number;
  private readonly listeners = new Set<() => void>();
  private frames: TerritorySnapshot[] = [];
  private readonly terrain: Uint8Array;
  private job: CaptureJob | null = null;
  private finalRequested = false;

  constructor(
    private readonly game: SnapshotSource,
    options: TerritorySnapshotOptions = {},
  ) {
    this.grid = snapshotGrid(game.width(), game.height());
    const frameBytes = this.grid.width * this.grid.height;
    const budget = options.budgetBytes ?? SNAPSHOT_MEMORY_BUDGET_BYTES;
    this.cadence = new SnapshotCadence(
      maxFramesForBudget(frameBytes, budget, options.maxFrames),
    );
    this.terrain = new Uint8Array(frameBytes);
    this.schedule = options.schedule ?? defaultSchedule;
    this.now = options.now ?? (() => performance.now());
  }

  /** Renderer tick: starts a capture when the cadence says so. */
  tick(): void {
    if (this.job !== null) return;
    if (this.finalRequested) {
      this.startFinal();
      return;
    }
    const tick = this.game.ticks();
    if (this.cadence.isDue(tick)) this.startCapture(tick);
  }

  /** Takes a snapshot of the current state (the game was just decided). */
  requestFinal(): void {
    this.finalRequested = true;
    if (this.job === null) this.startFinal();
  }

  /** Number of snapshots kept. */
  frameCount(): number {
    return this.frames.length;
  }

  /** Game tick of the latest snapshot, or 0 before any. */
  lastTick(): number {
    return this.frames.length === 0
      ? 0
      : this.frames[this.frames.length - 1].tick;
  }

  /** Bytes held by snapshots and the terrain grid. */
  estimatedBytes(): number {
    const frameBytes = this.grid.width * this.grid.height;
    return this.frames.length * frameBytes + this.terrain.length;
  }

  /** The recording, for rendering. Shares the buffers, do not mutate. */
  recording(): TerritoryRecording | null {
    if (this.frames.length === 0) return null;
    return {
      grid: this.grid,
      terrain: this.terrain,
      colors: this.palette.colors(),
      frames: this.frames,
    };
  }

  /** Subscribes to changes (a snapshot was kept or thinning ran). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // A final snapshot is skipped when the last kept frame already shows this tick.
  private startFinal(): void {
    const tick = this.game.ticks();
    if (this.frames.length > 0 && this.lastTick() === tick) {
      this.finalRequested = false;
      return;
    }
    this.startCapture(tick);
  }

  private startCapture(tick: number): void {
    this.finalRequested = false;
    this.cadence.markStarted(tick);
    this.job = {
      tick,
      owners: new Uint8Array(this.grid.width * this.grid.height),
      nextRow: 0,
    };
    this.schedule(() => this.runSlice());
  }

  private runSlice(): void {
    const job = this.job;
    if (job === null) return;
    const started = this.now();
    const colorOf = (smallID: number) => this.colorOf(smallID);
    while (job.nextRow < this.grid.height) {
      const from = job.nextRow;
      const to = Math.min(this.grid.height, from + 1);
      sampleRows(
        this.game,
        this.grid,
        this.palette,
        colorOf,
        job.owners,
        this.terrain,
        from,
        to,
      );
      job.nextRow = to;
      if (this.now() - started >= SLICE_BUDGET_MS) break;
    }
    if (job.nextRow < this.grid.height) {
      this.schedule(() => this.runSlice());
      return;
    }
    this.job = null;
    this.keep({ tick: job.tick, owners: job.owners });
  }

  private keep(frame: TerritorySnapshot): void {
    this.frames.push(frame);
    if (this.frames.length > this.cadence.maxFrames) {
      this.frames = thinFrames(this.frames);
      this.cadence.onThinned();
    }
    this.notify();
    if (this.finalRequested) this.startFinal();
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private colorOf(smallID: number): RgbColor | null {
    try {
      const owner = this.game.playerBySmallID(smallID);
      if (!owner.isPlayer()) return null;
      const { r, g, b } = owner.territoryColor().toRgb();
      return [r, g, b];
    } catch {
      return null;
    }
  }
}
