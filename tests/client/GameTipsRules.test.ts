import { describe, expect, it } from "vitest";
import {
  EMPTY_GAME_TIP_HISTORY,
  GAME_TIP_IDS,
  GAME_TIP_KEYS,
  GAME_TIP_MIN_INTERVAL_MS,
  GameTipHistory,
  GameTipId,
  GameTipSnapshot,
  pickGameTip,
} from "../../src/client/GameTipsRules";

// A playing, spawned, quiet player: no tip is due in this state.
function quiet(over: Partial<GameTipSnapshot> = {}): GameTipSnapshot {
  return {
    ranked: false,
    spectating: false,
    inSpawnPhase: false,
    hasSpawned: true,
    secondsSinceSpawn: 60,
    elapsedSeconds: 0,
    troops: 0,
    maxTroops: 0,
    gold: 0,
    cityCost: 0,
    cityCount: 1,
    portCount: 1,
    isCoastal: false,
    neighbourCount: 0,
    nationNeighbourCount: 0,
    frontierTiles: 0,
    incomingAttackCount: 0,
    attackRatio: 0.2,
    hasAlliance: false,
    hasOutgoingAllianceRequest: false,
    ...over,
  };
}

const NOW = 1_000_000;
const fresh: GameTipHistory = EMPTY_GAME_TIP_HISTORY;

function history(
  shown: GameTipId[],
  lastShownAtMs = -Infinity,
): GameTipHistory {
  return { shown: new Set(shown), lastShownAtMs };
}

describe("pickGameTip", () => {
  it("returns null when nothing is due", () => {
    expect(pickGameTip(quiet(), fresh, NOW)).toBeNull();
  });

  it("gives the spawn tip while the player has not spawned yet", () => {
    const s = quiet({
      inSpawnPhase: true,
      hasSpawned: false,
      secondsSinceSpawn: null,
    });
    expect(pickGameTip(s, fresh, NOW)).toBe("spawn");
  });

  it("gives no other tip before the spawn", () => {
    const s = quiet({
      inSpawnPhase: true,
      hasSpawned: false,
      secondsSinceSpawn: null,
      incomingAttackCount: 3,
    });
    expect(pickGameTip(s, fresh, NOW)).toBe("spawn");
    expect(
      pickGameTip({ ...s, inSpawnPhase: true }, history(["spawn"]), NOW),
    ).toBeNull();
  });

  it("never shows a tip in ranked games", () => {
    const s = quiet({ ranked: true, incomingAttackCount: 1 });
    expect(pickGameTip(s, fresh, NOW)).toBeNull();
    expect(
      pickGameTip(
        quiet({ ranked: true, inSpawnPhase: true, hasSpawned: false }),
        fresh,
        NOW,
      ),
    ).toBeNull();
  });

  it("never shows a tip to spectators or in replays", () => {
    const s = quiet({ spectating: true, incomingAttackCount: 1 });
    expect(pickGameTip(s, fresh, NOW)).toBeNull();
  });

  it("waits 10 seconds after the spawn", () => {
    const early = quiet({ secondsSinceSpawn: 5, incomingAttackCount: 1 });
    expect(pickGameTip(early, fresh, NOW)).toBeNull();
    const later = quiet({ secondsSinceSpawn: 10, incomingAttackCount: 1 });
    expect(pickGameTip(later, fresh, NOW)).toBe("under_attack");
  });

  it("starts no tip within 45 seconds of the previous one", () => {
    const s = quiet({ incomingAttackCount: 1 });
    const last = NOW - (GAME_TIP_MIN_INTERVAL_MS - 1);
    expect(pickGameTip(s, history([], last), NOW)).toBeNull();
    expect(
      pickGameTip(s, history([], NOW - GAME_TIP_MIN_INTERVAL_MS), NOW),
    ).toBe("under_attack");
  });

  it("shows each tip only once per player", () => {
    const s = quiet({
      incomingAttackCount: 1,
      troops: 1000,
      maxTroops: 1000,
      elapsedSeconds: 30,
    });
    expect(pickGameTip(s, fresh, NOW)).toBe("under_attack");
    expect(pickGameTip(s, history(["under_attack"]), NOW)).toBe("troops_max");
    expect(
      pickGameTip(s, history(["under_attack", "troops_max"]), NOW),
    ).toBeNull();
  });

  it("follows the priority order when several tips are due", () => {
    const s = quiet({
      incomingAttackCount: 1,
      troops: 1000,
      maxTroops: 1000,
      attackRatio: 0.9,
      elapsedSeconds: 300,
      cityCount: 0,
      isCoastal: true,
      portCount: 0,
    });
    expect(pickGameTip(s, fresh, NOW)).toBe("under_attack");
    expect(pickGameTip(s, history(["under_attack"]), NOW)).toBe("troops_max");
    expect(pickGameTip(s, history(["under_attack", "troops_max"]), NOW)).toBe(
      "attack_ratio_high",
    );
  });

  describe("conditions", () => {
    it("troops at max, not before 30 seconds", () => {
      const at = quiet({ troops: 970, maxTroops: 1000, elapsedSeconds: 30 });
      expect(pickGameTip(at, fresh, NOW)).toBe("troops_max");
      expect(pickGameTip({ ...at, elapsedSeconds: 10 }, fresh, NOW)).toBeNull();
      expect(pickGameTip({ ...at, troops: 900 }, fresh, NOW)).toBeNull();
    });

    it("gold piling up, once it covers two cities", () => {
      const s = quiet({ gold: 250_000, cityCost: 125_000, elapsedSeconds: 60 });
      expect(pickGameTip(s, fresh, NOW)).toBe("gold_unused");
      expect(pickGameTip({ ...s, gold: 249_999 }, fresh, NOW)).not.toBe(
        "gold_unused",
      );
      expect(pickGameTip({ ...s, cityCost: 0 }, fresh, NOW)).not.toBe(
        "gold_unused",
      );
    });

    it("no city after three minutes", () => {
      const s = quiet({ cityCount: 0, elapsedSeconds: 180 });
      expect(pickGameTip(s, fresh, NOW)).toBe("no_city");
      expect(pickGameTip({ ...s, elapsedSeconds: 179 }, fresh, NOW)).not.toBe(
        "no_city",
      );
      expect(pickGameTip({ ...s, cityCount: 1 }, fresh, NOW)).not.toBe(
        "no_city",
      );
    });

    it("coastal without a port after four minutes", () => {
      const s = quiet({ isCoastal: true, portCount: 0, elapsedSeconds: 240 });
      expect(pickGameTip(s, fresh, NOW)).toBe("coastal_no_port");
      expect(pickGameTip({ ...s, elapsedSeconds: 239 }, fresh, NOW)).not.toBe(
        "coastal_no_port",
      );
      expect(pickGameTip({ ...s, portCount: 1 }, fresh, NOW)).not.toBe(
        "coastal_no_port",
      );
      expect(pickGameTip({ ...s, isCoastal: false }, fresh, NOW)).not.toBe(
        "coastal_no_port",
      );
    });

    it("attack ratio above 80%", () => {
      const s = quiet({ attackRatio: 0.85, elapsedSeconds: 30 });
      expect(pickGameTip(s, fresh, NOW)).toBe("attack_ratio_high");
      expect(pickGameTip({ ...s, attackRatio: 0.8 }, fresh, NOW)).toBeNull();
    });

    it("pending alliance request", () => {
      const s = quiet({ hasOutgoingAllianceRequest: true });
      expect(pickGameTip(s, fresh, NOW)).toBe("alliance_request_pending");
    });

    it("AI nation as a neighbour", () => {
      const s = quiet({ nationNeighbourCount: 1, elapsedSeconds: 60 });
      expect(pickGameTip(s, fresh, NOW)).toBe("nation_neighbour");
      expect(pickGameTip({ ...s, elapsedSeconds: 59 }, fresh, NOW)).toBeNull();
    });

    it("long frontier with four or more neighbours", () => {
      const s = quiet({
        neighbourCount: 4,
        frontierTiles: 200,
        elapsedSeconds: 120,
      });
      expect(pickGameTip(s, fresh, NOW)).toBe("frontier_long");
      expect(pickGameTip({ ...s, neighbourCount: 3 }, fresh, NOW)).not.toBe(
        "frontier_long",
      );
      expect(pickGameTip({ ...s, frontierTiles: 199 }, fresh, NOW)).not.toBe(
        "frontier_long",
      );
    });

    it("alliances once a neighbour is in reach and no alliance exists", () => {
      const s = quiet({ neighbourCount: 2, elapsedSeconds: 150 });
      expect(pickGameTip(s, fresh, NOW)).toBe("alliances");
      expect(pickGameTip({ ...s, hasAlliance: true }, fresh, NOW)).not.toBe(
        "alliances",
      );
      expect(pickGameTip({ ...s, neighbourCount: 0 }, fresh, NOW)).not.toBe(
        "alliances",
      );
    });

    it("radial menu after the first minute", () => {
      const s = quiet({ elapsedSeconds: 60 });
      expect(pickGameTip(s, fresh, NOW)).toBe("radial_menu");
      expect(pickGameTip({ ...s, elapsedSeconds: 59 }, fresh, NOW)).toBeNull();
    });
  });

  it("has a translation key for every tip", () => {
    expect(new Set(GAME_TIP_IDS).size).toBe(GAME_TIP_IDS.length);
    for (const id of GAME_TIP_IDS) {
      expect(GAME_TIP_KEYS[id]).toBe(`game_tips.${id}`);
    }
  });
});
