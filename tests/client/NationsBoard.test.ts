import { describe, expect, it } from "vitest";
import { nationsBoardRows } from "../../src/client/components/leaderboard/NationsBoard";
import { NationsCountry } from "../../src/core/game/NationsMode";

const country = (name: string): NationsCountry => ({
  name,
  playable: true,
  tiles: 100,
});
const countries = [country("France"), country("Spain"), country("Germany")];

describe("nationsBoardRows", () => {
  it("merges the AI's wins, keyed by name, into their country's row", () => {
    const rows = nationsBoardRows(
      {
        games: 4,
        countries: [
          { nation: 0, name: null, picks: 3, wins: 1 },
          { nation: 1, name: null, picks: 1, wins: 0 },
          { nation: null, name: "France", picks: 0, wins: 2 },
          { nation: null, name: "Germany", picks: 0, wins: 1 },
          // A country the map no longer has.
          { nation: null, name: "Atlantis", picks: 0, wins: 5 },
          { nation: 9, name: null, picks: 2, wins: 0 },
        ],
      },
      countries,
    );
    expect(
      rows.map((r) => [r.country.name, r.picks, r.wins, r.playerWins]),
    ).toEqual([
      ["France", 3, 3, 1],
      ["Spain", 1, 0, 0],
      ["Germany", 0, 1, 0],
    ]);
  });
});
