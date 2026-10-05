import { describe, expect, it } from "vitest";
import {
  friendFoeColors,
  isColorblindPalette,
} from "../../src/client/ColorblindPalette";
import {
  flashAmount,
  flashStamp,
} from "../../src/client/render/gl/passes/TerritoryPass";

const settings = (palette?: "default" | "colorblind") => ({
  graphicsOverrides: () => (palette ? { palette } : {}),
});

describe("friend / foe colours", () => {
  it("are emerald and red by default", () => {
    expect(isColorblindPalette(settings())).toBe(false);
    expect(friendFoeColors(settings())).toEqual({
      friend: "#34d399",
      foe: "#ef4444",
    });
  });

  it("turn blue and orange with the Colorblind palette", () => {
    expect(isColorblindPalette(settings("colorblind"))).toBe(true);
    expect(friendFoeColors(settings("colorblind"))).toEqual({
      friend: "#56b4e9",
      foe: "#e69f00",
    });
  });
});

describe("conquest flash", () => {
  it("is brightest at capture and gone after about half a second", () => {
    const at = flashStamp(10_000);
    expect(flashAmount(at, at)).toBeCloseTo(0.4);
    expect(flashAmount(at, flashStamp(10_250))).toBeGreaterThan(0);
    expect(flashAmount(at, flashStamp(10_250))).toBeLessThan(0.4);
    expect(flashAmount(at, flashStamp(10_600))).toBe(0);
  });

  it("never lights a tile that was never captured, nor one stamped later", () => {
    expect(flashAmount(0, flashStamp(5_000))).toBe(0);
    expect(flashAmount(flashStamp(9_000), flashStamp(8_000))).toBe(0);
  });

  it("stamps stay distinct for hours (no wrap-around)", () => {
    expect(flashStamp(10 * 3_600_000)).toBeLessThan(2 ** 24);
    expect(flashStamp(1)).toBeGreaterThan(0);
  });
});
