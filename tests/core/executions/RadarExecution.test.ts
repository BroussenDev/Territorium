import { AllianceRequestExecution } from "../../../src/core/execution/alliance/AllianceRequestExecution";
import { RadarExecution } from "../../../src/core/execution/RadarExecution";
import {
  Game,
  MessageType,
  Player,
  PlayerInfo,
  PlayerType,
  Unit,
  UnitType,
} from "../../../src/core/game/Game";
import { GameUpdateType } from "../../../src/core/game/GameUpdates";
import { setup } from "../../util/Setup";

let game: Game;
let owner: Player;
let enemy: Player;
let ally: Player;
let radar: Unit;

// Runs a few radar sweeps and returns the radar alerts sent to the owner.
function radarAlerts(ticks = 10) {
  const alerts: { unit: unknown; count: unknown; unitID?: number }[] = [];
  for (let i = 0; i < ticks; i++) {
    const updates = game.executeNextTick();
    for (const e of updates[GameUpdateType.DisplayEvent] ?? []) {
      if (
        e.messageType === MessageType.RADAR_CONTACT &&
        e.playerID === owner.smallID()
      ) {
        alerts.push({
          unit: e.params?.unit,
          count: e.params?.count,
          unitID: e.unitID,
        });
      }
    }
  }
  return alerts;
}

function warshipAt(player: Player, x: number, y: number): Unit {
  return player.buildUnit(UnitType.Warship, game.ref(x, y), {
    patrolTile: game.ref(x, y),
  });
}

describe("Radar", () => {
  beforeEach(async () => {
    game = await setup(
      "big_plains",
      { infiniteGold: true, instantBuild: true, infiniteTroops: true },
      [
        new PlayerInfo("owner", PlayerType.Human, "c1", "owner"),
        new PlayerInfo("enemy", PlayerType.Human, "c2", "enemy"),
        new PlayerInfo("ally", PlayerType.Human, "c3", "ally"),
      ],
    );
    owner = game.player("owner");
    enemy = game.player("enemy");
    ally = game.player("ally");
    owner.conquer(game.ref(10, 10));
    enemy.conquer(game.ref(190, 190));
    ally.conquer(game.ref(190, 10));

    radar = owner.buildUnit(UnitType.Radar, game.ref(10, 10), {});
    game.addExecution(new RadarExecution(radar));
  });

  test("costs 250k, rising by 250k per radar up to 1M", async () => {
    const priced = await setup("plains", { instantBuild: true }, [
      new PlayerInfo("buyer", PlayerType.Human, "c1", "buyer"),
    ]);
    const buyer = priced.player("buyer");
    const cost = priced.config().unitInfo(UnitType.Radar).cost;
    expect(cost(priced, buyer)).toBe(250_000n);
    expect(cost(priced, buyer, 1)).toBe(500_000n);
    expect(cost(priced, buyer, 10)).toBe(1_000_000n);
    expect(priced.config().radarRange()).toBe(100);
  });

  test("reports an enemy ship in range once", () => {
    const ship = warshipAt(enemy, 60, 60);
    const alerts = radarAlerts();
    expect(alerts).toEqual([
      { unit: "unit_type.warship", count: 1, unitID: ship.id() },
    ]);
    expect(radarAlerts()).toEqual([]);
  });

  test("groups a fleet into one alert", () => {
    warshipAt(enemy, 60, 60);
    warshipAt(enemy, 61, 60);
    warshipAt(enemy, 62, 60);
    const alerts = radarAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].count).toBe(3);
  });

  test("ignores ships out of range, its owner's and allies'", () => {
    game.addExecution(new AllianceRequestExecution(owner, ally.id()));
    game.executeNextTick();
    game.addExecution(new AllianceRequestExecution(ally, owner.id()));
    game.executeNextTick();
    expect(owner.isAlliedWith(ally)).toBe(true);

    warshipAt(enemy, 150, 150);
    warshipAt(owner, 20, 20);
    warshipAt(ally, 30, 30);
    expect(radarAlerts()).toEqual([]);
  });

  test("a radar disabled by an EMP sees nothing until it recovers", () => {
    radar.disable(game.ticks() + 20, game.ticks() + 20);
    warshipAt(enemy, 60, 60);
    expect(radarAlerts(15)).toEqual([]);
    expect(radarAlerts(15)).toHaveLength(1);
  });

  test("two overlapping radars report a ship once", () => {
    owner.conquer(game.ref(12, 12));
    const second = owner.buildUnit(UnitType.Radar, game.ref(12, 12), {});
    game.addExecution(new RadarExecution(second));
    warshipAt(enemy, 60, 60);
    expect(radarAlerts()).toHaveLength(1);
  });
});
