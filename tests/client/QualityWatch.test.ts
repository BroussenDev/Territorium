import { describe, expect, it } from "vitest";
import {
  lowerQuality,
  QualityWatch,
  WATCH_SECONDS,
} from "../../src/client/QualityWatch";
import type { GraphicsQuality } from "../../src/core/game/UserSettings";

// Feeds `seconds` seconds of frames at `fps`, returning the last advice.
function play(
  watch: QualityWatch,
  fps: number,
  seconds: number,
  quality: GraphicsQuality = "high",
  counts = true,
  start = { at: 0 },
) {
  let advice = null;
  const step = 1000 / fps;
  const end = start.at + seconds * 1000;
  for (; start.at <= end; start.at += step) {
    advice = watch.recordFrame(start.at, counts, quality) ?? advice;
  }
  return advice;
}

describe("QualityWatch", () => {
  it("offers the level below after a slow stretch", () => {
    const advice = play(new QualityWatch(), 25, WATCH_SECONDS + 2);
    expect(advice?.quality).toBe("normal");
    expect(advice?.fps).toBeGreaterThanOrEqual(24);
    expect(advice?.fps).toBeLessThanOrEqual(26);
  });

  it("says nothing while the game runs smoothly", () => {
    expect(play(new QualityWatch(), 60, WATCH_SECONDS * 2)).toBeNull();
  });

  it("waits for a full stretch: a short slow moment is no reason", () => {
    expect(play(new QualityWatch(), 20, 30)).toBeNull();
  });

  it("ignores the seconds that do not count", () => {
    // Window in the background, or the player's own low limit.
    expect(
      play(new QualityWatch(), 10, WATCH_SECONDS * 2, "high", false),
    ).toBeNull();
  });

  it("has nothing to offer at the lowest level", () => {
    expect(play(new QualityWatch(), 15, WATCH_SECONDS + 2, "low")).toBeNull();
  });

  it("starts over after a reset", () => {
    const watch = new QualityWatch();
    const clock = { at: 0 };
    play(watch, 20, WATCH_SECONDS - 5, "high", true, clock);
    watch.reset();
    expect(play(watch, 20, 10, "high", true, clock)).toBeNull();
  });

  it("steps down one level at a time", () => {
    expect(lowerQuality("ultra")).toBe("high");
    expect(lowerQuality("normal")).toBe("low");
    expect(lowerQuality("low")).toBeNull();
  });
});
