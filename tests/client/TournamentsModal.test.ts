import { describe, expect, it } from "vitest";
import { formatLabel } from "../../src/client/TournamentsModal";

describe("tournament formats", () => {
  it("names each format with its sizes", () => {
    expect(formatLabel({ format: "duel", teamSize: 1, matchSize: 2 })).toBe(
      "1v1",
    );
    expect(formatLabel({ format: "duo", teamSize: 2, matchSize: 2 })).toBe(
      "2v2",
    );
    expect(formatLabel({ format: "teams", teamSize: 4, matchSize: 2 })).toMatch(
      /teams|4/,
    );
    expect(formatLabel({ format: "ffa", teamSize: 1, matchSize: 8 })).toMatch(
      /ffa|8/,
    );
  });
});
