import { describe, expect, it } from "vitest";
import { estimateAttack } from "../src/core/game/AttackEstimate";
import { GameMode, PlayerType, TerrainType } from "../src/core/game/Game";
import { setup } from "./util/Setup";
import { UseRealAttackLogic } from "./util/TestConfig";

async function config() {
  const game = await setup(
    "plains",
    { gameMode: GameMode.FFA },
    [],
    __dirname + "/util",
    UseRealAttackLogic,
  );
  return game.config();
}

const base = (
  terrain: TerrainType,
  defender: null | { troops: number; numTiles: number },
) => ({
  terrain,
  attacker: { type: PlayerType.Human, numTiles: 5_000 },
  defender:
    defender === null
      ? null
      : {
          type: PlayerType.Human,
          isTraitor: false,
          isDisconnectedTeammate: false,
          ...defender,
        },
  defenderHasDefensePost: false,
  falloutRatio: null,
  borderSize: 50,
});

describe("attack estimate", () => {
  it("matches the simulation's rule on the first tile", async () => {
    const c = await config();
    const input = base(TerrainType.Plains, {
      troops: 100_000,
      numTiles: 1_000,
    });
    const one = estimateAttack(c, input, 50_000, 1);
    const logic = c.attackLogic({ ...input, attackTroops: 50_000 });
    expect(one.tiles).toBe(1);
    expect(one.lost).toBe(Math.round(logic.attackerTroopLoss));
    expect(one.seconds).toBeCloseTo(logic.tickFraction / 10);
  });

  it("stops when the attack runs out of troops, and costs more in the mountains", async () => {
    const c = await config();
    const defender = { troops: 200_000, numTiles: 5_000 };
    const plains = estimateAttack(
      c,
      base(TerrainType.Plains, defender),
      30_000,
    );
    const mountain = estimateAttack(
      c,
      base(TerrainType.Mountain, defender),
      30_000,
    );
    expect(plains.lost).toBeGreaterThanOrEqual(29_000);
    expect(plains.wipesOut).toBe(false);
    expect(mountain.tiles).toBeLessThan(plains.tiles);
  });

  it("wipes out a small defender", async () => {
    const c = await config();
    const e = estimateAttack(
      c,
      base(TerrainType.Plains, { troops: 1_000, numTiles: 40 }),
      50_000,
    );
    expect(e.tiles).toBe(40);
    expect(e.wipesOut).toBe(true);
    expect(e.lost).toBeLessThan(50_000);
  });

  it("is slower in the mountains on open land, even for a big army", async () => {
    const c = await config();
    const plains = estimateAttack(
      c,
      base(TerrainType.Plains, null),
      200_000,
      100,
    );
    const mountain = estimateAttack(
      c,
      base(TerrainType.Mountain, null),
      200_000,
      100,
    );
    expect(mountain.seconds).toBeGreaterThan(plains.seconds * 1.4);
  });
});
