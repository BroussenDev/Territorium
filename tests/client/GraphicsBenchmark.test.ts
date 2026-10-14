import { describe, expect, it } from "vitest";
import {
  chipName,
  estimateFps,
  recommendQuality,
  TARGET_FPS,
} from "../../src/client/render/gl/GraphicsBenchmark";

const FULL_HD = 1920 * 1080;

describe("graphics benchmark", () => {
  it("expects fewer frames from each finer level on a dense screen", () => {
    const fps = estimateFps(1, FULL_HD, 3);
    expect(fps.low).toBeGreaterThan(fps.normal);
    expect(fps.normal).toBeGreaterThan(fps.high);
    expect(fps.high).toBeGreaterThan(fps.ultra);
  });

  it("recommends the finest level that stays smooth", () => {
    expect(
      recommendQuality({ low: 200, normal: 120, high: 70, ultra: 40 }, 3),
    ).toBe("high");
    expect(
      recommendQuality({ low: 90, normal: 50, high: 30, ultra: 20 }, 3),
    ).toBe("low");
  });

  it("falls back to low on a computer that cannot keep up at all", () => {
    expect(
      recommendQuality({ low: 20, normal: 12, high: 8, ultra: 5 }, 1),
    ).toBe("low");
  });

  // On an ordinary screen Ultra renders exactly like High: recommending it
  // would only make the player think they need it.
  it("does not recommend a level that changes nothing on this screen", () => {
    const fps = estimateFps(0.2, FULL_HD, 1);
    expect(fps.ultra).toBe(fps.high);
    expect(fps.high).toBeGreaterThanOrEqual(TARGET_FPS);
    expect(recommendQuality(fps, 1)).toBe("high");
  });

  // A very fast chip: every level far past any display's rate.
  it("recommends the full look when every level is fast", () => {
    expect(recommendQuality(estimateFps(0.001, FULL_HD, 1), 1)).toBe("high");
  });

  it("recommends Ultra on a fast chip with a very dense screen", () => {
    expect(recommendQuality(estimateFps(0.05, FULL_HD, 3), 3)).toBe("ultra");
  });

  it("recommends a lower level for a slow chip", () => {
    const fast = recommendQuality(estimateFps(0.2, FULL_HD, 2), 2);
    const slow = recommendQuality(estimateFps(2, FULL_HD, 2), 2);
    expect(fast).toBe("high");
    expect(["low", "normal"]).toContain(slow);
  });

  it("names the graphics chip as players know it", () => {
    expect(
      chipName(
        "ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11)",
      ),
    ).toBe("NVIDIA GeForce RTX 5070");
    expect(chipName("Apple M2")).toBe("Apple M2");
  });
});
