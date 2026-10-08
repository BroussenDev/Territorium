import { SurvivalExecution } from "../src/core/execution/SurvivalExecution";
import { WinCheckExecution } from "../src/core/execution/WinCheckExecution";
import {
  ColoredTeams,
  Difficulty,
  Game,
  GameMode,
  HumansVsNations,
  PlayerInfo,
  PlayerType,
  TerrainType,
} from "../src/core/game/Game";
import {
  SURVIVAL_FIRST_WAVE_DELAY_TICKS,
  SURVIVAL_MAX_WAVE_SIZE,
  SURVIVAL_WAVE_INTERVAL_TICKS,
  SURVIVAL_WAVES,
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
  it("grow with each wave, capped", () => {
    expect(survivalWaveSize(1, 4)).toBe(3);
    expect(survivalWaveSize(SURVIVAL_WAVES, 4)).toBe(12);
    expect(survivalWaveSize(1, 1)).toBe(1);
    expect(survivalWaveSize(SURVIVAL_WAVES, 100)).toBe(SURVIVAL_MAX_WAVE_SIZE);
  });

  it("land on a fixed schedule after the spawn phase", () => {
    expect(survivalWaveTick(1)).toBe(SURVIVAL_FIRST_WAVE_DELAY_TICKS);
    expect(survivalWaveTick(2)).toBe(
      SURVIVAL_FIRST_WAVE_DELAY_TICKS + SURVIVAL_WAVE_INTERVAL_TICKS,
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
