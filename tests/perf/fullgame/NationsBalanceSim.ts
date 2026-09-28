/**
 * Nations balance simulation: plays a Nations game on the giant world map
 * with every country run by the nation AI (the same config as the public
 * Nations lobbies) and records, for each country, its starting size, its
 * size every minute and when it was eliminated.
 *
 * Usage:
 *   npx tsx tests/perf/fullgame/NationsBalanceSim.ts --seed s1 --out s1.json
 *                                                    [--max-minutes 60]
 *                                                    [--maps resources/maps]
 *
 * Run several seeds in parallel and compare them with
 * tests/perf/fullgame/NationsBalanceReport.ts.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  Player,
  PlayerType,
} from "../../../src/core/game/Game";
import { GameUpdateType } from "../../../src/core/game/GameUpdates";
import { createGameRunner } from "../../../src/core/GameRunner";
import { GameConfig, GameStartInfo } from "../../../src/core/Schemas";
import { NodeGameMapLoader } from "./NodeGameMapLoader";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const TICKS_PER_MINUTE = 600;

export interface CountryResult {
  name: string;
  startTiles: number;
  /** Tiles owned at the end of each game minute. */
  tilesByMinute: number[];
  /** Game minute the country was eliminated, or null if it survived. */
  eliminatedAt: number | null;
  finalTiles: number;
}

export interface SimResult {
  seed: string;
  minutes: number;
  landTiles: number;
  winner: string | null;
  countries: CountryResult[];
}

function parseArgs(argv: string[]) {
  const opts = {
    seed: "nations-1",
    out: "",
    maxMinutes: 60,
    maps: path.join(PROJECT_ROOT, "resources/maps"),
  };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[++i];
    switch (argv[i - 1]) {
      case "--seed":
        opts.seed = v;
        break;
      case "--out":
        opts.out = v;
        break;
      case "--max-minutes":
        opts.maxMinutes = parseInt(v, 10);
        break;
      case "--maps":
        opts.maps = v;
        break;
      default:
        throw new Error(`unknown argument: ${argv[i - 1]}`);
    }
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.debug = () => {};
  console.info = () => {};

  // Same as MapPlaylist.getNationsConfig().
  const gameConfig: GameConfig = {
    donateGold: false,
    donateTroops: false,
    gameMap: GameMapType.GiantWorldMap,
    gameType: GameType.Public,
    gameMapSize: GameMapSize.Normal,
    publicGameModifiers: {},
    difficulty: Difficulty.Medium,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
    nations: "default",
    gameMode: GameMode.FFA,
    bots: 0,
    disabledUnits: [],
    disableClanTags: true,
    overtime: { enabled: true },
    gameVariant: "nations",
  };
  const gameStart: GameStartInfo = {
    gameID: opts.seed,
    lobbyCreatedAt: 0,
    config: gameConfig,
    players: [],
  };

  let won = false;
  let fatal: string | null = null;
  const runner = await createGameRunner(
    gameStart,
    undefined,
    new NodeGameMapLoader(opts.maps),
    (gu) => {
      if ("errMsg" in gu) {
        fatal = gu.errMsg;
        return;
      }
      if (gu.updates[GameUpdateType.Win].length > 0) won = true;
    },
  );
  const game = runner.game;

  const results = new Map<string, CountryResult>();
  let turn = 0;
  const step = () => {
    runner.addTurn({ turnNumber: turn++, intents: [] });
    if (!runner.executeNextTick() || fatal !== null) {
      throw new Error(`simulation stopped: ${fatal ?? "no tick"}`);
    }
  };

  // First tick hands out the countries.
  while (game.ticks() < 2) step();
  for (const p of game.players()) {
    if (p.type() !== PlayerType.Nation) continue;
    results.set(p.id(), {
      name: p.name(),
      startTiles: p.numTilesOwned(),
      tilesByMinute: [],
      eliminatedAt: null,
      finalTiles: 0,
    });
  }
  while (game.inSpawnPhase()) step();

  const started = performance.now();
  const maxTicks = opts.maxMinutes * TICKS_PER_MINUTE;
  let played = 0;
  while (played < maxTicks && !won) {
    step();
    played++;
    if (played % TICKS_PER_MINUTE !== 0) continue;
    const minute = played / TICKS_PER_MINUTE;
    // allPlayers: players() hides the eliminated ones.
    for (const p of game.allPlayers()) {
      const r = results.get(p.id());
      if (r === undefined) continue;
      const tiles = p.numTilesOwned();
      r.tilesByMinute.push(tiles);
      if (tiles === 0 && r.eliminatedAt === null) r.eliminatedAt = minute;
    }
    const alive = [...results.values()].filter((r) => r.eliminatedAt === null);
    process.stderr.write(
      `[${opts.seed}] minute ${minute}: ${alive.length} alive, ` +
        `${((performance.now() - started) / 1000).toFixed(0)}s\n`,
    );
  }

  for (const p of game.allPlayers()) {
    const r = results.get(p.id());
    if (r !== undefined) r.finalTiles = p.numTilesOwned();
  }
  const out: SimResult = {
    seed: opts.seed,
    minutes: played / TICKS_PER_MINUTE,
    landTiles: game.numLandTiles(),
    winner: winnerName(game.getWinner()),
    countries: [...results.values()],
  };
  const json = JSON.stringify(out);
  if (opts.out !== "") {
    fs.writeFileSync(opts.out, json);
  } else {
    console.log(json);
  }
}

function winnerName(winner: Player | string | null): string | null {
  if (winner === null) return null;
  return typeof winner === "string" ? winner : winner.name();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
