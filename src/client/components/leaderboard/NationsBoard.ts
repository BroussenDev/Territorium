import { NationsLeaderboardResponse } from "../../../core/ApiSchemas";
import { NationsCountry } from "../../../core/game/NationsMode";

export interface NationsBoardRow {
  index: number;
  country: NationsCountry;
  // Games a human played this country.
  picks: number;
  // Games this country won, whoever played it.
  wins: number;
  // Games a human playing this country won.
  playerWins: number;
}

// One row per country on the Nations board, most played first. The API keys
// the nation AI's wins by country name: they are matched back to countries
// here, and a name no country has any more is dropped.
export function nationsBoardRows(
  board: NationsLeaderboardResponse,
  countries: NationsCountry[],
): NationsBoardRow[] {
  const byName = new Map(countries.map((c, i) => [c.name, i]));
  const rows = new Map<number, NationsBoardRow>();
  const row = (index: number) => {
    let r = rows.get(index);
    if (r === undefined) {
      r = {
        index,
        country: countries[index],
        picks: 0,
        wins: 0,
        playerWins: 0,
      };
      rows.set(index, r);
    }
    return r;
  };
  for (const entry of board.countries) {
    const index =
      entry.nation ??
      (entry.name !== null ? byName.get(entry.name) : undefined);
    if (index === undefined || countries[index] === undefined) continue;
    const r = row(index);
    r.picks += entry.picks;
    r.wins += entry.wins;
    if (entry.nation !== null) r.playerWins += entry.wins;
  }
  return [...rows.values()].sort(
    (a, b) =>
      b.picks - a.picks ||
      b.wins - a.wins ||
      a.country.name.localeCompare(b.country.name),
  );
}
