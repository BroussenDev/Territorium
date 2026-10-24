/**
 * The worker→main tick payload: per-tick numeric stat churn travels on the
 * transferable `packedPlayerUpdates` quad buffer (drained from GameImpl),
 * and `playerNameViewData` is attached only on ticks where the worker
 * recomputed name placements. See GameUpdateViewData in GameUpdates.ts.
 */
import { Executor } from "../src/core/execution/ExecutionManager";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import {
  GameUpdateType,
  GameUpdateViewData,
} from "../src/core/game/GameUpdates";
import { GameRunner } from "../src/core/GameRunner";
import { setup } from "./util/Setup";

const gameID = "game_id";

describe("packedPlayerUpdates (GameImpl drain)", () => {
  let game: Game;
  let alice: Player;

  beforeEach(async () => {
    game = await setup("plains", {});
    const aliceInfo = new PlayerInfo(
      "alice",
      PlayerType.Human,
      "alice_client",
      "alice_id",
    );
    game.addPlayer(aliceInfo);
    game.addExecution(new SpawnExecution(gameID, aliceInfo, game.ref(10, 10)));
    game.executeNextTick();
    game.executeNextTick();
    alice = game.player("alice_id");
    game.drainPackedPlayerUpdates(); // discard spawn-time churn
  });

  test("a stat change is drained as a [smallID, tiles, gold, troops, goldEarned] quint", () => {
    alice.addGold(500n);
    game.executeNextTick();
    const packed = game.drainPackedPlayerUpdates();
    expect(packed).not.toBeNull();
    // Find alice's quint (other players may have churned too).
    let quad: number[] | undefined;
    for (let i = 0; i + 4 < packed!.length; i += 5) {
      if (packed![i] === alice.smallID()) {
        quad = Array.from(packed!.subarray(i, i + 5));
      }
    }
    expect(quad).toEqual([
      alice.smallID(),
      alice.numTilesOwned(),
      Number(alice.gold()),
      alice.troops(),
      Number(alice.goldEarned()),
    ]);
  });

  test("drain returns null when no stats changed and resets between drains", () => {
    alice.addGold(500n);
    game.executeNextTick();
    expect(game.drainPackedPlayerUpdates()).not.toBeNull();
    // Drained — a second drain without a tick has nothing.
    expect(game.drainPackedPlayerUpdates()).toBeNull();
  });
});

describe("GameRunner payload cadence", () => {
  let game: Game;
  let byTick: Map<number, GameUpdateViewData>;
  let tick: () => void;

  beforeEach(async () => {
    game = await setup(
      "plains",
      {},
      [],
      undefined,
      undefined,
      false, // keep the spawn phase under the test's control
    );
    const aliceInfo = new PlayerInfo(
      "alice",
      PlayerType.Human,
      "alice_client",
      "alice_id",
    );
    game.addPlayer(aliceInfo);
    game.addExecution(new SpawnExecution(gameID, aliceInfo, game.ref(10, 10)));
    byTick = new Map();
    const runner = new GameRunner(
      game,
      new Executor(game, gameID, "alice_client"),
      (gu) => {
        if (!("errMsg" in gu)) byTick.set(gu.tick, gu);
      },
    );
    // No runner.init(): no SpawnTimerExecution — the game stays in the spawn
    // phase until the test ends it manually.
    let turn = 0;
    tick = () => {
      runner.addTurn({ turnNumber: turn++, intents: [] });
      runner.executeNextTick();
    };
  });

  // Names are re-placed every 30 ticks, a slice of the players each tick
  // (by smallID), so no tick re-places them all at once; only the names
  // re-placed that tick travel to the main thread.
  test("playerNameViewData carries each player's name once every 30 ticks", () => {
    tick(); // 1
    tick(); // 2
    game.endSpawnPhase();
    for (let t = 3; t <= 70; t++) tick();

    const alice = game.player("alice_id");
    const sent = [...byTick.entries()]
      .filter(([t, gu]) => t >= 3 && gu.playerNameViewData !== undefined)
      .map(([t, gu]) => {
        expect(Object.keys(gu.playerNameViewData!)).toEqual(["alice_id"]);
        return t;
      });
    // Alice's slice comes round every 30 ticks, on her smallID's ticks.
    expect(sent.length).toBe(2);
    for (const t of sent) expect(t % 30).toBe(alice.smallID() % 30);
    expect(sent[1] - sent[0]).toBe(30);
  });

  test("stat churn arrives as packedPlayerUpdates quints on the view data", () => {
    tick(); // 1
    tick(); // 2
    game.endSpawnPhase();
    tick(); // 3 — flush spawn churn

    const alice = game.player("alice_id");
    alice.addGold(500n);
    tick(); // 4
    const gu = byTick.get(game.ticks())!;
    const packed = gu.packedPlayerUpdates;
    expect(packed).toBeDefined();
    expect(packed!.length % 5).toBe(0);
    let quad: number[] | undefined;
    for (let i = 0; i + 4 < packed!.length; i += 5) {
      if (packed![i] === alice.smallID()) {
        quad = Array.from(packed!.subarray(i, i + 5));
      }
    }
    expect(quad).toEqual([
      alice.smallID(),
      alice.numTilesOwned(),
      Number(alice.gold()),
      alice.troops(),
      Number(alice.goldEarned()),
    ]);
    // And the object channel no longer carries the stat fields: alice must
    // not appear in this tick's PlayerUpdates for a gold-only change.
    const playerUpdates = gu.updates[GameUpdateType.Player];
    expect(playerUpdates.find((u) => u.id === "alice_id")).toBeUndefined();
  });
});
