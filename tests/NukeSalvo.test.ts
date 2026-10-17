import { ConstructionExecution } from "../src/core/execution/ConstructionExecution";
import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  RankedType,
  UnitType,
} from "../src/core/game/Game";
import {
  MIRV_COOLDOWN_TICKS,
  NUKE_SALVO_SIZE,
  NUKE_SALVO_WINDOW_TICKS,
  nukeCooldownLeft,
  withNukeLaunch,
  type NukeLaunches,
} from "../src/core/game/NukeSalvo";
import { setup } from "./util/Setup";
import { executeTicks } from "./util/utils";

const none: NukeLaunches = { salvo: [], lastMirv: -1 };

describe("nuke salvo rules", () => {
  it("allows a salvo of bombs, then waits for its oldest to leave the window", () => {
    let l = none;
    for (const t of [100, 110, 120]) {
      expect(nukeCooldownLeft(l, UnitType.AtomBomb, t)).toBe(0);
      l = withNukeLaunch(l, UnitType.AtomBomb, t);
    }
    expect(NUKE_SALVO_SIZE).toBe(3);
    // Atom, hydrogen and EMP bombs share the salvo.
    expect(nukeCooldownLeft(l, UnitType.HydrogenBomb, 130)).toBe(
      100 + NUKE_SALVO_WINDOW_TICKS - 130,
    );
    expect(
      nukeCooldownLeft(l, UnitType.EMPBomb, 100 + NUKE_SALVO_WINDOW_TICKS),
    ).toBe(0);
    // MIRVs are not part of it.
    expect(nukeCooldownLeft(l, UnitType.MIRV, 130)).toBe(0);
  });

  it("keeps a MIRV reloading for a while after the last one", () => {
    const l = withNukeLaunch(none, UnitType.MIRV, 500);
    expect(nukeCooldownLeft(l, UnitType.MIRV, 600)).toBe(
      MIRV_COOLDOWN_TICKS - 100,
    );
    expect(nukeCooldownLeft(l, UnitType.MIRV, 500 + MIRV_COOLDOWN_TICKS)).toBe(
      0,
    );
    // A MIRV doesn't use up the salvo.
    expect(nukeCooldownLeft(l, UnitType.AtomBomb, 600)).toBe(0);
  });
});

describe("nuke salvo in a game", () => {
  let game: Game;
  let player: Player;

  async function build(extra: Record<string, unknown> = {}) {
    const info = new PlayerInfo("p", PlayerType.Human, null, "p");
    game = await setup(
      "big_plains",
      { infiniteGold: true, instantBuild: true, ...extra },
      [info],
    );
    player = game.player("p");
    for (let x = 0; x < 200; x++) {
      for (let y = 0; y < 200; y++) player.conquer(game.ref(x, y));
    }
    // Four loaded silos: tubes are never what stops the fourth bomb.
    for (const y of [20, 60, 100, 140]) {
      const silo = player.buildUnit(UnitType.MissileSilo, game.ref(20, y), {});
      silo.increaseLevel();
      silo.reloadMissile();
    }
  }

  it("refuses a fourth bomb within the minute, whatever the silos", async () => {
    await build();
    const target = game.ref(180, 180);
    game.addExecution(
      new ConstructionExecution(
        player,
        UnitType.AtomBomb,
        target,
        undefined,
        3,
      ),
    );
    executeTicks(game, 3);
    expect(player.units(UnitType.AtomBomb)).toHaveLength(3);
    expect(player.canBuild(UnitType.AtomBomb, target)).toBe(false);
    expect(player.nukeCooldownLeft(UnitType.AtomBomb)).toBeGreaterThan(0);
    executeTicks(game, NUKE_SALVO_WINDOW_TICKS);
    expect(player.nukeCooldownLeft(UnitType.AtomBomb)).toBe(0);
  });

  it("has no MIRV in ranked games", async () => {
    await build({ rankedType: RankedType.FFA });
    expect(game.config().isUnitDisabled(UnitType.MIRV)).toBe(true);
    expect(game.config().isUnitDisabled(UnitType.AtomBomb)).toBe(false);
  });
});
