import path from "path";
import { describe, expect, it } from "vitest";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "../../src/core/game/Game";
import { GameUpdateType, HashUpdate } from "../../src/core/game/GameUpdates";
import { createGameRunner } from "../../src/core/GameRunner";
import { GameConfig, GameRecord, Turn } from "../../src/core/Schemas";
import { createPartialGameRecord } from "../../src/core/Util";
import { NodeMapLoader } from "../../src/server/NodeMapLoader";
import { verifySoloRecord } from "../../src/server/SoloVerifier";

const loader = new NodeMapLoader(
  path.join(__dirname, "../testdata/maps"),
  path.join(__dirname, "../testdata/no-static"),
);
const COMMIT = "a".repeat(40);

// A lobby timer of one minute ends the game at tick ~600 with the lone
// human, the biggest player, as the winner.
const config: GameConfig = {
  gameMap: GameMapType.World,
  gameMapSize: GameMapSize.Compact,
  gameType: GameType.Singleplayer,
  gameMode: GameMode.FFA,
  difficulty: Difficulty.Medium,
  bots: 0,
  nations: "disabled",
  donateGold: false,
  donateTroops: false,
  infiniteGold: false,
  infiniteTroops: false,
  instantBuild: false,
  randomSpawn: true,
  maxTimerValue: 1,
  seed: "challenge-seed",
};

// Plays the game the way the singleplayer client does and returns its
// record: a turn per tick, the hash every 100 turns, archived at the win.
async function play(
  gameID: string,
  clientID: string,
  seed = "challenge-seed",
): Promise<GameRecord> {
  console.debug = () => {};
  const hashes = new Map<number, number>();
  const runner = await createGameRunner(
    {
      gameID,
      lobbyCreatedAt: 0,
      config: { ...config, seed },
      players: [{ clientID, username: "Racer", clanTag: null }],
    },
    clientID,
    loader,
    (gu) => {
      if ("errMsg" in gu) throw new Error(gu.errMsg);
      for (const hu of gu.updates[GameUpdateType.Hash] as HashUpdate[]) {
        hashes.set(hu.tick, hu.hash);
      }
    },
  );
  const turns: Turn[] = [];
  while (runner.game.getWinner() === null && turns.length < 5000) {
    const turn: Turn = { turnNumber: turns.length, intents: [] };
    turns.push(turn);
    runner.addTurn(turn);
    runner.executeNextTick();
    const hash = hashes.get(turn.turnNumber);
    if (turn.turnNumber % 100 === 0 && hash !== undefined) turn.hash = hash;
  }
  const winner = runner.game.getWinner();
  if (winner === null || typeof winner === "string") {
    throw new Error("the test game was not won");
  }
  return {
    ...createPartialGameRecord(
      gameID,
      { ...config, seed },
      [
        {
          clientID,
          username: "Racer",
          clanTag: null,
          persistentID: null,
          stats: {},
        },
      ],
      turns,
      0,
      60_000,
      ["player", winner.clientID()!],
    ),
    gitCommit: COMMIT,
  };
}

describe("verifySoloRecord", () => {
  it("confirms an honest win at the tick it happened", async () => {
    const record = await play("GameAaaa", "clientAA");
    const result = await verifySoloRecord(record, COMMIT, loader);
    expect(result.won).toBe(true);
    expect(result.ticks).toBeGreaterThan(500);
    expect(result.ticks).toBeLessThanOrEqual(record.info.num_turns);
  }, 60_000);

  it("rejects a record whose hashes were tampered with", async () => {
    const record = await play("GameBbbb", "clientBB");
    const hashed = record.turns.filter((t) => t.hash !== undefined);
    hashed[hashed.length - 1].hash! += 1;
    expect(await verifySoloRecord(record, COMMIT, loader)).toEqual({
      won: false,
      reason: "desync",
    });
    // Played on another build: not the player's fault, but not a valid run.
    expect(await verifySoloRecord(record, "b".repeat(40), loader)).toEqual({
      won: false,
      reason: "version",
    });
  }, 60_000);

  it("rejects a record that stops before the win", async () => {
    const record = await play("GameCccc", "clientCC");
    record.info.num_turns = 300;
    record.turns = record.turns.filter((t) => t.turnNumber < 300);
    expect(await verifySoloRecord(record, COMMIT, loader)).toEqual({
      won: false,
      reason: "no_win",
    });
  }, 60_000);

  it("rejects what isn't a game record", async () => {
    expect(await verifySoloRecord({ info: {} }, COMMIT, loader)).toEqual({
      won: false,
      reason: "invalid",
    });
  });
});

describe("challenge seeds", () => {
  it("give every player the same start, whatever their game and client IDs", async () => {
    const a = await play("GameDddd", "clientDD");
    const b = await play("GameEeee", "clientEE");
    expect(a.info.num_turns).toBe(b.info.num_turns);
    expect(a.turns.map((t) => t.hash)).toEqual(b.turns.map((t) => t.hash));
    const other = await play("GameDddd", "clientDD", "another-seed");
    expect(other.turns.map((t) => t.hash)).not.toEqual(
      a.turns.map((t) => t.hash),
    );
  }, 60_000);
});
