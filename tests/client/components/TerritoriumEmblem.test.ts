import { describe, expect, it } from "vitest";
import { emblemTiles } from "../../../src/client/components/TerritoriumEmblem";

describe("emblemTiles", () => {
  it("lays out the emblem's T with one gold capital", () => {
    const tiles = emblemTiles();
    expect(tiles).toHaveLength(7 + 7 + 6 * 3);
    const capitals = tiles.filter((t) => t.capital);
    expect(capitals).toEqual([{ row: 1, col: 3, capital: true, step: 0 }]);
  });

  it("claims tiles outward from the capital through neighbours", () => {
    const at = (row: number, col: number) =>
      emblemTiles().find((t) => t.row === row && t.col === col)!;
    expect(at(0, 3).step).toBe(1);
    expect(at(1, 0).step).toBe(3);
    expect(at(0, 0).step).toBe(4);
    // The stem is reached down its own column, not across empty cells.
    expect(at(7, 3).step).toBe(6);
    expect(at(7, 2).step).toBe(7);
  });
});
