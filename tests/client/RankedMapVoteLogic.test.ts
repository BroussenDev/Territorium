import { describe, expect, it } from "vitest";
import {
  canCastVote,
  isBannedMap,
  leadingMaps,
  mapForKey,
  voteSecondsLeft,
} from "../../src/client/components/ranked/MapVoteLogic";
import type { RankedMapVote } from "../../src/core/ApiSchemas";

const vote = (over: Partial<RankedMapVote> = {}): RankedMapVote => ({
  id: "v1",
  mode: "vote",
  options: ["A", "B", "C"],
  endsInMs: 20_000,
  total: 4,
  voted: 0,
  tally: { A: 0, B: 0, C: 0 },
  mine: null,
  result: null,
  ...over,
});

describe("ranked map vote helpers", () => {
  it("counts the seconds left from when the state was read", () => {
    expect(voteSecondsLeft(20_000, 1_000, 1_000)).toBe(20);
    expect(voteSecondsLeft(20_000, 1_000, 4_500)).toBe(17);
    expect(voteSecondsLeft(2_000, 0, 9_000)).toBe(0);
  });

  it("lets a player cast once, while the vote is open", () => {
    expect(canCastVote(vote())).toBe(true);
    expect(canCastVote(vote({ mine: "A" }))).toBe(false);
    expect(canCastVote(vote({ result: "B" }))).toBe(false);
  });

  it("marks banned maps only in a ban duel", () => {
    const duel = vote({ mode: "ban", voted: 1, tally: { A: 1, B: 0, C: 0 } });
    expect(isBannedMap(duel, "A")).toBe(true);
    expect(isBannedMap(duel, "B")).toBe(false);
    expect(isBannedMap(vote({ tally: { A: 2, B: 0, C: 0 } }), "A")).toBe(false);
  });

  it("finds the maps in front", () => {
    expect(leadingMaps(vote())).toEqual([]);
    expect(
      leadingMaps(vote({ voted: 3, tally: { A: 1, B: 2, C: 0 } })),
    ).toEqual(["B"]);
    expect(
      leadingMaps(vote({ voted: 2, tally: { A: 1, B: 1, C: 0 } })),
    ).toEqual(["A", "B"]);
    expect(
      leadingMaps(vote({ mode: "ban", voted: 1, tally: { A: 1, B: 0, C: 0 } })),
    ).toEqual(["B", "C"]);
  });

  it("maps number keys to options", () => {
    expect(mapForKey(["A", "B", "C"], "2")).toBe("B");
    expect(mapForKey(["A", "B"], "3")).toBeNull();
    expect(mapForKey(["A", "B"], "0")).toBeNull();
    expect(mapForKey(["A", "B"], "a")).toBeNull();
  });
});
