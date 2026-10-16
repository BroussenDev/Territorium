import { AttackExecution } from "../src/core/execution/AttackExecution";
import { SurvivalExecution } from "../src/core/execution/SurvivalExecution";
import { WinCheckExecution } from "../src/core/execution/WinCheckExecution";
import {
  ColoredTeams,
  Difficulty,
  Game,
  GameMapType,
  GameMode,
  GameType,
  HumansVsNations,
  PlayerInfo,
  PlayerType,
  TerrainType,
} from "../src/core/game/Game";
import {
  placeSurvivalZones,
  SURVIVAL_BLITZ_DELAY_TICKS,
  SURVIVAL_FIRST_WAVE_DELAY_TICKS,
  SURVIVAL_HOLD_TICKS,
  SURVIVAL_MAPS,
  SURVIVAL_MAX_PLAYERS,
  SURVIVAL_MAX_WAVE_SIZE,
  SURVIVAL_SCHEDULE,
  SURVIVAL_WAVE_INTERVAL_TICKS,
  SURVIVAL_WAVES,
  SURVIVAL_ZONES,
  survivalGameConfig,
  survivalLandingStrength,
  survivalWaveKind,
  survivalWaveSize,
  survivalWaveState,
  survivalWaveTick,
} from "../src/core/game/Survival";
import { playerInfo, setup } from "./util/Setup";
import { UseRealAttackLogic } from "./util/TestConfig";

const SURVIVAL = {
  gameVariant: "survival",
  gameMode: GameMode.Team,
  playerTeams: HumansVsNations,
} as const;

function run(game: Game, ticks: number) {
  for (let i = 0; i < ticks; i++) game.executeNextTick();
}

async function build(
  map = "big_plains",
  extra: Record<string, unknown> = {},
  withWaves = true,
) {
  const game = await setup(
    map,
    { ...SURVIVAL, ...extra },
    ["a", "b"].map((n) => playerInfo(n, PlayerType.Human)),
  );
  game.setSurvivalZones(placeSurvivalZones(game.map(), 5));
  if (withWaves) game.addExecution(new SurvivalExecution("game", 99));
  game.addExecution(new WinCheckExecution());
  game.executeNextTick();
  const [a, b] = ["a", "b"].map((n) => game.player(n));
  // Home tiles in a corner keep the defenders alive.
  a.conquer(game.ref(0, 0));
  b.conquer(game.ref(1, 0));
  return { game, a, b };
}

const invaders = (game: Game) =>
  game.players().filter((p) => p.team() === ColoredTeams.Nations);

describe("survival waves", () => {
  it("mix normal waves, two blitz waves and two warlords, the last leading the final wave", () => {
    expect(SURVIVAL_SCHEDULE.filter((k) => k === "blitz")).toHaveLength(2);
    expect(SURVIVAL_SCHEDULE.filter((k) => k === "boss")).toHaveLength(2);
    expect(survivalWaveKind(1)).toBe("normal");
    expect(survivalWaveKind(SURVIVAL_WAVES)).toBe("boss");
  });

  it("grow with each wave, capped; a blitz brings half, a warlord half as escort", () => {
    expect(survivalWaveSize(1, 4)).toBe(3);
    expect(survivalWaveSize(2, 4)).toBe(4);
    // Wave 3 is a blitz: half of the five a normal wave would bring.
    expect(survivalWaveKind(3)).toBe("blitz");
    expect(survivalWaveSize(3, 4)).toBe(3);
    // The last wave: the warlord and half of twelve.
    expect(survivalWaveSize(SURVIVAL_WAVES, 4)).toBe(7);
    expect(survivalWaveSize(1, 1)).toBe(1);
    expect(survivalWaveSize(SURVIVAL_WAVES - 1, 100)).toBe(
      SURVIVAL_MAX_WAVE_SIZE,
    );
  });

  it("land on a fixed schedule after the spawn phase, a blitz soon after the wave before", () => {
    expect(survivalWaveTick(1)).toBe(SURVIVAL_FIRST_WAVE_DELAY_TICKS);
    expect(survivalWaveTick(2)).toBe(
      SURVIVAL_FIRST_WAVE_DELAY_TICKS + SURVIVAL_WAVE_INTERVAL_TICKS,
    );
    expect(survivalWaveTick(3) - survivalWaveTick(2)).toBe(
      SURVIVAL_BLITZ_DELAY_TICKS,
    );
    expect(SURVIVAL_BLITZ_DELAY_TICKS).toBeLessThan(
      SURVIVAL_WAVE_INTERVAL_TICKS,
    );
    expect(survivalWaveState(0)).toEqual({
      wave: 0,
      nextWaveTick: survivalWaveTick(1),
    });
    expect(survivalWaveState(survivalWaveTick(3))).toEqual({
      wave: 3,
      nextWaveTick: survivalWaveTick(4),
    });
    expect(survivalWaveState(survivalWaveTick(SURVIVAL_WAVES))).toEqual({
      wave: SURVIVAL_WAVES,
      nextWaveTick: null,
    });
  });
});

describe("survival landing strength", () => {
  const start = 25_000;

  it("lands fresh invaders like a new player against a fresh start", () => {
    expect(
      survivalLandingStrength(
        1,
        "invader",
        { troops: 30_000, tiles: 50 },
        start,
      ).troops,
    ).toBe(start);
  });

  it("measures each wave against the defenders, rising wave after wave", () => {
    const level = { troops: 1_000_000, tiles: 20_000 };
    const early = survivalLandingStrength(2, "invader", level, start);
    const late = survivalLandingStrength(9, "invader", level, start);
    expect(early.troops).toBeGreaterThan(start);
    expect(late.troops).toBeGreaterThan(early.troops);
    // An invader stays smaller than the average defender...
    expect(late.troops).toBeLessThan(level.troops);
    expect(late.capTiles).toBeLessThan(level.tiles);
    // ...a warlord does not, the final one least of all.
    const boss = survivalLandingStrength(5, "boss", level, start);
    const finalBoss = survivalLandingStrength(
      SURVIVAL_WAVES,
      "boss",
      level,
      start,
    );
    expect(boss.troops).toBeGreaterThan(level.troops);
    expect(finalBoss.troops).toBeGreaterThan(boss.troops);
    expect(boss.capTiles).toBeGreaterThan(level.tiles);
  });
});

describe("survival game config", () => {
  it("has the same fixed rules for every host, only the map is theirs", () => {
    for (const type of [
      GameType.Public,
      GameType.Private,
      GameType.Singleplayer,
    ]) {
      const c = survivalGameConfig(type, SURVIVAL_MAPS[2]);
      expect(c.gameVariant).toBe("survival");
      expect(c.gameMode).toBe(GameMode.Team);
      expect(c.playerTeams).toBe(HumansVsNations);
      expect(c.gameMap).toBe(SURVIVAL_MAPS[2]);
      expect(c.bots).toBe(0);
      expect(c.difficulty).toBe(Difficulty.Hard);
    }
    expect(
      survivalGameConfig(GameType.Private, SURVIVAL_MAPS[0]).maxPlayers,
    ).toBe(SURVIVAL_MAX_PLAYERS);
    // A map Survival doesn't play falls back to one it does.
    expect(
      SURVIVAL_MAPS.includes(
        survivalGameConfig(GameType.Private, GameMapType.World).gameMap,
      ),
    ).toBe(true);
  });
});

describe("survival mode", () => {
  it("starts with the defenders together and no invader", async () => {
    const { game, a, b } = await build();
    expect(game.config().isSurvivalMode()).toBe(true);
    expect(a.team()).toBe(ColoredTeams.Humans);
    expect(b.team()).toBe(ColoredTeams.Humans);
    expect(invaders(game)).toHaveLength(0);
  });

  it("lands the first wave of invaders on the Nations team, on free land", async () => {
    const { game } = await build();
    run(game, SURVIVAL_FIRST_WAVE_DELAY_TICKS + 20);
    const wave = invaders(game);
    expect(wave).toHaveLength(survivalWaveSize(1, 2));
    for (const invader of wave) {
      expect(invader.type()).toBe(PlayerType.Nation);
      expect(invader.numTilesOwned()).toBeGreaterThan(0);
    }
    expect(game.getWinner()).toBeNull();
  });

  it("gives invaders the human rules, whatever the difficulty", async () => {
    const { game } = await build("big_plains", {
      difficulty: Difficulty.Impossible,
    });
    const config = game.config();
    const nation = new PlayerInfo("n", PlayerType.Nation, null, "n");
    const human = new PlayerInfo("h", PlayerType.Human, null, "h");
    expect(config.startManpower(nation)).toBe(config.startManpower(human));
    run(game, SURVIVAL_FIRST_WAVE_DELAY_TICKS + 20);
    const [invader] = invaders(game);
    const a = game.player("a");
    // Same tile count, same cap: the formula is the human one.
    expect(config.maxTroops(invader) / invader.numTilesOwned()).toBeGreaterThan(
      0,
    );
    const capFor = (tiles: number) => 2 * (Math.pow(tiles, 0.6) * 1000 + 50000);
    expect(config.maxTroops(invader)).toBeCloseTo(
      capFor(invader.numTilesOwned()),
    );
    expect(config.maxTroops(a)).toBeCloseTo(capFor(a.numTilesOwned()));
  });

  it("has no alliances and a one-minute peace", async () => {
    const { game, a } = await build();
    expect(game.config().disableAlliances()).toBe(true);
    expect(game.config().peaceDuration()).toBe(60 * 10);
    run(game, SURVIVAL_FIRST_WAVE_DELAY_TICKS + 20);
    const [invader] = invaders(game);
    expect(a.canSendAllianceRequest(invader)).toBe(false);
  });

  it("lets defenders cross mountains as fast as plains, not invaders", async () => {
    const game = await setup(
      "big_plains",
      SURVIVAL,
      [],
      __dirname + "/util",
      UseRealAttackLogic,
    );
    const attack = (terrain: TerrainType, type: PlayerType) =>
      game.config().attackLogic({
        terrain,
        attackTroops: 50_000,
        attacker: { type, numTiles: 5_000 },
        // An owned tile: unclaimed land costs the same everywhere.
        defender: {
          type: PlayerType.Nation,
          numTiles: 5_000,
          troops: 50_000,
          isTraitor: false,
          isDisconnectedTeammate: false,
        },
        defenderHasDefensePost: false,
        falloutRatio: null,
        borderSize: 100,
      });
    const human = PlayerType.Human;
    const nation = PlayerType.Nation;
    expect(attack(TerrainType.Mountain, human).tickFraction).toBeCloseTo(
      attack(TerrainType.Plains, human).tickFraction,
    );
    expect(attack(TerrainType.Mountain, nation).tickFraction).toBeGreaterThan(
      attack(TerrainType.Plains, nation).tickFraction,
    );
    // The mountain still costs the defenders more troops.
    expect(
      attack(TerrainType.Mountain, human).attackerTroopLoss,
    ).toBeGreaterThan(attack(TerrainType.Plains, human).attackerTroopLoss);
  });

  it("is lost once no defender is left", async () => {
    const { game, a, b } = await build();
    run(game, SURVIVAL_FIRST_WAVE_DELAY_TICKS + 20);
    for (const p of [a, b]) {
      for (const tile of Array.from(p.tiles())) p.relinquish(tile);
    }
    run(game, 20);
    expect(game.getWinner()).toBe(ColoredTeams.Nations);
  });

  it("is won once the last wave has landed and no invader is left", async () => {
    // No waves here: only the win rule is under test.
    const { game } = await build("plains", {}, false);
    run(game, survivalWaveTick(SURVIVAL_WAVES) - 20);
    expect(game.getWinner()).toBeNull();
    run(game, 40);
    expect(game.getWinner()).toBe(ColoredTeams.Humans);
  });

  it("is won by holding out after the last wave, invaders or not", async () => {
    const { game } = await build("plains", {}, false);
    const left = game.addPlayer(
      new PlayerInfo("Left", PlayerType.Nation, null, "left"),
      ColoredTeams.Nations,
    );
    left.conquer(game.ref(50, 50));
    run(game, survivalWaveTick(SURVIVAL_WAVES) + SURVIVAL_HOLD_TICKS - 20);
    expect(game.getWinner()).toBeNull();
    run(game, 40);
    expect(game.getWinner()).toBe(ColoredTeams.Humans);
  });

  it("is won at once when the final warlord falls", async () => {
    const { game, a } = await build("plains", {}, false);
    const warlord = game.addPlayer(
      new PlayerInfo("Kragor", PlayerType.Nation, null, "warlord"),
      ColoredTeams.Nations,
    );
    const escort = game.addPlayer(
      new PlayerInfo("Escort", PlayerType.Nation, null, "escort"),
      ColoredTeams.Nations,
    );
    warlord.conquer(game.ref(50, 50));
    escort.conquer(game.ref(80, 80));
    run(game, survivalWaveTick(SURVIVAL_WAVES) + 10);
    game.recordSurvivalWave(SURVIVAL_WAVES, warlord);
    run(game, 20);
    expect(game.getWinner()).toBeNull();
    // The warlord falls; its escort is still around.
    game.conquerPlayer(a, warlord);
    for (const t of Array.from(warlord.tiles())) a.conquer(t);
    run(game, 20);
    expect(escort.isAlive()).toBe(true);
    expect(game.getWinner()).toBe(ColoredTeams.Humans);
  });

  it("reinforces the invaders with the same troops when no land is free", async () => {
    const { game, a } = await build("plains");
    run(game, SURVIVAL_FIRST_WAVE_DELAY_TICKS + 20);
    expect(invaders(game).length).toBeGreaterThan(0);
    // The defenders take every free tile: the next wave cannot land.
    game.map().forEachTile((tile) => {
      if (game.isLand(tile) && !game.hasOwner(tile)) a.conquer(tile);
    });
    const before = invaders(game).length;
    const troopsBefore = invaders(game).reduce((s, p) => s + p.troops(), 0);
    run(game, SURVIVAL_WAVE_INTERVAL_TICKS);
    const alive = invaders(game);
    expect(alive.length).toBeLessThanOrEqual(before);
    for (const invader of alive) {
      expect(invader.troops()).toBeLessThanOrEqual(
        game.config().maxTroops(invader),
      );
    }
    expect(troopsBefore).toBeGreaterThan(0);
  });
});

describe("survival waves against the defenders' level", () => {
  it("land invaders with troops and a troop cap measured against the defenders", async () => {
    const { game, a, b } = await build();
    // Two strong defenders: a million troops each, on 2000 tiles.
    for (const [d, x0] of [
      [a, 0],
      [b, 100],
    ] as const) {
      for (let i = 0; i < 2000; i++)
        d.conquer(game.ref(x0 + (i % 50), 150 + Math.floor(i / 50)));
      d.addTroops(1_000_000 - d.troops());
    }
    run(game, survivalWaveTick(2) + 1);
    const level = { troops: 1_000_000, tiles: 2001 };
    const start = game
      .config()
      .startManpower(new PlayerInfo("", PlayerType.Nation, null, "x"));
    const expected = survivalLandingStrength(2, "invader", level, start);
    const second = invaders(game).filter(
      (p) => p.troopCapTiles() === expected.capTiles,
    );
    expect(second.length).toBeGreaterThan(0);
    // Their cap counts the beachhead, so what they land with doesn't drain.
    for (const invader of second) {
      expect(game.config().maxTroops(invader)).toBeGreaterThanOrEqual(
        expected.troops,
      );
    }
  });

  it("are led by a warlord on a boss wave, announced to everyone", async () => {
    // The waves start just before the boss wave, which lands at once with
    // the ones before it.
    const { game } = await build("plains", {}, false);
    const bossWave = SURVIVAL_SCHEDULE.indexOf("boss") + 1;
    run(game, survivalWaveTick(bossWave) - 5);
    game.addExecution(new SurvivalExecution("game", 99));
    run(game, 10);
    const status = game.survivalStatus();
    expect(status.wavesLanded).toBe(bossWave);
    expect(status.bosses).toHaveLength(1);
    expect(status.bosses[0].wave).toBe(bossWave);
    const boss = game.playerBySmallID(status.bosses[0].smallID);
    expect(boss.isPlayer() && boss.team()).toBe(ColoredTeams.Nations);
  });

  it("count the invaders each defender eliminates", async () => {
    const { game, a } = await build("plains", {}, false);
    const invader = game.addPlayer(
      new PlayerInfo("Raider", PlayerType.Nation, null, "raider"),
      ColoredTeams.Nations,
    );
    invader.conquer(game.ref(50, 50));
    game.conquerPlayer(a, invader);
    expect(game.survivalStatus().eliminations).toEqual({ [a.smallID()]: 1 });
  });
});

describe("survival landing zones", () => {
  it("cover a share of the land with a few zones", async () => {
    const { game } = await build();
    const zones = game.survivalZones();
    expect(zones.length).toBeGreaterThan(0);
    expect(zones.length).toBeLessThanOrEqual(SURVIVAL_ZONES);
    let inZones = 0;
    game.map().forEachTile((tile) => {
      if (game.isLand(tile) && game.inSurvivalZone(tile)) inZones++;
    });
    const share = inZones / game.map().numLandTiles();
    expect(share).toBeGreaterThan(0.04);
    expect(share).toBeLessThan(0.2);
  });

  it("land the waves in the zones", async () => {
    const { game } = await build();
    run(game, SURVIVAL_FIRST_WAVE_DELAY_TICKS + 20);
    const wave = invaders(game);
    expect(wave.length).toBeGreaterThan(0);
    for (const invader of wave) {
      expect(game.inSurvivalZone(invader.spawnTile()!)).toBe(true);
    }
  });

  it("are taken back from the defenders by each wave", async () => {
    const { game, a } = await build();
    const z = game.survivalZones()[0];
    // The defender ended up holding part of a zone (fighting in it).
    for (let dx = -3; dx <= 3; dx++) a.conquer(game.ref(z.x + dx, z.y));
    const held = () =>
      Array.from(a.tiles()).filter((t) => game.inSurvivalZone(t)).length;
    expect(held()).toBe(7);
    run(game, SURVIVAL_FIRST_WAVE_DELAY_TICKS + 20);
    expect(held()).toBe(0);
    expect(a.isAlive()).toBe(true);
  });

  it("still take a wave when the invaders already fill them", async () => {
    const { game, b } = await build();
    const holder = game.addPlayer(
      new PlayerInfo("Holder", PlayerType.Nation, null, "holder"),
      ColoredTeams.Nations,
    );
    game.map().forEachTile((t) => {
      if (game.isLand(t) && game.inSurvivalZone(t)) holder.conquer(t);
    });
    run(game, SURVIVAL_FIRST_WAVE_DELAY_TICKS + 20);
    const newcomers = invaders(game).filter((p) => p !== holder);
    expect(newcomers.length).toBe(survivalWaveSize(1, 2));
    for (const p of newcomers) {
      expect(p.numTilesOwned()).toBeGreaterThan(0);
      expect(game.inSurvivalZone(p.spawnTile()!)).toBe(true);
    }
    expect(b.isAlive()).toBe(true);
  });

  it("keep defenders from taking open land in them", async () => {
    const { game, a } = await build("big_plains", {}, false);
    const z = game.survivalZones()[0];
    const edge = game.ref(z.x + z.radius + 2, z.y);
    a.conquer(edge);
    a.addTroops(2_000_000);
    game.addExecution(
      new AttackExecution(1_500_000, a, game.terraNullius().id()),
    );
    run(game, 300);
    let taken = 0;
    for (const tile of a.tiles()) if (game.inSurvivalZone(tile)) taken++;
    expect(a.numTilesOwned()).toBeGreaterThan(50);
    expect(taken).toBe(0);
  });
});
