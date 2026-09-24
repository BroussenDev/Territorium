import { describe, expect, it } from "vitest";
import { emblemTiles } from "../../../src/client/components/TerritoriumEmblem";

describe("emblemTiles", () => {
  const at = (row: number, col: number) =>
    emblemTiles().find((t) => t.row === row && t.col === col)!;

  it("lays out the logo's mark: a T with one gold capital, a frontier and an enemy", () => {
    const tiles = emblemTiles();
    const count = (kind: string) => tiles.filter((t) => t.kind === kind).length;
    expect(count("territory") + count("capital")).toBe(7 + 7 + 4 * 3 + 1);
    expect(tiles.filter((t) => t.kind === "capital")).toEqual([
      { row: 1, col: 3, kind: "capital", step: 0 },
    ]);
    expect(count("frontier")).toBe(2);
    expect(count("enemy")).toBe(3);
    expect(count("falling")).toBe(1);
  });

  it("claims tiles outward from the capital through neighbours", () => {
    expect(at(0, 3).step).toBe(1);
    expect(at(1, 0).step).toBe(3);
    expect(at(0, 0).step).toBe(4);
    // The stem is reached down its own column, not across empty cells.
    expect(at(6, 3).step).toBe(5);
    expect(at(5, 2).step).toBe(5);
  });

  it("reaches the frontier and the enemy after the territory they border", () => {
    // (6,5) touches the stem by its corner (5,4); (5,6) only through (6,5).
    expect(at(6, 5).step).toBe(at(5, 4).step + 1);
    expect(at(5, 6).step).toBe(at(6, 5).step + 1);
    expect(at(6, 6).step).toBe(at(6, 5).step + 1);
    expect(at(6, 1).step).toBe(at(5, 2).step + 1);
  });
});
