import { Config } from "../../src/core/configuration/Config";
import { AllianceRequestExecution } from "../../src/core/execution/alliance/AllianceRequestExecution";
import { NukeExecution } from "../../src/core/execution/NukeExecution";
import { SAMLauncherExecution } from "../../src/core/execution/SAMLauncherExecution";
import {
  Game,
  MessageType,
  Player,
  PlayerInfo,
  PlayerType,
  Unit,
  UnitType,
} from "../../src/core/game/Game";
import { GameUpdateType } from "../../src/core/game/GameUpdates";
import { setup } from "../util/Setup";
import { TestConfig } from "../util/TestConfig";
import { executeTicks } from "../util/utils";

let game: Game;
let attacker: Player;
let defender: Player;
let ally: Player;

// Fires an EMP from the attacker's silo at (0, 0) and runs it to impact.
function fireEmp(x: number, y: number) {
  game.addExecution(
    new NukeExecution(UnitType.EMPBomb, attacker, game.ref(x, y), null),
  );
  const messages: {
    message: string;
    type: MessageType;
    playerID: number | null;
  }[] = [];
  for (let i = 0; i < 40; i++) {
    const updates = game.executeNextTick();
    for (const e of updates[GameUpdateType.DisplayEvent] ?? []) {
      messages.push({
        message: e.message,
        type: e.messageType,
        playerID: e.playerID,
      });
    }
    if (game.units(UnitType.EMPBomb).length === 0 && i > 1) break;
  }
  return messages;
}

// An EMP flying past (x, y) on a short straight path, as in the SAM tests.
function buildEmpInFlight(x: number, y: number) {
  attacker.buildUnit(UnitType.EMPBomb, game.ref(x + 1, y), {
    targetTile: game.ref(x + 2, y),
    trajectory: [
      { tile: game.ref(x, y), targetable: true },
      { tile: game.ref(x + 1, y), targetable: true },
      { tile: game.ref(x + 2, y), targetable: true },
    ],
  });
}

function conquerSquare(player: Player, x0: number, y0: number, size: number) {
  for (let x = x0; x < x0 + size; x++) {
    for (let y = y0; y < y0 + size; y++) {
      player.conquer(game.ref(x, y));
    }
  }
}

describe("EMP bomb", () => {
  beforeEach(async () => {
    game = await setup(
      "plains",
      { infiniteGold: true, instantBuild: true, infiniteTroops: true },
      [
        new PlayerInfo("attacker", PlayerType.Human, "c1", "attacker"),
        new PlayerInfo("defender", PlayerType.Human, "c2", "defender"),
        new PlayerInfo("ally", PlayerType.Human, "c3", "ally"),
      ],
    );
    attacker = game.player("attacker");
    defender = game.player("defender");
    ally = game.player("ally");

    conquerSquare(attacker, 0, 0, 5);
    conquerSquare(defender, 30, 30, 30);
    conquerSquare(ally, 60, 40, 10);
    attacker.buildUnit(UnitType.MissileSilo, game.ref(0, 0), {});
    // TestConfig shrinks every blast to one tile; give the EMP its real reach.
    (game.config() as TestConfig).nukeMagnitudes = (type: UnitType) =>
      type === UnitType.EMPBomb
        ? Config.prototype.nukeMagnitudes(type)
        : { inner: 1, outer: 1 };
  });

  test("has a 20-tile radius and a 15 s outage", () => {
    expect(Config.prototype.nukeMagnitudes(UnitType.EMPBomb).outer).toBe(20);
    expect(Config.prototype.nukeSpeed(UnitType.EMPBomb)).toBe(10);
    expect(game.config().empDisableTicks()).toBe(150);
    expect(game.config().empImmunityTicks()).toBe(450);
  });

  test("disables enemy structures in range without destroying anything", () => {
    const post = defender.buildUnit(UnitType.DefensePost, game.ref(50, 50), {});
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(52, 50), {});
    const silo = defender.buildUnit(UnitType.MissileSilo, game.ref(50, 52), {});
    const city = defender.buildUnit(UnitType.City, game.ref(48, 50), {});
    const farPost = defender.buildUnit(
      UnitType.DefensePost,
      game.ref(31, 31),
      {},
    );
    // Keep the SAM from shooting the EMP down.
    sam.disable(0, 0);
    const tilesBefore = defender.numTilesOwned();
    const troopsBefore = defender.troops();

    const messages = fireEmp(50, 50);

    expect(post.isDisabled()).toBe(true);
    expect(sam.isDisabled()).toBe(true);
    expect(silo.isDisabled()).toBe(true);
    // Cities aren't affected, nor structures outside the 20-tile radius.
    expect(city.isDisabled()).toBe(false);
    expect(farPost.isDisabled()).toBe(false);

    expect(post.isActive()).toBe(true);
    expect(city.isActive()).toBe(true);
    expect(defender.numTilesOwned()).toBe(tilesBefore);
    expect(defender.troops()).toBe(troopsBefore);
    expect(game.owner(game.ref(50, 50))).toBe(defender);

    expect(messages.map((m) => m.message)).toContain(
      "events_display.emp_inbound",
    );
    expect(messages.map((m) => m.message)).toContain("events_display.emp_hit");
  });

  test("structures recover after 15 seconds", () => {
    const post = defender.buildUnit(UnitType.DefensePost, game.ref(50, 50), {});
    fireEmp(50, 50);
    expect(post.isDisabled()).toBe(true);
    const until = post.disabledUntil();
    executeTicks(game, until - game.ticks());
    expect(post.isDisabled()).toBe(false);
  });

  test("a recently hit structure is immune to a second EMP", () => {
    const post = defender.buildUnit(UnitType.DefensePost, game.ref(50, 50), {});
    fireEmp(50, 50);
    const firstUntil = post.disabledUntil();
    executeTicks(game, firstUntil - game.ticks());
    expect(post.isDisabled()).toBe(false);

    // Still inside the 30 s immunity after recovering.
    fireEmp(50, 50);
    expect(post.isDisabled()).toBe(false);
    expect(post.disabledUntil()).toBe(firstUntil);
  });

  test("leaves own and allied structures alone and keeps the alliance", () => {
    game.addExecution(new AllianceRequestExecution(attacker, ally.id()));
    game.executeNextTick();
    game.addExecution(new AllianceRequestExecution(ally, attacker.id()));
    game.executeNextTick();
    expect(attacker.isAlliedWith(ally)).toBe(true);

    const allyPost = ally.buildUnit(UnitType.DefensePost, game.ref(62, 45), {});
    const enemyPost = defender.buildUnit(
      UnitType.DefensePost,
      game.ref(57, 45),
      {},
    );
    fireEmp(60, 45);

    expect(allyPost.isDisabled()).toBe(false);
    expect(enemyPost.isDisabled()).toBe(true);
    expect(attacker.isAlliedWith(ally)).toBe(true);
  });

  test("a disabled silo can't launch", () => {
    const enemySilo = defender.buildUnit(
      UnitType.MissileSilo,
      game.ref(50, 50),
      {},
    );
    expect(defender.canBuild(UnitType.AtomBomb, game.ref(2, 2))).toBe(
      enemySilo.tile(),
    );
    fireEmp(50, 50);
    expect(enemySilo.isDisabled()).toBe(true);
    expect(defender.canBuild(UnitType.AtomBomb, game.ref(2, 2))).toBe(false);
  });

  test("an enemy SAM shoots it down", () => {
    const sam = defender.buildUnit(UnitType.SAMLauncher, game.ref(50, 50), {});
    game.addExecution(new SAMLauncherExecution(defender, null, sam));
    buildEmpInFlight(50, 50);
    executeTicks(game, 3);
    expect(game.units(UnitType.EMPBomb)).toHaveLength(0);
  });

  test("a disabled SAM doesn't intercept", () => {
    const sam: Unit = defender.buildUnit(
      UnitType.SAMLauncher,
      game.ref(50, 50),
      {},
    );
    game.addExecution(new SAMLauncherExecution(defender, null, sam));
    sam.disable(game.ticks() + 1000, game.ticks() + 1000);
    buildEmpInFlight(50, 50);
    executeTicks(game, 3);
    expect(game.units(UnitType.EMPBomb)).toHaveLength(1);
  });
});

describe("EMP bomb price", () => {
  test("costs a fixed 1.5M gold, however many were bought", async () => {
    const priced = await setup("plains", { instantBuild: true }, [
      new PlayerInfo("buyer", PlayerType.Human, "c1", "buyer"),
    ]);
    const buyer = priced.player("buyer");
    const cost = priced.config().unitInfo(UnitType.EMPBomb).cost;
    expect(cost(priced, buyer)).toBe(1_500_000n);
    expect(cost(priced, buyer, 3)).toBe(1_500_000n);
  });
});
