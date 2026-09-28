import { GameRecap, mainAttacker } from "../../src/client/hud/GameRecap";

function sample(
  second: number,
  tiles: number,
  extra: Partial<{
    troops: number;
    mainAttacker: number | null;
    outgoingAttackIDs: string[];
  }> = {},
) {
  return {
    second,
    tiles,
    troops: extra.troops ?? 0,
    mainAttacker: extra.mainAttacker ?? null,
    outgoingAttackIDs: extra.outgoingAttackIDs ?? [],
  };
}

describe("GameRecap", () => {
  test("keeps the peaks and counts each attack once", () => {
    const recap = new GameRecap(1000);
    recap.add(sample(1, 100, { troops: 50, outgoingAttackIDs: ["a"] }));
    recap.add(sample(2, 250, { troops: 20, outgoingAttackIDs: ["a", "b"] }));
    recap.add(sample(3, 200, { troops: 10 }));
    const s = recap.summary(true);
    expect(s.peakTiles).toBe(250);
    expect(s.peakShare).toBe(25);
    expect(s.peakTroops).toBe(50);
    expect(s.attacksLaunched).toBe(2);
    expect(s.secondsPlayed).toBe(3);
  });

  test("the best minute is the biggest gain within 60 seconds", () => {
    const recap = new GameRecap(10_000);
    // Slow start, then +500 between seconds 100 and 150, then a crash.
    for (let s = 0; s <= 100; s++) recap.add(sample(s, 100 + s));
    for (let s = 101; s <= 150; s++) recap.add(sample(s, 200 + (s - 100) * 10));
    for (let s = 151; s <= 300; s++) recap.add(sample(s, 50));
    const summary = recap.summary(true);
    // Window 90..150: 190 -> 700.
    expect(summary.bestMinuteGain).toBe(510);
    expect(summary.bestMinuteEnd).toBe(150);
  });

  test("the last attacker is who eliminated a dead player", () => {
    const recap = new GameRecap(100);
    recap.add(sample(1, 10, { mainAttacker: 4 }));
    recap.add(sample(2, 5, { mainAttacker: 7 }));
    recap.add(sample(3, 0));
    expect(recap.summary(false).eliminatedBy).toBe(7);
    expect(recap.summary(true).eliminatedBy).toBeNull();
  });

  test("mainAttacker picks the biggest attack still coming", () => {
    expect(
      mainAttacker([
        { attackerID: 1, troops: 500, retreating: true },
        { attackerID: 2, troops: 100, retreating: false },
        { attackerID: 3, troops: 300, retreating: false },
      ]),
    ).toBe(3);
    expect(mainAttacker([])).toBeNull();
  });
});
