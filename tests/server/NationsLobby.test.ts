import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GameMapType, GameType } from "../../src/core/game/Game";
import { Client } from "../../src/server/Client";
import { GameServer } from "../../src/server/GameServer";
import {
  cid,
  makeClient as harnessClient,
  makeGame as harnessGame,
  mockLogger,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

// Manifest indices of the giant world map.
const FRANCE = 2;
const SPAIN = 3;
const ANTARCTICA = 49;

function makeClient(id: string, spectator = false): Client {
  return harnessClient({
    clientID: cid(id),
    persistentID: `${id}-pid`,
    publicId: `${id}-pub`,
    spectator,
  });
}

// Lets pickNation's async country lookup settle.
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
}

function startPlayers(game: GameServer, client: Client) {
  startGame(game);
  const start = mockWsOf(client)
    .sent()
    .find((m) => m.type === "start");
  if (start?.type !== "start") throw new Error("no start message");
  return start.gameStartInfo.players;
}

describe("GameServer - Nations lobby", () => {
  let logger: any;

  beforeEach(() => {
    vi.useFakeTimers();
    logger = mockLogger();
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const makeGame = (gameVariant: "nations" | null = "nations") =>
    harnessGame({
      log: logger,
      config: {
        gameType: GameType.Private,
        gameMap: GameMapType.GiantWorldMap,
        gameVariant: gameVariant ?? undefined,
      },
    });

  it("stamps each player's country on the start info", async () => {
    const game = makeGame();
    const a = makeClient("a");
    const b = makeClient("b");
    game.joinClient(a);
    game.joinClient(b);
    await mockWsOf(a).emit({ type: "pick_nation", nation: FRANCE });
    await flush();

    expect(game.gameInfo(a.clientID).clients?.[0].nation).toBe(FRANCE);
    const players = startPlayers(game, a);
    expect(players.find((p) => p.clientID === a.clientID)?.nation).toBe(FRANCE);
    expect(players.find((p) => p.clientID === b.clientID)?.nation).toBe(
      undefined,
    );
  });

  it("keeps a country for the first player who picked it", async () => {
    const game = makeGame();
    const a = makeClient("a");
    const b = makeClient("b");
    game.joinClient(a);
    game.joinClient(b);
    await mockWsOf(a).emit({ type: "pick_nation", nation: FRANCE });
    await flush();
    await mockWsOf(b).emit({ type: "pick_nation", nation: FRANCE });
    await flush();
    await mockWsOf(b).emit({ type: "pick_nation", nation: ANTARCTICA });
    await flush();

    const nations = game.gameInfo().clients?.map((c) => c.nation);
    expect(nations).toEqual([FRANCE, undefined]);
  });

  it("frees a country when its player releases it", async () => {
    const game = makeGame();
    const a = makeClient("a");
    const b = makeClient("b");
    game.joinClient(a);
    game.joinClient(b);
    await mockWsOf(a).emit({ type: "pick_nation", nation: FRANCE });
    await flush();
    await mockWsOf(a).emit({ type: "pick_nation", nation: null });
    await flush();
    await mockWsOf(b).emit({ type: "pick_nation", nation: FRANCE });
    await flush();

    const nations = game.gameInfo().clients?.map((c) => c.nation);
    expect(nations).toEqual([undefined, FRANCE]);
  });

  it("ignores picks outside Nations lobbies, from spectators or after start", async () => {
    const other = makeGame(null);
    const a = makeClient("a");
    other.joinClient(a);
    await mockWsOf(a).emit({ type: "pick_nation", nation: FRANCE });
    await flush();
    expect(other.gameInfo().clients?.[0].nation).toBe(undefined);

    const game = makeGame();
    const b = makeClient("b");
    const cast = makeClient("cast", true);
    game.joinClient(b);
    game.joinClient(cast);
    await mockWsOf(cast).emit({ type: "pick_nation", nation: SPAIN });
    await flush();
    expect(game.gameInfo().clients?.map((c) => c.nation)).toEqual([
      undefined,
      undefined,
    ]);

    startGame(game);
    await mockWsOf(b).emit({ type: "pick_nation", nation: SPAIN });
    await flush();
    expect(game.gameInfo().clients?.[0].nation).toBe(undefined);
  });
});
