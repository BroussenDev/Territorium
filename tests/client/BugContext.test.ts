import { describe, expect, it } from "vitest";

import {
  encodeWithinLimit,
  FpsSampler,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MAX_WIDTH,
  screenshotSize,
} from "../../src/client/BugContext";
import { bugReportBody } from "../../src/client/BugReport";

describe("screenshotSize", () => {
  it("keeps a small picture as it is", () => {
    expect(screenshotSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(screenshotSize(SCREENSHOT_MAX_WIDTH, 720)).toEqual({
      width: SCREENSHOT_MAX_WIDTH,
      height: 720,
    });
  });

  it("scales a wide picture down to 1280px, keeping its ratio", () => {
    expect(screenshotSize(2560, 1440)).toEqual({ width: 1280, height: 720 });
    expect(screenshotSize(3840, 1600)).toEqual({ width: 1280, height: 533 });
  });

  it("gives nothing for an empty canvas", () => {
    expect(screenshotSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});

describe("encodeWithinLimit", () => {
  const blobOf = (bytes: number) => new Blob([new Uint8Array(bytes)]);

  it("takes the first encoding that fits", async () => {
    const calls: Array<[number, number]> = [];
    const blob = await encodeWithinLimit(async (scale, quality) => {
      calls.push([scale, quality]);
      return blobOf(quality > 0.7 ? SCREENSHOT_MAX_BYTES + 1 : 1000);
    });
    expect(blob?.size).toBe(1000);
    // Quality drops first, the picture keeps its size.
    expect(calls.every(([scale]) => scale === 1)).toBe(true);
    expect(calls.length).toBeGreaterThan(1);
  });

  it("shrinks the picture when quality alone is not enough", async () => {
    const blob = await encodeWithinLimit(async (scale) =>
      blobOf(scale < 1 ? 1000 : SCREENSHOT_MAX_BYTES * 2),
    );
    expect(blob?.size).toBe(1000);
  });

  it("gives up when nothing fits, or the browser cannot encode", async () => {
    expect(
      await encodeWithinLimit(async () => blobOf(SCREENSHOT_MAX_BYTES + 1)),
    ).toBeNull();
    expect(await encodeWithinLimit(async () => null)).toBeNull();
  });
});

describe("FpsSampler", () => {
  it("averages the last frames", () => {
    const fps = new FpsSampler(10);
    expect(fps.fps()).toBe(0);
    for (let i = 0; i < 20; i++) fps.record(i * 20);
    expect(fps.fps()).toBe(50);
  });
});

describe("bugReportBody with the match", () => {
  const game = {
    gameID: "abc123",
    map: "World",
    mode: "Team",
    gameType: "Public",
    multiplayer: true,
    replay: false,
    tick: 1500,
    elapsedSeconds: 140,
    spectator: false,
    alive: true,
    tiles: 420,
    fps: 58,
    gpu: "Some GPU",
    quality: "high",
  };

  it("adds the match, the app version and the picture", () => {
    const body = bugReportBody("Le jeu se fige ici", "performance", null, {
      game,
      desktopVersion: "0.2.0",
      screenshot: "data:image/webp;base64,AAAA",
    });
    expect(body.context.gameID).toBe("abc123");
    expect(body.context.game).toMatchObject({
      map: "World",
      mode: "Team",
      multiplayer: true,
      tick: 1500,
      elapsedSeconds: 140,
      alive: true,
      tiles: 420,
    });
    expect(body.context.game).not.toHaveProperty("gameID");
    expect(body.context.desktopVersion).toBe("0.2.0");
    expect(body.screenshot).toBe("data:image/webp;base64,AAAA");
    expect(body.context.device?.dpr).toBeGreaterThan(0);
  });

  it("stays small outside a game and without a picture", () => {
    const body = bugReportBody("Un souci de menu", "other", "fromUrl");
    expect(body.context.gameID).toBe("fromUrl");
    expect(body.context.game).toBeUndefined();
    expect(body.context.desktopVersion).toBeUndefined();
    expect(body).not.toHaveProperty("screenshot");
  });
});
