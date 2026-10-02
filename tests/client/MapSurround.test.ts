import { describe, expect, it } from "vitest";
import { deepestWater } from "../../src/client/render/gl/passes/MapSurroundPass";

describe("open sea around the map", () => {
  it("matches the darkest open-water shade the terrain bakes", () => {
    // render-settings.json ocean #4785b5 → deep water 10 lower per channel.
    expect(deepestWater([71, 133, 181])).toEqual([61, 123, 171]);
  });

  it("never goes below black", () => {
    expect(deepestWater([4, 0, 12])).toEqual([0, 0, 2]);
  });
});
