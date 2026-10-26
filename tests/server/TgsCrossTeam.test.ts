import { describe, expect, it } from "vitest";
import type { AllPlayersStats } from "../../src/core/Schemas";
import {
  crossTeamSuspicions,
  DEFAULT_TGS_SETTINGS,
  TGS_CROSS_TEAM_CODE,
  TgsMonitor,
  TgsSwitch,
  type TgsPlayer,
} from "../../src/server/Tgs";

const MIN = 600; // ticks a minute
const CROSS_TEAM_MINUTES = {
  sameClan: DEFAULT_TGS_SETTINGS.crossTeamSameClanMinutes,
  anyone: DEFAULT_TGS_SETTINGS.crossTeamAnyoneMinutes,
};

const players: TgsPlayer[] = [
  { clientID: "AAAAAAAA", username: "Alice", clanTag: "WOLF" },
  { clientID: "BBBBBBBB", username: "Bob", clanTag: "wolf" },
  { clientID: "CCCCCCCC", username: "Carol", clanTag: null },
];

/** End-of-game stats where `a` and `b` were neighbours, on both of them. */
function pair(
  a: string,
  b: string,
  minutes: number,
  attacks = 0,
  alliedMinutes = 0,
): AllPlayersStats {
  const entry = (client: string) => ({
    client,
    ticks: minutes * MIN,
    allied: alliedMinutes * MIN,
    attacks,
  });
  return { [a]: { neighbors: [entry(b)] }, [b]: { neighbors: [entry(a)] } };
}

describe("crossTeamSuspicions (TGS-103)", () => {
  it("flags same-clan neighbours that never fought, past the clan threshold", () => {
    const found = crossTeamSuspicions(
      players,
      pair("AAAAAAAA", "BBBBBBBB", CROSS_TEAM_MINUTES.sameClan),
    );
    expect(found).toEqual([
      {
        a: "AAAAAAAA",
        b: "BBBBBBBB",
        sameClan: true,
        minutes: CROSS_TEAM_MINUTES.sameClan,
        alliedMinutes: 0,
      },
    ]);
  });

  it("needs longer for players of different clans", () => {
    const short = CROSS_TEAM_MINUTES.anyone - 1;
    expect(
      crossTeamSuspicions(players, pair("AAAAAAAA", "CCCCCCCC", short)),
    ).toEqual([]);
    expect(
      crossTeamSuspicions(
        players,
        pair("AAAAAAAA", "CCCCCCCC", CROSS_TEAM_MINUTES.anyone),
      ),
    ).toHaveLength(1);
  });

  it("never flags neighbours who attacked each other", () => {
    expect(
      crossTeamSuspicions(players, pair("AAAAAAAA", "BBBBBBBB", 30, 1)),
    ).toEqual([]);
  });

  it("does not flag a short neighbourhood", () => {
    expect(
      crossTeamSuspicions(
        players,
        pair("AAAAAAAA", "BBBBBBBB", CROSS_TEAM_MINUTES.sameClan - 1),
      ),
    ).toEqual([]);
  });
});

describe("TgsMonitor.observeCrossTeaming", () => {
  it("files one incident per player, naming the partner, and disconnects nobody", () => {
    const monitor = new TgsMonitor(new TgsSwitch());
    monitor.observeCrossTeaming(
      players,
      pair("AAAAAAAA", "BBBBBBBB", 12, 0, 5),
      7200,
    );
    const incidents = monitor.report()!.incidents;
    expect(incidents).toHaveLength(2);
    expect(incidents.every((i) => i.code === TGS_CROSS_TEAM_CODE)).toBe(true);
    const alice = incidents.find((i) => i.clientID === "AAAAAAAA")!;
    expect(alice.details).toContain("Bob [wolf]");
    expect(alice.details).toContain("12 min");
    expect(alice.details).toContain("5 as allies");
    expect(alice.details).toContain("same clan");
  });

  it("does nothing while TGS is switched off", () => {
    const off = new TgsSwitch();
    off.set(false);
    const monitor = new TgsMonitor(off);
    monitor.observeCrossTeaming(players, pair("AAAAAAAA", "BBBBBBBB", 30), 0);
    expect(monitor.report()).toBeUndefined();
  });
});
