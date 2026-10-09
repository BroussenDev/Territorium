import { describe, expect, it } from "vitest";
import { pickAt, structureIconRadiusPx } from "../../src/client/StructurePick";

const s = {
  iconSize: 60,
  dotsZoomThreshold: 1.2,
  dotScale: 0.3,
  iconScaleFactorZoomedOut: 3,
  iconGrowZoom: 7,
} as Parameters<typeof structureIconRadiusPx>[0];

describe("structure icon radius", () => {
  it("matches the icon drawn at each zoom", () => {
    // Fixed screen size between the zoomed-out ramp and the growth zoom.
    expect(structureIconRadiusPx(s, 5, 1, 1)).toBe(30);
    // Shrinks while zooming out, then dots.
    expect(structureIconRadiusPx(s, 1.5, 1, 1)).toBeCloseTo(15);
    expect(structureIconRadiusPx(s, 1, 1, 1)).toBeCloseTo(9);
    // Grows with the map when zoomed in close.
    expect(structureIconRadiusPx(s, 14, 1, 1)).toBe(60);
    // Bigger shapes, and device pixels halved on a high-DPI screen.
    expect(structureIconRadiusPx(s, 5, 1, 1.5)).toBe(45);
    expect(structureIconRadiusPx(s, 6, 2, 1)).toBe(15);
  });

  it("is several tiles wide at a usual zoom, not two", () => {
    // 3 CSS pixels per tile on a DPR 1 screen: a 30 px radius is 10 tiles.
    expect(structureIconRadiusPx(s, 3, 1, 1) / 3).toBeGreaterThan(2);
  });
});

describe("picking on the icon", () => {
  const icon = (item: string, x: number, y: number, radius = 30) => ({
    item,
    x,
    y,
    radius,
  });

  it("picks a structure anywhere on its icon, edges included", () => {
    const city = [icon("city", 100, 100)];
    expect(pickAt(city, 100, 100)).toBe("city");
    expect(pickAt(city, 100, 128)).toBe("city");
    expect(pickAt(city, 74, 100)).toBe("city");
    expect(pickAt(city, 100, 140)).toBeNull();
  });

  it("takes the icon whose centre is closest when two overlap", () => {
    const both = [icon("a", 100, 100), icon("b", 140, 100)];
    expect(pickAt(both, 115, 100)).toBe("a");
    expect(pickAt(both, 125, 100)).toBe("b");
  });

  it("keeps tiny far-zoom dots clickable", () => {
    expect(pickAt([icon("dot", 50, 50, 2)], 58, 50)).toBe("dot");
  });
});
