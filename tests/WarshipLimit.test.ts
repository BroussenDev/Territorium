import {
  Game,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

const coastX = 7;
let game: Game;
let player: Player;

describe("Warship limit", () => {
  beforeEach(async () => {
    game = await setup(
      "half_land_half_ocean",
      { infiniteGold: true, instantBuild: true },
      [new PlayerInfo("admiral", PlayerType.Human, null, "player_id")],
    );
    player = game.player("player_id");
    for (let y = 8; y <= 12; y++) player.conquer(game.ref(coastX, y));
    player.buildUnit(UnitType.Port, game.ref(coastX, 10), {});
  });

  function addWarships(count: number) {
    for (let i = 0; i < count; i++) {
      const tile = game.ref(coastX + 1, 10);
      player.buildUnit(UnitType.Warship, tile, { patrolTile: tile });
    }
  }

  test("caps warships at 50 per player", () => {
    expect(game.config().maxUnitCount(UnitType.Warship)).toBe(50);
    expect(game.config().maxUnitCount(UnitType.City)).toBe(Infinity);
  });

  test("a player below the limit can still build a warship", () => {
    addWarships(49);
    expect(
      player.canBuild(UnitType.Warship, game.ref(coastX + 1, 10)),
    ).not.toBe(false);
  });

  test("a player at the limit can't build another warship", () => {
    addWarships(50);
    expect(player.canBuild(UnitType.Warship, game.ref(coastX + 1, 10))).toBe(
      false,
    );
    const buildable = player
      .buildableUnits(game.ref(coastX + 1, 10))
      .find((u) => u.type === UnitType.Warship);
    expect(buildable?.canBuild).toBe(false);
  });

  test("losing a warship frees a slot again", () => {
    addWarships(50);
    player.units(UnitType.Warship)[0].delete();
    expect(
      player.canBuild(UnitType.Warship, game.ref(coastX + 1, 10)),
    ).not.toBe(false);
  });
});
