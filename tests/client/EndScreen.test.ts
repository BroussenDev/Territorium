import { describe, expect, it } from "vitest";
import {
  compareRecords,
  finishPlace,
  GameHighlights,
  nextGoal,
  pickHighlights,
  PlacePlayer,
} from "../../src/client/hud/EndScreen";
import { UnitType } from "../../src/core/game/Game";

const player = (over: Partial<PlacePlayer>): PlacePlayer => ({
  isMe: false,
  isWinner: false,
  alive: true,
  spawned: true,
  tiles: 100,
  deathPosition: null,
  ...over,
});

describe("finishPlace", () => {
  it("uses the place stamped at elimination", () => {
    const players = [
      player({ isMe: true, alive: false, tiles: 0, deathPosition: 24 }),
      ...Array.from({ length: 49 }, () => player({})),
    ];
    expect(finishPlace(players)).toEqual({ place: 24, total: 50 });
  });

  it("puts the winner first", () => {
    const players = [
      player({ isMe: true, isWinner: true, tiles: 10 }),
      player({ tiles: 900 }),
    ];
    expect(finishPlace(players)).toEqual({ place: 1, total: 2 });
  });

  it("ranks the survivors by land, the winner always ahead", () => {
    const players = [
      player({ isMe: true, tiles: 300 }),
      player({ isWinner: true, tiles: 200 }),
      player({ tiles: 500 }),
      player({ tiles: 100 }),
      player({ alive: false, tiles: 0, deathPosition: 5 }),
    ];
    expect(finishPlace(players)).toEqual({ place: 3, total: 5 });
  });

  it("counts only the players who spawned", () => {
    const players = [
      player({ isMe: true, tiles: 50 }),
      player({ spawned: false, tiles: 0 }),
    ];
    expect(finishPlace(players)).toEqual({ place: 1, total: 1 });
  });

  it("has nothing to say about a player who never spawned", () => {
    expect(finishPlace([player({ isMe: true, spawned: false })])).toBeNull();
    expect(finishPlace([player({})])).toBeNull();
  });
});

describe("GameHighlights", () => {
  it("counts the units that first appear under the local player's flag", () => {
    const h = new GameHighlights();
    h.unit(1, UnitType.MIRV, 7, 7);
    h.unit(1, UnitType.MIRV, 7, 7); // the same unit, updated again
    h.unit(2, UnitType.MIRV, 7, 7);
    h.unit(3, UnitType.City, 8, 7); // someone else's
    h.unit(3, UnitType.City, 7, 7); // then captured: not founded by us
    h.unit(4, UnitType.MIRVWarhead, 7, 7); // not counted
    expect(h.value("mirv")).toBe(2);
    expect(h.value("cities")).toBe(0);
  });

  it("keeps the biggest attack, the peak gold and every attack endured", () => {
    const h = new GameHighlights();
    h.sample([1000, 5000], ["a"], 200);
    h.sample([3000], ["a", "b"], 900);
    h.sample([], [], 100);
    expect(h.value("biggest_attack")).toBe(5000);
    expect(h.value("fronts")).toBe(2);
    expect(h.value("attacks_endured")).toBe(2);
    expect(h.value("peak_gold")).toBe(900);
  });

  it("offers only what happened, and no single front", () => {
    const h = new GameHighlights();
    h.conquest(true);
    h.conquest(false);
    h.sample([10], [], 0);
    expect(h.candidates()).toEqual([
      { key: "eliminations", value: 1 },
      { key: "biggest_attack", value: 10 },
    ]);
  });
});

describe("pickHighlights", () => {
  it("returns n distinct items in a random order", () => {
    const picked = pickHighlights([1, 2, 3, 4, 5], 3, () => 0);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    expect(pickHighlights([1], 3)).toEqual([1]);
  });
});

describe("compareRecords", () => {
  const game = {
    place: 4,
    peakShare: 12.34,
    survivalSeconds: 600,
    eliminations: 2,
    biggestAttack: 40_000,
  };

  it("sets the first marks without announcing them", () => {
    const { beaten, next } = compareRecords({}, game);
    expect(beaten).toEqual([]);
    expect(next).toEqual({
      bestPlace: 4,
      peakShare: 12.3,
      survivalSeconds: 600,
      eliminations: 2,
      biggestAttack: 40_000,
    });
  });

  it("announces the records beaten and keeps the others", () => {
    const { beaten, next } = compareRecords(
      {
        bestPlace: 6,
        peakShare: 20,
        survivalSeconds: 500,
        eliminations: 2,
        biggestAttack: 10,
      },
      game,
    );
    expect(beaten).toEqual(["bestPlace", "survivalSeconds", "biggestAttack"]);
    expect(next.peakShare).toBe(20);
    expect(next.bestPlace).toBe(4);
  });

  it("leaves the place alone when the game gave none", () => {
    const { beaten, next } = compareRecords(
      { bestPlace: 9 },
      { ...game, place: null },
    );
    expect(beaten).not.toContain("bestPlace");
    expect(next.bestPlace).toBe(9);
  });
});

describe("nextGoal", () => {
  const c = (progress: number, target: number, completed = false) => ({
    template: "wins",
    period: "daily",
    progress,
    target,
    completed,
  });

  it("picks the unfinished challenge closest to done", () => {
    const goals = [c(1, 10), c(2, 3), c(5, 5, true)];
    expect(nextGoal(goals)).toBe(goals[1]);
  });

  it("is null when everything is done", () => {
    expect(nextGoal([c(3, 3, true)])).toBeNull();
    expect(nextGoal([])).toBeNull();
  });
});
