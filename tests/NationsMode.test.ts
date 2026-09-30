import { AttackLogicInput, Config } from "../src/core/configuration/Config";
import { AllianceRequestExecution } from "../src/core/execution/alliance/AllianceRequestExecution";
import { AttackExecution } from "../src/core/execution/AttackExecution";
import { NationsModeExecution } from "../src/core/execution/NationsModeExecution";
import { PeaceRequestExecution } from "../src/core/execution/peace/PeaceRequestExecution";
import { SetCapitalExecution } from "../src/core/execution/SetCapitalExecution";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import {
  Game,
  GameMode,
  GameType,
  Player,
  PlayerInfo,
  PlayerType,
  TerrainType,
  Unit,
  UnitType,
} from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import {
  CAPITAL_FALLEN_DEBUFF_TICKS,
  CAPITAL_REBUILD_DELAY_TICKS,
  CAPITAL_SHIELD_RADIUS,
  CAPITAL_SHIELD_SECONDS,
  capitalShieldSecondsLeft,
  decodeCountryIds,
  isCapitalFallen,
  isCapitalShielded,
  NATIONS_MIN_TROOP_CAP_TILES,
  NationsCountry,
  NationsMapData,
  seatNationsGame,
  startCompensation,
  VASSAL_DURATION_TICKS,
} from "../src/core/game/NationsMode";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { setup } from "./util/Setup";

// The 100x100 plains test map cut into four vertical bands:
//   Big   x 0..49   5000 tiles, capital (25, 50)
//   Small x 50..59  1000 tiles, capital (55, 50)
//   Mid   x 60..89  3000 tiles, capital (75, 50)
//   (unplayable)    x 90..99
const COUNTRIES: NationsCountry[] = [
  {
    name: "Big",
    flag: "big",
    capital: "Bigtown",
    coordinates: [25, 50],
    playable: true,
    tiles: 5000,
  },
  {
    name: "Small",
    flag: "small",
    capital: "Smallton",
    coordinates: [55, 50],
    playable: true,
    tiles: 1000,
  },
  {
    name: "Mid",
    flag: "mid",
    capital: "Midcity",
    coordinates: [75, 50],
    playable: true,
    tiles: 3000,
  },
  { name: "Frozen", flag: "frozen", playable: false, tiles: 1000 },
];

function countryAt(x: number): number {
  if (x < 50) return 0;
  if (x < 60) return 1;
  if (x < 90) return 2;
  return 3;
}

function mapData(game: Game): NationsMapData {
  const ids = new Uint8Array(game.width() * game.height());
  game.forEachTile((tile) => {
    ids[tile] = countryAt(game.x(tile)) + 1;
  });
  return { ids, countries: COUNTRIES };
}

const human = new PlayerInfo("Small", PlayerType.Human, "client1", "small");
const big = new PlayerInfo("Big", PlayerType.Nation, null, "big");
const mid = new PlayerInfo("Mid", PlayerType.Nation, null, "mid");

let game: Game;
let small: Player;

function capitalOf(player: Player): Unit | undefined {
  return player.units(UnitType.City).find((c) => c.isCapital());
}

function tick(): ReturnType<Game["executeNextTick"]> {
  return game.executeNextTick();
}

describe("Nations mode", () => {
  beforeEach(async () => {
    game = await setup(
      "plains",
      {
        gameMode: GameMode.FFA,
        gameType: GameType.Public,
        gameVariant: "nations",
        instantBuild: true,
      },
      [human],
    );
    game.addExecution(
      new NationsModeExecution(mapData(game), [
        { info: human, country: 1 },
        { info: big, country: 0 },
        { info: mid, country: 2 },
      ]),
    );
    tick();
    small = game.player("small");
  });

  test("every player starts with their whole country", () => {
    expect(small.numTilesOwned()).toBe(1000);
    expect(game.player("big").numTilesOwned()).toBe(5000);
    expect(game.player("mid").numTilesOwned()).toBe(3000);
    expect(game.owner(game.ref(95, 50)).isPlayer()).toBe(false);
    expect(small.hasSpawned()).toBe(true);
  });

  test("the capital stands on the real capital, for free", () => {
    const capital = capitalOf(small)!;
    expect(capital).toBeDefined();
    expect(capital.tile()).toBe(game.ref(55, 50));
    expect(small.units(UnitType.City)).toHaveLength(1);
    // Big paid nothing for its capital: all it has is the start and the
    // compensation of a 5000-tile country.
    expect(game.player("big").gold()).toBe(
      game.config().startingGold(game.player("big").info()) +
        startCompensation(5000).gold,
    );
  });

  test("small countries start with extra gold and troops", () => {
    // 1000 of the 20000 reference tiles: 95% of the maximum.
    const bonus = startCompensation(1000);
    expect(bonus.gold).toBe(380_000n);
    expect(bonus.troops).toBe(71_250);
    expect(small.gold() - game.player("big").gold()).toBe(
      380_000n - startCompensation(5000).gold,
    );
    expect(startCompensation(NATIONS_MIN_TROOP_CAP_TILES)).toEqual({
      gold: 0n,
      troops: 0,
    });
  });

  test("small countries hold as many troops as a 20000-tile country", () => {
    const config = game.config();
    const cap = config.maxTroops(small);
    const cities =
      cap - 2 * (Math.pow(NATIONS_MIN_TROOP_CAP_TILES, 0.6) * 1000 + 50000);
    expect(cities).toBeCloseTo(config.cityTroopIncrease());
    // Losing land doesn't shrink it further.
    const big = game.player("big");
    for (let y = 0; y < 50; y++) big.conquer(game.ref(59, y));
    expect(small.numTilesOwned()).toBe(950);
    expect(config.maxTroops(small)).toBe(cap);
  });

  test("holding the capital gives +10% gold and troop growth", () => {
    const config = game.config();
    const goldWith = config.goldAdditionRate(small);
    const troopsWith = config.troopIncreaseRate(small);
    capitalOf(small)!.setCapital(false);
    const goldWithout = config.goldAdditionRate(small);
    const troopsWithout = config.troopIncreaseRate(small);
    expect(goldWith).toBe(BigInt(Math.floor(Number(goldWithout) * 1.1)));
    expect(troopsWith / troopsWithout).toBeCloseTo(1.1, 5);
  });

  test("a fallen capital is announced and weakens the defender", () => {
    const capital = capitalOf(small)!;
    game.player("big").captureUnit(capital);
    const updates = tick();

    expect(capital.isCapital()).toBe(false);
    expect(small.capitalLostTick()).toBe(game.ticks() - 1);
    const messages =
      updates[GameUpdateType.DisplayEvent]?.map((e) => e.message) ?? [];
    expect(messages).toContain("events_display.capital_fallen");
    expect(isCapitalFallen(game, small)).toBe(true);

    const input = (capitalFallen: boolean): AttackLogicInput => ({
      terrain: TerrainType.Plains,
      attackTroops: 10_000,
      attacker: { type: PlayerType.Human, numTiles: 1000 },
      defender: {
        type: PlayerType.Human,
        numTiles: 1000,
        troops: 10_000,
        isTraitor: false,
        isDisconnectedTeammate: false,
        capitalFallen,
      },
      defenderHasDefensePost: false,
      falloutRatio: null,
      borderSize: 10,
    });
    // TestConfig stubs attackLogic out: use the real one.
    const attackLogic = (i: AttackLogicInput) =>
      Config.prototype.attackLogic.call(game.config(), i);
    const weak = attackLogic(input(true));
    const normal = attackLogic(input(false));
    expect(weak.attackerTroopLoss / normal.attackerTroopLoss).toBeCloseTo(0.9);

    for (let i = 0; i < CAPITAL_FALLEN_DEBUFF_TICKS; i++) tick();
    expect(isCapitalFallen(game, small)).toBe(false);
  });

  test("a new capital can be proclaimed only after the delay", () => {
    capitalOf(small)!.delete();
    tick();
    const city = small.buildUnit(UnitType.City, game.ref(52, 20), {});
    expect(city.isUnderConstruction()).toBe(false);

    game.addExecution(new SetCapitalExecution(small, city.id()));
    tick();
    expect(city.isCapital()).toBe(false);

    while (
      game.ticks() <
      small.capitalLostTick() + CAPITAL_REBUILD_DELAY_TICKS
    ) {
      tick();
    }
    game.addExecution(new SetCapitalExecution(small, city.id()));
    tick();
    expect(city.isCapital()).toBe(true);
    tick();
    expect(small.capitalLostTick()).toBe(-1);
  });

  test("a city of someone else can't become your capital", () => {
    capitalOf(small)!.delete();
    tick();
    while (
      game.ticks() <
      small.capitalLostTick() + CAPITAL_REBUILD_DELAY_TICKS
    ) {
      tick();
    }
    const foreign = capitalOf(game.player("mid"))!;
    game.addExecution(new SetCapitalExecution(small, foreign.id()));
    tick();
    expect(capitalOf(small)).toBeUndefined();
  });

  test("nations move their capital by themselves after the delay", () => {
    const nation = game.player("mid");
    const other = nation.buildUnit(UnitType.City, game.ref(80, 10), {});
    capitalOf(nation)!.delete();
    tick();
    expect(other.isCapital()).toBe(false);

    while (
      game.ticks() <
      nation.capitalLostTick() + CAPITAL_REBUILD_DELAY_TICKS
    ) {
      tick();
      expect(other.isCapital()).toBe(false);
    }
    tick();
    expect(other.isCapital()).toBe(true);
  });

  test("players can't pick their own spawn", () => {
    const before = small.numTilesOwned();
    game.addExecution(
      new SpawnExecution("game", human, game.ref(95, 10), true),
    );
    tick();
    tick();
    expect(small.numTilesOwned()).toBe(before);
    expect(game.owner(game.ref(95, 10)).isPlayer()).toBe(false);
  });

  test("players earn troops and gold every tick", () => {
    tick();
    const troops = small.troops();
    const gold = small.gold();
    for (let i = 0; i < 50; i++) tick();
    expect(small.troops()).toBeGreaterThan(troops);
    expect(small.gold()).toBeGreaterThan(gold);
  });

  test("the capital can't be upgraded", () => {
    small.addGold(100_000_000n);
    const city = small.buildUnit(UnitType.City, game.ref(52, 20), {});
    expect(small.canUpgradeUnit(city)).toBe(true);
    expect(small.canUpgradeUnit(capitalOf(small)!)).toBe(false);
  });

  test("alliances between neighbours last 50% longer", () => {
    const big = game.player("big");
    const mid = game.player("mid");
    const ally = (a: Player, b: Player) => {
      game.addExecution(new AllianceRequestExecution(a, b.id()));
      tick();
      game.addExecution(new AllianceRequestExecution(b, a.id()));
      tick();
      const alliance = a.allianceWith(b)!;
      return alliance.expiresAt() - alliance.createdAt();
    };
    const base = game.config().allianceDuration();
    // Small (x 50..59) sits between Big and Mid, which never touch.
    expect(ally(small, big)).toBe(base * 1.5);
    expect(ally(big, mid)).toBe(base);
  });

  describe("surrendering as a vassal", () => {
    let big: Player;

    // Big takes Small's land column by column, then they are at war.
    function loseLand(columns: number) {
      for (let x = 50; x < 50 + columns; x++) {
        for (let y = 0; y < 100; y++) big.conquer(game.ref(x, y));
      }
      game.recordHostility(big, small);
    }

    function surrender() {
      game.addExecution(new PeaceRequestExecution(small, big.id(), true));
      tick();
    }

    beforeEach(() => {
      big = game.player("big");
    });

    test("only once three quarters of the home country is lost", () => {
      expect(small.homeTiles()).toBe(1000);
      loseLand(7);
      expect(small.canSurrenderTo(big)).toBe(false);
      loseLand(8);
      expect(small.numTilesOwned()).toBe(200);
      expect(small.canSurrenderTo(big)).toBe(true);
      // Not in a war with them: nothing to surrender.
      expect(small.canSurrenderTo(game.player("mid"))).toBe(false);
    });

    test("the overlord accepts: no fighting, 25% tribute, 10 minutes", () => {
      loseLand(8);
      surrender();
      const request = big.incomingPeaceRequests()[0];
      expect(request.vassal()).toBe(true);
      // Answering with peace signs the surrender.
      game.addExecution(new PeaceRequestExecution(big, small.id()));
      const updates = tick();
      const messages =
        updates[GameUpdateType.DisplayEvent]?.map((e) => e.message) ?? [];
      expect(messages).toContain("events_display.vassal_signed");

      expect(small.overlord()).toBe(big);
      expect(big.overlord()).toBeNull();
      expect(small.isAtPeaceWith(big)).toBe(true);
      expect(big.canAttackPlayer(small)).toBe(false);
      const treaty = small.peaceTreatyWith(big)!;
      expect(treaty.expiresAt() - treaty.createdAt()).toBe(
        VASSAL_DURATION_TICKS,
      );

      const income = game.config().goldAdditionRate(small);
      const tribute = (income * 25n) / 100n;
      const smallGold = small.gold();
      const bigGold = big.gold();
      const bigIncome = game.config().goldAdditionRate(big);
      tick();
      expect(small.gold() - smallGold).toBe(income - tribute);
      expect(big.gold() - bigGold).toBe(bigIncome + tribute);
    });

    test("a refused surrender changes nothing", () => {
      loseLand(8);
      surrender();
      big.incomingPeaceRequests()[0].reject();
      tick();
      expect(small.overlord()).toBeNull();
      expect(small.isAtPeaceWith(big)).toBe(false);
    });
  });

  describe("the shielded capital zone", () => {
    // Small's land (x 50-59) within the radius of its capital on (55, 50).
    const shielded = () => {
      const tiles: number[] = [];
      game.forEachTile((tile) => {
        if (
          game.owner(tile) === small &&
          game.euclideanDistSquared(tile, game.ref(55, 50)) <=
            CAPITAL_SHIELD_RADIUS * CAPITAL_SHIELD_RADIUS
        ) {
          tiles.push(tile);
        }
      });
      return tiles;
    };

    test("covers the tiles around the original capital, for others", () => {
      const big = game.player("big");
      expect(capitalShieldSecondsLeft(game)).toBeGreaterThan(
        CAPITAL_SHIELD_SECONDS - 1,
      );
      expect(isCapitalShielded(game, game.ref(55, 50), big)).toBe(true);
      expect(isCapitalShielded(game, game.ref(55 - 5, 50), big)).toBe(true);
      expect(isCapitalShielded(game, game.ref(55 + 3, 50 + 4), big)).toBe(true);
      expect(isCapitalShielded(game, game.ref(55 - 6, 50), big)).toBe(false);
      expect(isCapitalShielded(game, game.ref(55, 20), big)).toBe(false);
      // Not against its owner, and not on land nobody owns.
      expect(isCapitalShielded(game, game.ref(55, 50), small)).toBe(false);
      expect(isCapitalShielded(game, game.ref(95, 50), big)).toBe(false);
    });

    test("an attack takes the land around it but not the zone", () => {
      while (game.inSpawnPhase()) tick();
      const big = game.player("big");
      big.addTroops(5_000_000);
      game.addExecution(new AttackExecution(4_000_000, big, small.id()));
      const zone = shielded();
      expect(zone.length).toBeGreaterThan(60);
      for (let i = 0; i < 1200; i++) tick();

      expect(capitalShieldSecondsLeft(game)).toBeGreaterThan(0);
      expect(small.isAlive()).toBe(true);
      expect(small.numTilesOwned()).toBe(zone.length);
      expect(zone.every((tile) => game.owner(tile) === small)).toBe(true);
    });

    test("ends after the first minutes", () => {
      while (capitalShieldSecondsLeft(game) > 0) tick();
      const big = game.player("big");
      expect(isCapitalShielded(game, game.ref(55, 50), big)).toBe(false);

      big.addTroops(5_000_000);
      game.addExecution(new AttackExecution(4_000_000, big, small.id()));
      for (let i = 0; i < 1200 && small.isAlive(); i++) tick();
      expect(small.isAlive()).toBe(false);
    });
  });

  test("half of the land wins", () => {
    expect(game.config().percentageTilesOwnedToWin(0)).toBe(50);
  });
});

describe("decodeCountryIds", () => {
  test("expands (id, LEB128 run) pairs", () => {
    // 3 x id 1, 200 x id 0 (run 200 = 0xc8 0x01), 1 x id 7
    const bin = new Uint8Array([1, 3, 0, 0xc8, 0x01, 7, 1]);
    const ids = decodeCountryIds(bin, 204);
    expect([...ids.slice(0, 4)]).toEqual([1, 1, 1, 0]);
    expect(ids[202]).toBe(0);
    expect(ids[203]).toBe(7);
  });

  test("rejects data that doesn't cover the map", () => {
    expect(() => decodeCountryIds(new Uint8Array([1, 3]), 4)).toThrow();
    expect(() => decodeCountryIds(new Uint8Array([1, 5]), 4)).toThrow();
  });
});

describe("seatNationsGame", () => {
  const player = (clientID: string, nation?: number) => ({
    clientID,
    username: clientID,
    clanTag: null,
    nation,
  });

  test("honours picks and gives the rest of the world to nations", () => {
    const { humans, nations, seats } = seatNationsGame(
      [player("a", 2)],
      COUNTRIES,
      new PseudoRandom(1),
    );
    expect(humans[0].nationFlag).toBe("mid");
    expect(humans[0].displayName).toBe("Mid | a");
    expect(nations.map((n) => n.playerInfo.name)).toEqual(["Big", "Small"]);
    expect(seats.map((s) => s.country).sort()).toEqual([0, 1, 2]);
    expect(nations[0].spawnCell?.x).toBe(25);
  });

  test("duplicate or unplayable picks get a free country", () => {
    const { humans, nations, seats } = seatNationsGame(
      [player("a", 1), player("b", 1), player("c", 3)],
      COUNTRIES,
      new PseudoRandom(1),
    );
    expect(humans[0].nationFlag).toBe("small");
    const countries = seats.map((s) => s.country);
    expect(new Set(countries).size).toBe(3);
    expect(countries).not.toContain(3);
    expect(nations).toHaveLength(0);
  });

  test("players beyond the number of countries stay unseated", () => {
    const { humans, seats } = seatNationsGame(
      [player("a"), player("b"), player("c"), player("d")],
      COUNTRIES,
      new PseudoRandom(1),
    );
    expect(humans).toHaveLength(4);
    expect(seats).toHaveLength(3);
  });
});
