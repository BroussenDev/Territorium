import { describe, expect, it } from "vitest";
import {
  canRecordTerritoryVideo,
  fitContain,
  formatGameClock,
  frameTimeline,
  interpolatedTick,
  pickRecorderFormat,
  TerritoryVideoComposer,
  VIDEO_FPS,
  VIDEO_FRAME_COUNT,
  VIDEO_SECONDS,
  VIDEO_SIZE,
  videoDateStamp,
  videoFileName,
  videoLayout,
} from "../../src/client/replayVideo/RenderVideo";

describe("video timeline", () => {
  it("is a 30 second video at 30 frames per second", () => {
    expect(VIDEO_SECONDS).toBe(30);
    expect(VIDEO_FPS).toBe(30);
    expect(VIDEO_FRAME_COUNT).toBe(900);
  });

  it("starts on the first snapshot and ends on the last", () => {
    const first = frameTimeline(0, VIDEO_FRAME_COUNT, 40);
    expect(first).toEqual({ from: 0, to: 1, mix: 0 });
    const last = frameTimeline(VIDEO_FRAME_COUNT - 1, VIDEO_FRAME_COUNT, 40);
    expect(last).toEqual({ from: 39, to: 39, mix: 0 });
  });

  it("visits every snapshot in order across the 900 frames", () => {
    const snapshots = 50;
    let previous = -1;
    const visited = new Set<number>();
    for (let f = 0; f < VIDEO_FRAME_COUNT; f++) {
      const { from, to, mix } = frameTimeline(f, VIDEO_FRAME_COUNT, snapshots);
      expect(from).toBeGreaterThanOrEqual(previous);
      expect(to).toBeGreaterThanOrEqual(from);
      expect(to).toBeLessThan(snapshots);
      expect(mix).toBeGreaterThanOrEqual(0);
      expect(mix).toBeLessThan(1);
      previous = from;
      visited.add(from);
    }
    expect(visited.size).toBe(snapshots);
  });

  it("blends between two neighbouring snapshots", () => {
    // Halfway through a two-snapshot recording: a 50/50 blend.
    const mid = frameTimeline(
      (VIDEO_FRAME_COUNT - 1) / 2,
      VIDEO_FRAME_COUNT,
      2,
    );
    expect(mid.from).toBe(0);
    expect(mid.to).toBe(1);
    expect(mid.mix).toBeCloseTo(0.5, 5);
  });

  it("holds a single snapshot without blending", () => {
    expect(frameTimeline(10, VIDEO_FRAME_COUNT, 1)).toEqual({
      from: 0,
      to: 0,
      mix: 0,
    });
  });

  it("interpolates the game tick between two snapshots", () => {
    const frames = [{ tick: 0 }, { tick: 100 }] as never[];
    expect(interpolatedTick(frames, { from: 0, to: 1, mix: 0.25 })).toBe(25);
    expect(interpolatedTick(frames, { from: 1, to: 1, mix: 0 })).toBe(100);
  });
});

describe("text helpers", () => {
  it("formats game time as m:ss or h:mm:ss", () => {
    expect(formatGameClock(0)).toBe("0:00");
    expect(formatGameClock(75.9)).toBe("1:15");
    expect(formatGameClock(3725)).toBe("1:02:05");
    expect(formatGameClock(-4)).toBe("0:00");
  });

  it("writes the local date as YYYY-MM-DD", () => {
    expect(videoDateStamp(new Date(2026, 10, 3, 23, 59))).toBe("2026-11-03");
  });

  it("builds a file-safe download name", () => {
    expect(videoFileName("Hexagon Map", "2026-11-03", "mp4")).toBe(
      "territorium-hexagon-map-2026-11-03.mp4",
    );
    expect(videoFileName("", "2026-11-03", "webm")).toBe(
      "territorium-partie-2026-11-03.webm",
    );
    expect(videoFileName("World/../x", "2026-11-03", "mp4")).toBe(
      "territorium-world-x-2026-11-03.mp4",
    );
  });
});

describe("recorder format choice", () => {
  it("prefers MP4 when the browser can record it", () => {
    const format = pickRecorderFormat((t) => t.startsWith("video/mp4"));
    expect(format).toEqual({
      mimeType: "video/mp4;codecs=avc1",
      extension: "mp4",
    });
  });

  it("falls back to WebM VP9, then VP8", () => {
    expect(pickRecorderFormat((t) => t.startsWith("video/webm"))).toEqual({
      mimeType: "video/webm;codecs=vp9",
      extension: "webm",
    });
    expect(pickRecorderFormat((t) => t.includes("vp8"))).toEqual({
      mimeType: "video/webm;codecs=vp8",
      extension: "webm",
    });
  });

  it("returns null when nothing is supported", () => {
    expect(pickRecorderFormat(() => false)).toBeNull();
  });

  it("reports no recording support without MediaRecorder", () => {
    // jsdom has neither MediaRecorder nor canvas capture.
    expect(canRecordTerritoryVideo()).toBe(false);
  });
});

describe("video layout", () => {
  it("fits a map inside the frame for both formats", () => {
    for (const format of ["square", "vertical"] as const) {
      const layout = videoLayout(format);
      const { width, height } = VIDEO_SIZE[format];
      expect(layout.width).toBe(width);
      expect(layout.height).toBe(height);
      const { map, progress } = layout;
      expect(map.x).toBeGreaterThanOrEqual(0);
      expect(map.x + map.width).toBeLessThanOrEqual(width);
      expect(map.y).toBeGreaterThan(layout.logo.y);
      expect(map.y + map.height).toBeLessThan(height);
      expect(progress.x + progress.width).toBeLessThanOrEqual(width);
      expect(layout.footer.y).toBeLessThanOrEqual(height);
    }
  });

  it("gives the vertical format a taller map", () => {
    expect(videoLayout("vertical").map.height).toBeGreaterThan(
      videoLayout("square").map.height,
    );
  });
});

describe("fitContain", () => {
  it("keeps the aspect ratio and centres the result", () => {
    const box = fitContain(480, 240, { x: 10, y: 20, width: 952, height: 570 });
    expect(box.width).toBe(952);
    expect(box.height).toBe(476);
    expect(box.x).toBe(10);
    expect(box.y).toBe(20 + Math.round((570 - 476) / 2));
  });
});

describe("frame composition (smoke)", () => {
  it("draws the first, middle and last frames without throwing", () => {
    const grid = { scale: 1, width: 8, height: 4 };
    const owners = (v: number) =>
      new Uint8Array(grid.width * grid.height).fill(v);
    const recording = {
      grid,
      terrain: new Uint8Array(grid.width * grid.height).fill(1),
      colors: [
        [0, 0, 0],
        [255, 0, 0],
        [0, 0, 255],
      ] as const,
      frames: [
        { tick: 0, owners: owners(0) },
        { tick: 100, owners: owners(1) },
        { tick: 300, owners: owners(2) },
      ],
    };
    const meta = {
      mapName: "Hexagon",
      title: "Victory",
      outcome: "win" as const,
      rankText: "#1 of 10",
      clockLabel: "Game time",
      tagline: "The whole game in 30 seconds",
      durationText: "Duration: 0:30",
      fileSlug: "hexagon",
      dateStamp: "2026-11-03",
    };
    for (const format of ["square", "vertical"] as const) {
      const canvas = document.createElement("canvas");
      canvas.width = VIDEO_SIZE[format].width;
      canvas.height = VIDEO_SIZE[format].height;
      const composer = new TerritoryVideoComposer(
        recording,
        meta,
        format,
        canvas,
        null,
      );
      expect(() => {
        composer.drawFrame(0);
        composer.drawFrame(VIDEO_FRAME_COUNT / 2);
        composer.drawFrame(VIDEO_FRAME_COUNT - 1);
      }).not.toThrow();
    }
  });
});
