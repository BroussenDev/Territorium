import { describe, expect, it } from "vitest";
import {
  buildAttackFronts,
  FRONT_INCOMING,
  FRONT_OUTGOING,
} from "../../src/client/render/frame/derive/AttackFronts";

const attack = (attackerID: number, targetID: number, retreating = false) => ({
  attackerID,
  targetID,
  retreating,
});

describe("attack fronts", () => {
  it("flags the players I attack and the players attacking me", () => {
    const fronts = buildAttackFronts([attack(1, 5)], [attack(9, 1)]);
    expect(fronts[5]).toBe(FRONT_OUTGOING);
    expect(fronts[9]).toBe(FRONT_INCOMING);
    expect(fronts[3]).toBe(0);
  });

  it("sets both flags when two players fight each other", () => {
    const fronts = buildAttackFronts([attack(1, 7)], [attack(7, 1)]);
    expect(fronts[7]).toBe(FRONT_OUTGOING | FRONT_INCOMING);
  });

  it("leaves out unclaimed land and retreating attacks", () => {
    const fronts = buildAttackFronts(
      [attack(1, 0), attack(1, 4, true)],
      [attack(6, 1, true)],
    );
    expect(fronts[0]).toBe(0);
    expect(fronts[4]).toBe(0);
    expect(fronts[6]).toBe(0);
  });

  it("starts from a clean slate each tick", () => {
    buildAttackFronts([attack(1, 5)], []);
    expect(buildAttackFronts([], [])[5]).toBe(0);
  });
});
