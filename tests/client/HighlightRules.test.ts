import { describe, expect, it } from "vitest";
import {
  HIGHLIGHT_MIN_GAP_S,
  HIGHLIGHT_STALE_S,
  HighlightPlayer,
  HighlightSnapshot,
  HighlightTracker,
  dominationThreshold,
  rankPlayers,
  territoryPercent,
} from "../../src/client/HighlightRules";

function p(
  id: string,
  tiles: number,
  extra: Partial<HighlightPlayer> = {},
): HighlightPlayer {
  return {
    id,
    name: id.toUpperCase(),
    tiles,
    alive: true,
    isBot: false,
    attacking: new Map(),
    ...extra,
  };
}

function snap(
  t: number,
  players: HighlightPlayer[],
  extra: Partial<HighlightSnapshot> = {},
): HighlightSnapshot {
  return {
    elapsedSeconds: t,
    inSpawnPhase: false,
    landTiles: 1000,
    players,
    ...extra,
  };
}

const field = (): HighlightPlayer[] => [
  p("a", 100),
  p("b", 90),
  p("c", 80),
  p("d", 70),
  p("e", 60),
  p("f", 10),
];

describe("helpers", () => {
  it("computes shares and thresholds", () => {
    expect(territoryPercent(399, 1000)).toBe(39);
    expect(territoryPercent(5, 0)).toBe(0);
    expect(dominationThreshold(24)).toBeNull();
    expect(dominationThreshold(25)).toBe(25);
    expect(dominationThreshold(59)).toBe(40);
    expect(dominationThreshold(80)).toBe(60);
  });

  it("ranks alive non-bot players only", () => {
    const ranked = rankPlayers([
      p("a", 5),
      p("b", 9),
      p("c", 50, { isBot: true }),
      p("d", 70, { alive: false }),
    ]);
    expect(ranked.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("HighlightTracker", () => {
  it("stays silent during the spawn phase", () => {
    const t = new HighlightTracker();
    expect(t.update(snap(0, [p("a", 900)], { inSpawnPhase: true }))).toBeNull();
    // The first post-spawn look is the baseline: not news.
    expect(t.update(snap(1, [p("a", 900)]))).toBeNull();
  });

  it("announces each domination threshold once", () => {
    const t = new HighlightTracker();
    t.update(snap(1, [p("a", 100), p("b", 90)]));
    const h = t.update(snap(2, [p("a", 260), p("b", 90)]));
    expect(h?.kind).toBe("domination");
    expect(h?.params).toEqual({ name: "A", percent: 25 });
    expect(t.update(snap(200, [p("a", 270), p("b", 90)]))).toBeNull();
    const h2 = t.update(snap(300, [p("a", 410), p("b", 90)]));
    expect(h2?.params.percent).toBe(40);
  });

  it("announces a change of leader after a long lead only", () => {
    const t = new HighlightTracker();
    t.update(snap(1, [p("a", 100), p("b", 90)]));
    // A short lead lost again is not worth a banner.
    expect(t.update(snap(30, [p("a", 100), p("b", 120)]))).toBeNull();
    expect(t.update(snap(40, [p("a", 150), p("b", 120)]))).toBeNull();
    const t2 = new HighlightTracker();
    t2.update(snap(1, [p("a", 100), p("b", 90)]));
    t2.update(snap(150, [p("a", 100), p("b", 90)]));
    const lead = t2.update(snap(160, [p("a", 100), p("b", 120)]));
    expect(lead?.kind).toBe("lead_change");
    expect(lead?.params.name).toBe("B");
  });

  it("does not call the death of a leader a turnaround", () => {
    const t = new HighlightTracker();
    t.update(snap(1, field()));
    const players = field();
    players[0] = p("a", 0, { alive: false });
    const h = t.update(snap(200, players));
    expect(h?.kind).toBe("giant_fallen");
    expect(t.update(snap(300, players))).toBeNull();
  });

  it("announces the fall of a top-3 player, not of a small one", () => {
    const t = new HighlightTracker();
    t.update(snap(1, field()));
    const players = field();
    players[1] = p("b", 0, { alive: false });
    const h = t.update(snap(2, players));
    expect(h?.kind).toBe("giant_fallen");
    expect(h?.params.name).toBe("B");

    const t2 = new HighlightTracker();
    t2.update(snap(1, field()));
    const small = field();
    small[5] = p("f", 0, { alive: false });
    expect(t2.update(snap(2, small))).toBeNull();
  });

  it("announces a streak of eliminations, never counting bots", () => {
    const t = new HighlightTracker();
    const mk = (dead: string[], t0: number) =>
      snap(t0, [
        p("k", 500, {
          attacking: new Map(["x", "y", "z", "w"].map((id) => [id, 50])),
        }),
        p("g1", 400),
        p("g2", 300),
        p("g3", 200),
        ...["x", "y", "z"].map((id) =>
          p(id, dead.includes(id) ? 0 : 5, { alive: !dead.includes(id) }),
        ),
        p("w", 0, { isBot: true, alive: dead.includes("w") ? false : true }),
      ]);
    t.update(mk([], 1));
    expect(t.update(mk(["x"], 2))).toBeNull();
    expect(t.update(mk(["x", "y"], 3))).toBeNull();
    const h = t.update(mk(["x", "y", "z"], 4));
    expect(h?.kind).toBe("killing_spree");
    expect(h?.params).toEqual({ name: "K", count: 3 });
  });

  it("announces a war between two big players after it lasts", () => {
    const t = new HighlightTracker();
    const war = (time: number) =>
      snap(time, [
        p("a", 100, { attacking: new Map([["b", 10]]) }),
        p("b", 90, { attacking: new Map([["a", 10]]) }),
        p("c", 10),
      ]);
    t.update(war(1));
    t.update(war(10));
    expect(t.update(war(20))).toBeNull();
    const h = t.update(war(30));
    expect(h?.kind).toBe("total_war");
    expect(h?.params).toEqual({ a: "A", b: "B" });
    expect(t.update(war(300))).toBeNull();
  });

  it("announces a comeback from last place to the top 3", () => {
    const t = new HighlightTracker();
    t.update(snap(1, field()));
    t.update(snap(100, field()));
    const climbed = field();
    climbed[5] = p("f", 95);
    const h = t.update(snap(110, climbed));
    expect(h?.kind).toBe("comeback");
    expect(h?.params.name).toBe("F");
  });

  it("limits the rate, keeps priority and drops stale news", () => {
    const t = new HighlightTracker();
    t.update(snap(1, field()));
    // Two events at once: the fall of a giant beats the domination.
    const players = field();
    players[0] = p("a", 300);
    players[1] = p("b", 0, { alive: false });
    const first = t.update(snap(2, players));
    expect(first?.kind).toBe("giant_fallen");
    // The domination waits for the gap, then shows.
    expect(t.update(snap(2 + HIGHLIGHT_MIN_GAP_S - 1, players))).toBeNull();
    const second = t.update(snap(2 + HIGHLIGHT_MIN_GAP_S, players));
    expect(second?.kind).toBe("domination");

    const t2 = new HighlightTracker();
    t2.update(snap(1, field()));
    t2.update(snap(2, players));
    expect(t2.update(snap(3 + HIGHLIGHT_STALE_S + 5, players))).toBeNull();
  });

  it("does not repeat a banner for the same player within the cooldown", () => {
    const t = new HighlightTracker();
    t.update(snap(1, field()));
    const big = field();
    big[0] = p("a", 300);
    expect(t.update(snap(2, big))?.kind).toBe("domination");
    big[0] = p("a", 450);
    // The 40 % threshold is about the same player, still cooling down.
    expect(t.update(snap(40, big))).toBeNull();
  });
});
