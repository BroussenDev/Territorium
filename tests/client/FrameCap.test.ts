import { beforeEach, describe, expect, it } from "vitest";
import { shouldDrawFrame } from "../../src/client/render/gl/FrameCap";
import {
  FRAME_RATE_CAPS,
  UserSettings,
} from "../../src/core/game/UserSettings";

describe("shouldDrawFrame", () => {
  it("draws every frame with no cap", () => {
    expect(shouldDrawFrame(1000, 999, 0)).toBe(true);
  });

  it("draws the first frame whatever the cap", () => {
    expect(shouldDrawFrame(5, null, 30)).toBe(true);
  });

  // A 144 Hz display delivers a frame every ~6.9 ms: capped at 30, only about
  // one in five is drawn.
  it("skips frames that come sooner than the cap allows", () => {
    expect(shouldDrawFrame(1006.9, 1000, 30)).toBe(false);
    expect(shouldDrawFrame(1034.6, 1000, 30)).toBe(true);
  });

  // vsync lands a little early or late: a 60 cap on a 60 Hz display must not
  // drop a frame that arrived a fraction of a millisecond early.
  it("keeps every frame of a display that runs at the cap", () => {
    expect(shouldDrawFrame(1016.5, 1000, 60)).toBe(true);
  });
});

describe("UserSettings.frameRateCap", () => {
  beforeEach(() => {
    localStorage.clear();
    (UserSettings as unknown as { cache: Map<string, unknown> }).cache.clear();
  });

  it("defaults to the display's own rate", () => {
    expect(new UserSettings().frameRateCap()).toBe(0);
  });

  it("stores each offered cap", () => {
    const settings = new UserSettings();
    for (const cap of FRAME_RATE_CAPS) {
      settings.setFrameRateCap(cap);
      expect(settings.frameRateCap()).toBe(cap);
    }
  });

  it("refuses a value it does not offer", () => {
    const settings = new UserSettings();
    settings.setFrameRateCap(60);
    settings.setFrameRateCap(7);
    expect(settings.frameRateCap()).toBe(60);
    localStorage.setItem("settings.frameRateCap", "999");
    (UserSettings as unknown as { cache: Map<string, unknown> }).cache.clear();
    expect(new UserSettings().frameRateCap()).toBe(0);
  });
});
