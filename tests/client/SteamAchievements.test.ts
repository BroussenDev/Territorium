import { describe, expect, it, vi } from "vitest";
import {
  ACHIEVEMENTS as A,
  type AchievementProgress,
  achievementsForAccount,
  achievementsForEliminations,
  achievementsForGameEnd,
  type GameEnd,
  unlock,
} from "../../src/client/SteamAchievements";

const fresh = (): AchievementProgress => ({
  wins: 0,
  rankedGames: 0,
  eliminations: 0,
  lastGame: null,
  lastWon: false,
});

const end = (over: Partial<GameEnd> = {}): GameEnd => ({
  gameID: "g1",
  won: false,
  ranked: false,
  variant: null,
  versusTeamSize: 1,
  teamGame: false,
  hadAlly: true,
  ...over,
});

describe("Steam achievements", () => {
  it("unlocks the first step on any finished game", () => {
    expect(achievementsForGameEnd(end(), fresh())).toEqual([A.firstStep]);
  });

  it("counts a game once, however often its end shows", () => {
    const p = fresh();
    achievementsForGameEnd(end({ ranked: true }), p);
    achievementsForGameEnd(end({ ranked: true, won: true }), p);
    achievementsForGameEnd(end({ ranked: true, won: true }), p);
    expect(p).toMatchObject({ wins: 1, rankedGames: 1 });
  });

  it("unlocks the win counts at 10, 50 and 200", () => {
    const p = { ...fresh(), wins: 9 };
    expect(achievementsForGameEnd(end({ won: true }), p)).toContain(A.veteran);
    p.wins = 49;
    const at50 = achievementsForGameEnd(end({ gameID: "g2", won: true }), p);
    expect(at50).toContain(A.conqueror);
    expect(at50).not.toContain(A.livingLegend);
    p.wins = 199;
    expect(
      achievementsForGameEnd(end({ gameID: "g3", won: true }), p),
    ).toContain(A.livingLegend);
  });

  it("unlocks the mode wins", () => {
    const win = (o: Partial<GameEnd>) =>
      achievementsForGameEnd(end({ won: true, ...o }), fresh());
    expect(win({ variant: "nations" })).toContain(A.sovereignNation);
    expect(win({ variant: "conquest" })).toContain(A.goalMaster);
    expect(win({ variant: "survival", teamGame: true })).toContain(
      A.lastLineOfDefense,
    );
    expect(win({ variant: "versus", versusTeamSize: 1 })).toContain(A.duelist);
    const team = win({ variant: "versus", versusTeamSize: 3, teamGame: true });
    expect(team).toContain(A.brothersInArms);
    expect(team).not.toContain(A.duelist);
    expect(win({ ranked: true })).toContain(A.podium);
  });

  it("gives no mode win on a loss", () => {
    const out = achievementsForGameEnd(
      end({ variant: "nations", ranked: true }),
      fresh(),
    );
    expect(out).not.toContain(A.sovereignNation);
    expect(out).not.toContain(A.podium);
  });

  it("unlocks Unallied only for a win alone, outside team games", () => {
    const win = (o: Partial<GameEnd>) =>
      achievementsForGameEnd(end({ won: true, ...o }), fresh());
    expect(win({ hadAlly: false })).toContain(A.unallied);
    expect(win({ hadAlly: true })).not.toContain(A.unallied);
    expect(win({ hadAlly: false, teamGame: true })).not.toContain(A.unallied);
  });

  it("unlocks First Ranking at 10 ranked games", () => {
    const p = { ...fresh(), rankedGames: 9 };
    expect(achievementsForGameEnd(end({ ranked: true }), p)).toContain(
      A.firstRanking,
    );
  });

  it("unlocks Warlord at 50 eliminations", () => {
    const p = { ...fresh(), eliminations: 48 };
    expect(achievementsForEliminations(1, p)).toEqual([]);
    expect(achievementsForEliminations(1, p)).toEqual([A.warlord]);
  });

  it("unlocks the clan and Pioneer achievements from the account", () => {
    expect(achievementsForAccount(false)).toEqual([]);
    const me = (clans: unknown[], pioneer: unknown) =>
      ({ player: { clans }, pioneer }) as never;
    expect(achievementsForAccount(me([], null))).toEqual([]);
    expect(
      achievementsForAccount(me([{ tag: "ABC" }], { since: "x", seen: true })),
    ).toEqual([A.bloodBrothers, A.pioneer]);
  });
});

describe("unlocking through the Steam app", () => {
  it("waits for the launch screens to end", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    (window as { openfrontDesktop?: unknown }).openfrontDesktop = {
      steam: {
        unlockAchievement: async (name: string) => {
          calls.push(name);
          return { ok: true, unlocked: false };
        },
      },
    };
    const splash = document.createElement("div");
    splash.id = "territorium-splash";
    document.body.appendChild(splash);
    unlock([A.pioneer]);
    vi.advanceTimersByTime(2000);
    expect(calls).toEqual([]);
    splash.remove();
    vi.advanceTimersByTime(600);
    expect(calls).toEqual([A.pioneer]);
    delete (window as { openfrontDesktop?: unknown }).openfrontDesktop;
    vi.useRealTimers();
  });
});
