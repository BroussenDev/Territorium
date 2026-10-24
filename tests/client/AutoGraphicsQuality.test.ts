import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  autoPickGraphicsQuality,
  shouldAutoPickQuality,
} from "../../src/client/AutoGraphicsQuality";
import * as Benchmark from "../../src/client/render/gl/GraphicsBenchmark";
import { UserSettings } from "../../src/core/game/UserSettings";

function clearSettings() {
  localStorage.clear();
  (UserSettings as unknown as { cache: Map<string, unknown> }).cache.clear();
}

// A browser visitor who never picked a quality gets one fitted to their
// computer; nobody else is touched.
describe("automatic graphics quality", () => {
  beforeEach(() => {
    clearSettings();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    clearSettings();
  });

  it("picks for a first browser visit only", () => {
    const settings = new UserSettings();
    expect(shouldAutoPickQuality(settings, false)).toBe(true);
    // The Steam app runs the test itself on its first launch.
    expect(shouldAutoPickQuality(settings, true)).toBe(false);
  });

  it("never overrides a quality already saved", () => {
    const settings = new UserSettings();
    settings.setGraphicsQuality("ultra");
    expect(shouldAutoPickQuality(settings, false)).toBe(false);
  });

  it("saves the quality the graphics test recommends", async () => {
    const run = vi.spyOn(Benchmark, "runGraphicsBenchmark").mockResolvedValue({
      fps: { low: 90, normal: 60, high: 40, ultra: 30 },
      recommended: "normal",
      renderer: "Intel UHD Graphics",
      software: false,
    });
    const settings = new UserSettings();
    autoPickGraphicsQuality(settings);
    // It waits for the home page to settle before testing.
    expect(run).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(run).toHaveBeenCalledOnce();
    expect(settings.graphicsQuality()).toBe("normal");
    expect(settings.hasGraphicsQuality()).toBe(true);
  });

  it("keeps a quality the player chose while the test waited", async () => {
    const run = vi.spyOn(Benchmark, "runGraphicsBenchmark").mockResolvedValue({
      fps: { low: 20, normal: 15, high: 10, ultra: 8 },
      recommended: "low",
      renderer: "",
      software: false,
    });
    const settings = new UserSettings();
    autoPickGraphicsQuality(settings);
    settings.setGraphicsQuality("high");
    await vi.runAllTimersAsync();
    expect(run).not.toHaveBeenCalled();
    expect(settings.graphicsQuality()).toBe("high");
  });
});
