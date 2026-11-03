import { describe, expect, it } from "vitest";
import {
  maxFramesForBudget,
  OwnerPalette,
  SNAPSHOT_BASE_STRIDE_TICKS,
  SNAPSHOT_MAX_FRAMES,
  SNAPSHOT_MAX_SIDE,
  SNAPSHOT_OTHER_OWNER_INDEX,
  SnapshotCadence,
  snapshotGrid,
  TerritorySnapshotRecorder,
  thinFrames,
} from "../../src/client/replayVideo/TerritorySnapshots";
import type { GameView } from "../../src/client/view/GameView";

describe("snapshotGrid", () => {
  it("keeps the longest side at or under the maximum", () => {
    for (const [w, h] of [
      [2000, 1000],
      [1000, 1000],
      [480, 480],
      [481, 200],
      [5000, 300],
      [100, 90],
    ]) {
      const grid = snapshotGrid(w, h);
      expect(Math.max(grid.width, grid.height)).toBeLessThanOrEqual(
        SNAPSHOT_MAX_SIDE,
      );
      expect(grid.scale).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not upscale a small map", () => {
    expect(snapshotGrid(100, 90)).toEqual({ scale: 1, width: 100, height: 90 });
  });

  it("scales a large map by whole cells", () => {
    expect(snapshotGrid(2000, 1000)).toEqual({
      scale: 5,
      width: 400,
      height: 200,
    });
  });
});

describe("maxFramesForBudget", () => {
  it("caps the frame count by the memory budget", () => {
    const frameBytes = 480 * 240;
    const budget = 60 * 1024 * 1024;
    const frames = maxFramesForBudget(frameBytes, budget);
    expect(frames).toBe(Math.floor(budget / frameBytes));
    expect(frames * frameBytes).toBeLessThanOrEqual(budget);
  });

  it("never exceeds the hard frame cap", () => {
    expect(maxFramesForBudget(1)).toBe(SNAPSHOT_MAX_FRAMES);
  });

  it("keeps at least two frames so a video can still be made", () => {
    expect(maxFramesForBudget(100 * 1024 * 1024)).toBe(2);
  });
});

describe("thinFrames", () => {
  it("keeps every other frame and the last one", () => {
    expect(thinFrames([0, 1, 2, 3, 4])).toEqual([0, 2, 4]);
    expect(thinFrames([0, 1, 2, 3, 4, 5])).toEqual([0, 2, 4, 5]);
  });

  it("leaves a single frame alone", () => {
    expect(thinFrames(["only"])).toEqual(["only"]);
  });
});

describe("SnapshotCadence", () => {
  it("waits for the stride between snapshots", () => {
    const cadence = new SnapshotCadence(600);
    expect(cadence.isDue(0)).toBe(true);
    cadence.markStarted(0);
    expect(cadence.isDue(SNAPSHOT_BASE_STRIDE_TICKS - 1)).toBe(false);
    expect(cadence.isDue(SNAPSHOT_BASE_STRIDE_TICKS)).toBe(true);
  });

  it("doubles the stride each time the frames are thinned", () => {
    const cadence = new SnapshotCadence(600);
    const before = cadence.currentStride();
    cadence.onThinned();
    cadence.onThinned();
    expect(cadence.currentStride()).toBe(before * 4);
  });
});

describe("OwnerPalette", () => {
  it("gives no owner the index 0 and reuses an owner's index", () => {
    const palette = new OwnerPalette();
    expect(palette.indexFor(0, () => [1, 2, 3])).toBe(0);
    const first = palette.indexFor(7, () => [10, 20, 30]);
    expect(first).toBe(1);
    expect(palette.indexFor(7, () => [0, 0, 0])).toBe(first);
    expect(palette.colors()[first]).toEqual([10, 20, 30]);
  });

  it("falls back to the other-owner index past the palette size", () => {
    const palette = new OwnerPalette();
    for (let id = 1; id <= 254; id++) {
      palette.indexFor(id, () => [id, 0, 0]);
    }
    expect(palette.indexFor(999, () => [9, 9, 9])).toBe(
      SNAPSHOT_OTHER_OWNER_INDEX,
    );
  });

  it("uses the other-owner index when the colour is unknown", () => {
    const palette = new OwnerPalette();
    expect(palette.indexFor(5, () => null)).toBe(SNAPSHOT_OTHER_OWNER_INDEX);
  });
});

/** A small fake of the GameView members the recorder reads. */
function fakeGame(width: number, height: number) {
  const state = { tick: 0, owner: 0 };
  const playerColors = new Map<number, [number, number, number]>();
  const game = {
    width: () => width,
    height: () => height,
    ticks: () => state.tick,
    ref: (x: number, y: number) => y * width + x,
    ownerID: () => state.owner,
    terrainByte: () => 1,
    playerBySmallID: (id: number) => ({
      isPlayer: () => id !== 0,
      territoryColor: () => {
        const [r, g, b] = playerColors.get(id) ?? [id * 10, 0, 0];
        return { toRgb: () => ({ r, g, b }) };
      },
    }),
  };
  return { game: game as unknown as GameView, state };
}

/** A recorder whose idle work is run by hand, so each step is observable. */
function manualRecorder(
  width: number,
  height: number,
  options: { budgetBytes?: number; maxFrames?: number } = {},
) {
  const { game, state } = fakeGame(width, height);
  const queue: (() => void)[] = [];
  // Every clock read advances 2 ms, so one idle slice samples two rows.
  let clock = 0;
  const recorder = new TerritorySnapshotRecorder(game, {
    ...options,
    schedule: (callback) => queue.push(callback),
    now: () => (clock += 2),
  });
  const flush = () => {
    let guard = 0;
    while (queue.length > 0) {
      if (++guard > 10_000) throw new Error("capture never finished");
      queue.shift()!();
    }
  };
  return { recorder, state, flush, queue };
}

describe("TerritorySnapshotRecorder", () => {
  it("records nothing until a snapshot has been taken", () => {
    const { recorder } = manualRecorder(40, 20);
    expect(recorder.frameCount()).toBe(0);
    expect(recorder.recording()).toBeNull();
  });

  it("samples the owners and the terrain of the whole grid", () => {
    const { recorder, state, flush } = manualRecorder(40, 20);
    state.owner = 3;
    recorder.tick();
    flush();
    const recording = recorder.recording();
    expect(recording).not.toBeNull();
    expect(recording!.grid).toEqual({ scale: 1, width: 40, height: 20 });
    expect(recording!.frames).toHaveLength(1);
    const owners = recording!.frames[0].owners;
    expect(owners).toHaveLength(40 * 20);
    expect(owners.every((v) => v === 1)).toBe(true);
    expect(recording!.colors[1]).toEqual([30, 0, 0]);
    expect(recording!.terrain.every((v) => v === 1)).toBe(true);
  });

  it("spreads one capture over several idle slices", () => {
    const { recorder, queue, flush } = manualRecorder(40, 20);
    recorder.tick();
    // One slice samples only part of the 20 rows: nothing is kept yet.
    expect(queue).toHaveLength(1);
    queue.shift()!();
    expect(recorder.frameCount()).toBe(0);
    expect(queue.length).toBeGreaterThan(0);
    flush();
    expect(recorder.frameCount()).toBe(1);
  });

  it("takes a snapshot once the cadence says it is due", () => {
    const { recorder, state, flush } = manualRecorder(40, 20);
    recorder.tick();
    flush();
    expect(recorder.frameCount()).toBe(1);
    state.tick = SNAPSHOT_BASE_STRIDE_TICKS - 1;
    recorder.tick();
    flush();
    expect(recorder.frameCount()).toBe(1);
    state.tick = SNAPSHOT_BASE_STRIDE_TICKS;
    recorder.tick();
    flush();
    expect(recorder.frameCount()).toBe(2);
    expect(recorder.lastTick()).toBe(SNAPSHOT_BASE_STRIDE_TICKS);
  });

  it("takes a final snapshot on request, once per tick", () => {
    const { recorder, state, flush } = manualRecorder(40, 20);
    recorder.tick();
    flush();
    state.tick = 3;
    recorder.requestFinal();
    flush();
    expect(recorder.frameCount()).toBe(2);
    expect(recorder.lastTick()).toBe(3);
    recorder.requestFinal();
    flush();
    expect(recorder.frameCount()).toBe(2);
  });

  it("notifies subscribers when a snapshot is kept", () => {
    const { recorder, state, flush } = manualRecorder(40, 20);
    let calls = 0;
    const unsubscribe = recorder.subscribe(() => calls++);
    recorder.tick();
    flush();
    expect(calls).toBe(1);
    unsubscribe();
    state.tick = SNAPSHOT_BASE_STRIDE_TICKS;
    recorder.tick();
    flush();
    expect(calls).toBe(1);
  });

  it("thins the kept frames to stay within the memory budget", () => {
    const frameBytes = 40 * 20;
    // Room for five frames: the recorder must thin rather than grow.
    const { recorder, state, flush } = manualRecorder(40, 20, {
      budgetBytes: frameBytes * 5,
    });
    let maxSeen = 0;
    for (let tick = 0; tick <= 2000; tick++) {
      state.tick = tick;
      recorder.tick();
      flush();
      maxSeen = Math.max(maxSeen, recorder.frameCount());
    }
    expect(maxSeen).toBeLessThanOrEqual(5);
    expect(recorder.estimatedBytes()).toBeLessThanOrEqual(
      frameBytes * 5 + frameBytes,
    );
    const ticks = recorder.recording()!.frames.map((f) => f.tick);
    expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(1000);
  });

  it("keeps about 600 frames over a two-hour game", () => {
    const { recorder, state, flush } = manualRecorder(40, 20);
    const twoHours = 2 * 60 * 60 * 10;
    for (let tick = 0; tick <= twoHours; tick++) {
      state.tick = tick;
      recorder.tick();
      flush();
    }
    expect(recorder.frameCount()).toBeLessThanOrEqual(SNAPSHOT_MAX_FRAMES);
    expect(recorder.frameCount()).toBeGreaterThan(SNAPSHOT_MAX_FRAMES / 2);
    expect(recorder.lastTick()).toBeGreaterThan(twoHours * 0.9);
  });
});
