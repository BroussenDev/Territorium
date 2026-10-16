import { describe, expect, it } from "vitest";
import {
  WarshipCourses,
  initialWarshipHeading,
  warshipHeading,
  warshipSprite,
} from "../../src/client/render/gl/passes/WarshipHeading";

const W = 100;
const tile = (x: number, y: number) => y * W + x;

describe("warship heading", () => {
  it("points where the ship sails, clockwise from north", () => {
    const from = tile(50, 50);
    const cases: [number, number, number][] = [
      [0, -1, 0],
      [1, -1, 1],
      [1, 0, 2],
      [1, 1, 3],
      [0, 1, 4],
      [-1, 1, 5],
      [-1, 0, 6],
      [-1, -1, 7],
    ];
    for (const [dx, dy, heading] of cases) {
      expect(warshipHeading(from, tile(50 + dx, 50 + dy), W, 0)).toBe(heading);
    }
  });

  it("rounds a steep move to the nearest of the eight headings", () => {
    expect(warshipHeading(tile(50, 50), tile(51, 47), W, 4)).toBe(0);
    expect(warshipHeading(tile(50, 50), tile(53, 49), W, 4)).toBe(2);
  });

  it("keeps its heading while it lies still", () => {
    expect(warshipHeading(tile(5, 5), tile(5, 5), W, 3)).toBe(3);
  });

  it("starts fleets facing different ways", () => {
    const headings = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map(initialWarshipHeading),
    );
    expect(headings.size).toBeGreaterThan(3);
    for (const h of headings) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(8);
    }
  });

  it("draws odd headings with the diagonal sprite, turned by quarter turns", () => {
    expect(warshipSprite(0)).toEqual({ diagonal: false, quarterTurns: 0 });
    expect(warshipSprite(1)).toEqual({ diagonal: true, quarterTurns: 0 });
    expect(warshipSprite(4)).toEqual({ diagonal: false, quarterTurns: 2 });
    expect(warshipSprite(7)).toEqual({ diagonal: true, quarterTurns: 3 });
  });

  // A diagonal course, as the ship sails it: east, north, east, north...
  it("shows a staircase course as its diagonal, without twitching", () => {
    const courses = new WarshipCourses();
    let x = 50;
    let y = 50;
    const seen: number[] = [];
    courses.heading(1, tile(x, y), W);
    for (let i = 0; i < 20; i++) {
      if (i % 2 === 0) x++;
      else y--;
      seen.push(courses.heading(1, tile(x, y), W));
    }
    // Once a few steps are in, it holds north-east.
    expect(new Set(seen.slice(4))).toEqual(new Set([1]));
  });

  it("turns with the ship", () => {
    const courses = new WarshipCourses();
    courses.heading(1, tile(50, 50), W);
    for (let i = 1; i <= 10; i++) courses.heading(1, tile(50 + i, 50), W);
    expect(courses.heading(1, tile(60, 50), W)).toBe(2);
    for (let i = 1; i <= 10; i++) courses.heading(1, tile(60, 50 + i), W);
    expect(courses.heading(1, tile(60, 60), W)).toBe(4);
  });

  it("forgets the ships that are gone", () => {
    const courses = new WarshipCourses();
    courses.heading(1, tile(50, 50), W);
    courses.heading(1, tile(51, 50), W);
    courses.sweep();
    courses.sweep();
    // Seen again as new: its starting heading, not the old course.
    expect(courses.heading(1, tile(51, 50), W)).toBe(initialWarshipHeading(1));
  });
});
