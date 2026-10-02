import { beforeEach, describe, expect, test } from "vitest";
import { NationStructureBehavior } from "../src/core/execution/nation/NationStructureBehavior";
import {
  Difficulty,
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { setup } from "./util/Setup";

// A big nation has far fewer structures than the density at which it used to
// switch to upgrading, so it only ever built new ones. Now, once it owns a
// couple of a type, it stacks levels on them too, as players do.

type SpawnStructure = { maybeSpawnStructure(type: UnitType): boolean };

let game: Game;
let nation: Player;

async function setupNation(difficulty: Difficulty) {
  game = await setup("big_plains", { difficulty });
  game.addPlayer(
    new PlayerInfo("nation", PlayerType.Nation, null, "nation_id"),
  );
  nation = game.player("nation_id");
  // A wide empire: 121 × 121 tiles, far below the upgrade density with two
  // cities on it.
  for (let x = 0; x <= 120; x++) {
    for (let y = 0; y <= 120; y++) {
      nation.conquer(game.ref(x, y));
    }
  }
  nation.buildUnit(UnitType.City, game.ref(20, 20), {});
  nation.buildUnit(UnitType.City, game.ref(90, 90), {});
}

function spawnCities(times: number, seed: number) {
  const behavior = new NationStructureBehavior(
    new PseudoRandom(seed),
    game,
    nation,
  ) as unknown as SpawnStructure;
  for (let i = 0; i < times; i++) {
    nation.addGold(100_000_000n);
    behavior.maybeSpawnStructure(UnitType.City);
    game.executeNextTick();
  }
}

function cityLevels(): number[] {
  return nation.units(UnitType.City).map((c) => c.level());
}

describe("nations upgrade their structures", () => {
  beforeEach(async () => {
    await setupNation(Difficulty.Hard);
  });

  test("a big nation with a few cities upgrades some of them", () => {
    // Six rounds leave at most 8 cities on 14,641 tiles: well under the
    // density (1 per 1,500 tiles) that used to be the only upgrade trigger.
    spawnCities(6, 1);
    expect(nation.units(UnitType.City).length).toBeLessThan(9);
    expect(Math.max(...cityLevels())).toBeGreaterThan(1);
  });

  test("it still builds new cities too", () => {
    spawnCities(20, 1);
    expect(nation.units(UnitType.City).length).toBeGreaterThan(2);
  });

  test("it spreads its first cities out before upgrading", async () => {
    await setupNation(Difficulty.Impossible);
    for (const city of nation.units(UnitType.City).slice(1)) city.delete();
    spawnCities(1, 1);
    // With a single city it builds a second one rather than upgrading.
    expect(cityLevels().every((level) => level === 1)).toBe(true);
  });
});

describe("upgrade preference follows difficulty", () => {
  test("Impossible nations upgrade more often than Easy ones", async () => {
    // Few enough rounds that the empire stays under the density at which
    // every difficulty upgrades; summed over seeds to smooth the rolls.
    const upgradesAt = async (difficulty: Difficulty) => {
      let total = 0;
      for (let seed = 1; seed <= 6; seed++) {
        await setupNation(difficulty);
        spawnCities(8, seed);
        total += cityLevels().reduce((sum, level) => sum + level - 1, 0);
      }
      return total;
    };
    const easy = await upgradesAt(Difficulty.Easy);
    const impossible = await upgradesAt(Difficulty.Impossible);
    expect(impossible).toBeGreaterThan(easy);
  });
});
