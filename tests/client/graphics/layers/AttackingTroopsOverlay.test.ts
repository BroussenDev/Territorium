import { describe, expect, test } from "vitest";
import {
  alignClusterOrder,
  attackDirection,
  Slot,
} from "../../../../src/client/controllers/AttackingTroopsController";
import { attackPlateLayout } from "../../../../src/client/render/gl/passes/WorldTextPass";
import { Cell } from "../../../../src/core/game/Game";

// Slots only need the `dst` fields populated for `alignClusterOrder` — it
// compares the new positions against the previous targets to decide whether
// the worker reordered same-size clusters.
const slot = (x: number, y: number): Slot => ({
  curX: x,
  curY: y,
  srcX: x,
  srcY: y,
  dstX: x,
  dstY: y,
  startMs: 0,
});

describe("alignClusterOrder", () => {
  const c = (x: number, y: number) => new Cell(x, y);

  test("preserves order when direct mapping is closer", () => {
    const next = [c(10, 10), c(100, 100)];
    const prev = [slot(12, 11), slot(98, 102)];
    alignClusterOrder(next, prev);
    expect(next[0].x).toBe(10);
    expect(next[1].x).toBe(100);
  });

  test("swaps when the worker reordered same-size clusters", () => {
    // prev[0] is near (10,10), prev[1] is near (100,100); the worker returned
    // them in the opposite order. Expect swap so each label sticks to its front.
    const next = [c(101, 99), c(11, 12)];
    const prev = [slot(10, 10), slot(100, 100)];
    alignClusterOrder(next, prev);
    expect(next[0].x).toBe(11);
    expect(next[1].x).toBe(101);
  });

  test("does not swap on a tie (strict less-than)", () => {
    const next = [c(0, 0), c(10, 0)];
    const prev = [slot(5, 0), slot(5, 0)];
    alignClusterOrder(next, prev);
    expect(next[0].x).toBe(0);
    expect(next[1].x).toBe(10);
  });

  test("no-op when fewer than two new positions", () => {
    const single = [c(99, 99)];
    alignClusterOrder(single, [slot(0, 0), slot(1000, 1000)]);
    expect(single[0].x).toBe(99);

    const empty: Cell[] = [];
    alignClusterOrder(empty, [slot(0, 0), slot(1000, 1000)]);
    expect(empty.length).toBe(0);
  });

  test("no-op when fewer than two previous slots (initial render)", () => {
    const next = [c(100, 100), c(0, 0)];
    alignClusterOrder(next, [slot(0, 0)]);
    expect(next[0].x).toBe(100);
    expect(next[1].x).toBe(0);

    alignClusterOrder(next, []);
    expect(next[0].x).toBe(100);
    expect(next[1].x).toBe(0);
  });

  test("no-op when more than two new positions (assumed cap)", () => {
    const next = [c(100, 0), c(0, 0), c(50, 0)];
    alignClusterOrder(next, [slot(0, 0), slot(100, 0)]);
    expect(next.map((p) => p.x)).toEqual([100, 0, 50]);
  });
});

describe("attack label arrow", () => {
  const at = (x: number, y: number) => ({ nameLocation: () => ({ x, y }) });
  const nowhere = { nameLocation: () => undefined };

  test("points from the attacker toward the defender", () => {
    const d = attackDirection(at(0, 0), at(30, 40));
    expect(d.x).toBeCloseTo(0.6);
    expect(d.y).toBeCloseTo(0.8);
  });

  test("falls back to pointing right when a position is unknown", () => {
    expect(attackDirection(nowhere, at(5, 5))).toEqual({ x: 1, y: 0 });
    expect(attackDirection(at(5, 5), at(5, 5))).toEqual({ x: 1, y: 0 });
  });
});

describe("attack plate layout", () => {
  test("centres the plate on the label and puts the count after the badge", () => {
    const p = attackPlateLayout(100, 50, 10, 4);
    expect(p.centerX).toBe(100);
    expect(p.centerY).toBe(50);
    // Plate height: 1.95 digit heights.
    expect(p.halfH * 2).toBeCloseTo(7.8);
    // The count ends inside the plate, short of its right edge.
    const right = p.centerX + p.halfW;
    expect(p.textX + 10).toBeLessThan(right);
    // And starts after the badge, on the plate's left.
    const left = p.centerX - p.halfW;
    expect(p.textX - 10).toBeGreaterThan(left + 7.8 * (0.16 + 0.68));
  });

  test("grows with the count", () => {
    expect(attackPlateLayout(0, 0, 20, 4).halfW).toBeGreaterThan(
      attackPlateLayout(0, 0, 10, 4).halfW,
    );
  });
});
