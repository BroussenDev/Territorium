import { describe, expect, it } from "vitest";
import {
  findLargestInscribedRectangle,
  largestRectangleInHistogram,
  type NameGrid,
  type Rectangle,
} from "../../../src/client/hud/NameBoxCalculator";

// The name box used to be computed on nested boolean arrays, one fresh grid
// per player; it now runs on one reused byte buffer. This keeps the original
// algorithm as the reference: every name must land exactly where it did.
function referenceLargestRectangle(grid: boolean[][]): Rectangle {
  const rows = grid[0].length;
  const cols = grid.length;
  const heights: number[] = new Array(cols).fill(0);
  let largest: Rectangle = { x: 0, y: 0, width: 0, height: 0 };
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      heights[col] = grid[col][row] ? heights[col] + 1 : 0;
    }
    const r = largestRectangleInHistogram(heights);
    if (r.width * r.height > largest.width * largest.height) {
      largest = {
        x: r.x,
        y: row - r.height + 1,
        width: r.width,
        height: r.height,
      };
    }
  }
  return largest;
}

// Deterministic pseudo-random numbers (mulberry32), so a failure replays.
function random(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toFlat(grid: boolean[][]): NameGrid {
  const width = grid.length;
  const height = grid[0].length;
  const cells = new Uint8Array(width * height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) cells[x * height + y] = grid[x][y] ? 1 : 0;
  }
  return { cells, width, height };
}

describe("findLargestInscribedRectangle", () => {
  it("places every name exactly where the original algorithm did", () => {
    const rand = random(42);
    for (let i = 0; i < 3000; i++) {
      const width = 1 + Math.floor(rand() * 40);
      const height = 1 + Math.floor(rand() * 40);
      const density = rand();
      const grid = Array.from({ length: width }, () =>
        Array.from({ length: height }, () => rand() < density),
      );
      expect(findLargestInscribedRectangle(toFlat(grid))).toEqual(
        referenceLargestRectangle(grid),
      );
    }
  });

  it("finds the open block in a territory", () => {
    // A 3x2 block of land at x 1..3, y 2..3 in a 5x5 grid.
    const grid = Array.from({ length: 5 }, (_, x) =>
      Array.from({ length: 5 }, (_, y) => x >= 1 && x <= 3 && y >= 2 && y <= 3),
    );
    expect(findLargestInscribedRectangle(toFlat(grid))).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 2,
    });
  });

  it("is not thrown off by a bigger grid computed before it", () => {
    const big = Array.from({ length: 50 }, () => Array(50).fill(true));
    findLargestInscribedRectangle(toFlat(big));
    const small = [
      [false, true],
      [true, true],
    ];
    expect(findLargestInscribedRectangle(toFlat(small))).toEqual(
      referenceLargestRectangle(small),
    );
  });
});
