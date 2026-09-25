import { ObjectiveExecution } from "../src/core/execution/ObjectiveExecution";
import { Game, GameMode, Player, PlayerType } from "../src/core/game/Game";
import { TileRef } from "../src/core/game/GameMap";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import {
  forEachTileInZone,
  OBJECTIVE_CAPTURE_SECONDS,
  OBJECTIVE_GOLD_PER_TICK,
  objectiveBonusCap,
  objectiveCount,
  objectiveRadius,
  ObjectiveState,
  placeObjectives,
} from "../src/core/game/Objectives";
import { playerInfo, setup } from "./util/Setup";

const SEED = 12345;

/** Gives `player` every land tile of the zone. */
function takeZone(game: Game, player: Player, objective: ObjectiveState) {
  forEachTileInZone(game.map(), objective.tile, objective.radius, (tile) => {
    if (game.isLand(tile)) player.conquer(tile);
  });
}

function runSeconds(game: Game, seconds: number) {
  for (let i = 0; i < seconds * 10; i++) game.executeNextTick();
}

describe("placeObjectives", () => {
  it("scales the count and radius with the land", () => {
    expect(objectiveCount(10_000)).toBe(3);
    expect(objectiveCount(651_761)).toBe(5);
    expect(objectiveCount(10_000_000)).toBe(6);
    expect(objectiveRadius(10_000)).toBe(5);
    expect(objectiveRadius(651_761)).toBe(13);
    expect(objectiveRadius(10_000_000)).toBe(16);
  });

  it("caps one player's bonus at half the zones, rounded up", () => {
    expect(objectiveBonusCap(3)).toBe(2);
    expect(objectiveBonusCap(4)).toBe(2);
    expect(objectiveBonusCap(5)).toBe(3);
    expect(objectiveBonusCap(6)).toBe(3);
  });

  it("places the same zones for the same seed, on land and apart", async () => {
    const game = await setup("world");
    const a = placeObjectives(game.map(), SEED);
    const b = placeObjectives(game.map(), SEED);
    expect(a).toEqual(b);
    expect(a).toHaveLength(objectiveCount(game.numLandTiles()));

    for (const o of a) {
      expect(game.isLand(o.tile)).toBe(true);
      // Off the outer band of the map (poles, far corners).
      expect(game.x(o.tile)).toBeGreaterThanOrEqual(game.width() / 10);
      expect(game.x(o.tile)).toBeLessThan(game.width() * 0.9);
      expect(game.y(o.tile)).toBeGreaterThanOrEqual(game.height() / 10);
      expect(game.y(o.tile)).toBeLessThan(game.height() * 0.9);
      let land = 0;
      let total = 0;
      forEachTileInZone(game.map(), o.tile, o.radius, (tile) => {
        total++;
        if (game.isLand(tile)) land++;
      });
      expect(land * 100).toBeGreaterThanOrEqual(total * 80);
    }
    for (let i = 0; i < a.length; i++) {
      for (let j = i + 1; j < a.length; j++) {
        const d2 = game.euclideanDistSquared(a[i].tile, a[j].tile);
        expect(d2).toBeGreaterThan(4 * a[i].radius * a[i].radius);
      }
    }

    const other = placeObjectives(game.map(), SEED + 1);
    expect(other.map((o) => o.tile)).not.toEqual(a.map((o) => o.tile));
  });

  it("only places zones on land on a small, watery map", async () => {
    const game = await setup("half_land_half_ocean");
    for (const o of placeObjectives(game.map(), SEED)) {
      expect(game.isLand(o.tile)).toBe(true);
    }
  });
});

describe("ObjectiveExecution", () => {
  async function build(gameMode = GameMode.FFA) {
    const names = ["a", "b", "c", "d"];
    const game = await setup(
      "big_plains",
      {
        objectives: true,
        gameMode,
        ...(gameMode === GameMode.Team ? { playerTeams: 2 } : {}),
      },
      names.map((n) => playerInfo(n, PlayerType.Human)),
    );
    game.addExecution(new ObjectiveExecution(SEED));
    game.executeNextTick();
    const players = names.map((n) => game.player(n));
    // A home tile in a corner, away from every zone, keeps each player alive
    // when others take the zones from them.
    players.forEach((p, i) => p.conquer(game.ref(i, 0)));
    return { game, players, zone: game.objectives()[0] };
  }

  it("places the zones and publishes them to the client", async () => {
    const game = await setup("big_plains", { objectives: true });
    game.addExecution(new ObjectiveExecution(SEED));
    const updates = game.executeNextTick();
    const sent = updates[GameUpdateType.Objectives];
    expect(sent).toHaveLength(1);
    expect(sent[0].objectives).toEqual(game.objectives());
    expect(game.objectives()).toHaveLength(3);
    expect(game.objectives().every((o) => o.holder === 0)).toBe(true);
  });

  it("captures a zone held for the full capture time", async () => {
    const { game, players, zone } = await build();
    const [a] = players;
    takeZone(game, a, zone);

    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS - 1);
    expect(zone.holder).toBe(0);
    expect(zone.capturer).toBe(a.smallID());
    expect(zone.progress).toBeGreaterThan(0);

    runSeconds(game, 2);
    expect(zone.holder).toBe(a.smallID());
    expect(zone.progress).toBe(0);
    expect(a.objectivesHeld()).toBe(1);
  });

  it("does not capture a zone split with no majority", async () => {
    const { game, players, zone } = await build();
    const [a, b] = players;
    // Half the zone's land each (one tile left free when the count is odd):
    // neither side has more than half.
    const land: TileRef[] = [];
    forEachTileInZone(game.map(), zone.tile, zone.radius, (tile) => {
      if (game.isLand(tile)) land.push(tile);
    });
    if (land.length % 2 === 1) land.pop();
    land.forEach((tile, i) => (i % 2 === 0 ? a : b).conquer(tile));
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS * 2);
    expect(zone.holder).toBe(0);
    expect(zone.progress).toBe(0);
  });

  it("lets the holder defend by retaking the zone before the capture ends", async () => {
    const { game, players, zone } = await build();
    const [a, b] = players;
    takeZone(game, a, zone);
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS + 1);
    expect(zone.holder).toBe(a.smallID());

    takeZone(game, b, zone);
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS - 5);
    expect(zone.capturer).toBe(b.smallID());
    expect(zone.holder).toBe(a.smallID());

    takeZone(game, a, zone);
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS);
    expect(zone.holder).toBe(a.smallID());
    expect(zone.capturer).toBe(0);
    expect(zone.progress).toBe(0);
  });

  it("restarts the capture when a different player takes over", async () => {
    const { game, players, zone } = await build();
    const [a, b] = players;
    takeZone(game, a, zone);
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS - 3);
    takeZone(game, b, zone);
    runSeconds(game, 5);
    expect(zone.holder).toBe(0);
    expect(zone.capturer).toBe(b.smallID());
    expect(zone.progress).toBeLessThan(OBJECTIVE_CAPTURE_SECONDS);
  });

  it("frees the zone when its holder dies", async () => {
    const { game, players, zone } = await build();
    const [a] = players;
    takeZone(game, a, zone);
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS + 1);
    expect(zone.holder).toBe(a.smallID());

    for (const tile of Array.from(a.tiles())) a.relinquish(tile);
    runSeconds(game, 2);
    expect(a.isAlive()).toBe(false);
    expect(zone.holder).toBe(0);
  });

  it("gives the holder a modest gold and troop growth bonus", async () => {
    const { game, players, zone } = await build();
    const [a, b] = players;
    // Same land and troops for both, only a holds the zone.
    takeZone(game, a, zone);
    const other = game.objectives()[1];
    takeZone(game, b, other);
    a.setTroops(10_000);
    b.setTroops(10_000);
    const config = game.config();

    expect(config.goldAdditionRate(a)).toBe(config.goldAdditionRate(b));
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS + 1);
    // Both now hold their own zone; free b's to compare.
    other.holder = 0;
    a.setTroops(10_000);
    b.setTroops(10_000);

    expect(config.goldAdditionRate(a) - config.goldAdditionRate(b)).toBe(
      OBJECTIVE_GOLD_PER_TICK,
    );
    const ratio = config.troopIncreaseRate(a) / config.troopIncreaseRate(b);
    expect(ratio).toBeGreaterThan(1.04);
    expect(ratio).toBeLessThan(1.06);
  });

  it("pays no bonus for zones held beyond the cap", async () => {
    const { game, players } = await build();
    const [a] = players;
    const config = game.config();
    const baseGold = config.goldAdditionRate(a);

    for (const zone of game.objectives()) takeZone(game, a, zone);
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS + 1);
    a.setTroops(10_000);

    // a takes all three zones but is paid for two of them.
    expect(a.objectivesHeld()).toBe(3);
    expect(a.objectivesRewarded()).toBe(2);
    expect(config.goldAdditionRate(a) - baseGold).toBe(
      OBJECTIVE_GOLD_PER_TICK * 2n,
    );

    // Same land and troops: dropping the third zone costs nothing, dropping
    // a second one does.
    const troops = config.troopIncreaseRate(a);
    game.objectives()[2].holder = 0;
    expect(config.troopIncreaseRate(a)).toBe(troops);
    game.objectives()[1].holder = 0;
    expect(config.troopIncreaseRate(a)).toBeLessThan(troops);
  });

  it("does not let a teammate take the zone from its holder", async () => {
    const { game, players, zone } = await build(GameMode.Team);
    const a = players[0];
    const mate = players.find((p) => p !== a && p.isOnSameTeam(a))!;
    const enemy = players.find((p) => p !== a && !p.isOnSameTeam(a))!;
    expect(mate).toBeDefined();
    expect(enemy).toBeDefined();

    takeZone(game, a, zone);
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS + 1);
    expect(zone.holder).toBe(a.smallID());

    takeZone(game, mate, zone);
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS * 2);
    expect(zone.holder).toBe(a.smallID());

    takeZone(game, enemy, zone);
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS + 1);
    expect(zone.holder).toBe(enemy.smallID());
  });
});
