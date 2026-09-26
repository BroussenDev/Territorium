import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import { UpgradeStructureExecution } from "../src/core/execution/UpgradeStructureExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  RankedType,
  Unit,
  UnitType,
} from "../src/core/game/Game";
import { GameConfig } from "../src/core/Schemas";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

const MINUTE = 60 * 10;

let game: Game;
let player: Player;

async function start(config: Partial<GameConfig> = {}) {
  game = await setup("plains", {
    infiniteGold: true,
    instantBuild: true,
    ...config,
  });
  const info = new PlayerInfo("player", PlayerType.Human, null, "player");
  game.addPlayer(info);
  game.addExecution(new SpawnExecution("game", info, game.ref(1, 1)));
  executeTicks(game, 2);
  player = game.player("player");
}

/** Builds on the n-th tile of the player's land, so it isn't captured. */
function build(type: UnitType, n: number): Unit {
  return player.buildUnit(type, Array.from(player.tiles())[n], {});
}

function upgrade(unit: Unit, amount = 1) {
  game.addExecution(new UpgradeStructureExecution(player, unit.id(), amount));
  game.executeNextTick();
}

/** Runs the game until `minutes` after the spawn phase ended. */
function advanceTo(minutes: number) {
  executeTicks(game, minutes * MINUTE - game.elapsedGameSeconds() * 10);
}

describe("Military structure levels", () => {
  test("SAM levels unlock at 5, 10, 15 and 20 minutes, up to level 5", async () => {
    await start();
    const sam = build(UnitType.SAMLauncher, 0);
    expect(player.upgradesLeft(sam)).toBe(0);
    expect(player.canUpgradeUnit(sam)).toBe(false);
    upgrade(sam);
    expect(sam.level()).toBe(1);

    advanceTo(5);
    expect(player.upgradesLeft(sam)).toBe(1);
    advanceTo(10);
    expect(player.upgradesLeft(sam)).toBe(2);
    advanceTo(20);
    expect(player.upgradesLeft(sam)).toBe(4);

    // A bulk upgrade stops at the cap.
    upgrade(sam, 10);
    expect(sam.level()).toBe(5);
    expect(player.upgradesLeft(sam)).toBe(0);
    expect(player.canUpgradeUnit(sam)).toBe(false);
  });

  test("silos and radars stop at level 3", async () => {
    await start();
    const silo = build(UnitType.MissileSilo, 0);
    const radar = build(UnitType.Radar, 1);
    advanceTo(20);
    upgrade(silo, 10);
    upgrade(radar, 10);
    expect(silo.level()).toBe(3);
    expect(radar.level()).toBe(3);
  });

  test("ranked games cap lower and unlock later", async () => {
    await start({ rankedType: RankedType.FFA });
    const sam = build(UnitType.SAMLauncher, 0);
    const silo = build(UnitType.MissileSilo, 1);
    const radar = build(UnitType.Radar, 2);

    advanceTo(5);
    expect(player.upgradesLeft(sam)).toBe(0);
    advanceTo(8);
    expect(player.upgradesLeft(sam)).toBe(1);
    expect(player.upgradesLeft(silo)).toBe(1);
    advanceTo(15);
    expect(player.upgradesLeft(sam)).toBe(2);
    expect(player.upgradesLeft(silo)).toBe(1);
    expect(player.upgradesLeft(radar)).toBe(1);

    upgrade(sam, 10);
    upgrade(silo, 10);
    upgrade(radar, 10);
    expect(sam.level()).toBe(3);
    expect(silo.level()).toBe(2);
    expect(radar.level()).toBe(2);
  });

  test("the build menu only prices the levels still available", async () => {
    await start();
    const silo = build(UnitType.MissileSilo, 0);
    advanceTo(10);
    const [bu] = player.buildableUnits(silo.tile(), [UnitType.MissileSilo]);
    expect(bu.canUpgrade).toBe(silo.id());
    expect(bu.upgradeCosts).toHaveLength(2);

    upgrade(silo, 2);
    const [maxed] = player.buildableUnits(silo.tile(), [UnitType.MissileSilo]);
    expect(maxed.canUpgrade).toBe(false);
  });

  test("economy structures upgrade right away, without a cap", async () => {
    await start();
    const city = build(UnitType.City, 0);
    expect(game.config().maxStructureLevel(UnitType.City)).toBe(Infinity);
    upgrade(city, 8);
    expect(city.level()).toBe(9);
  });

  test("each radar level adds 25 tiles of range", async () => {
    await start();
    const config = game.config();
    expect(config.unitInfo(UnitType.Radar).upgradable).toBe(true);
    expect([1, 2, 3].map((l) => config.radarRange(l))).toEqual([100, 125, 150]);
  });
});
