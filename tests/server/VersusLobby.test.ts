import EventEmitter from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameType } from "../../src/core/game/Game";
import { VersusTeamSize, versusGameConfig } from "../../src/core/game/Versus";
import { lobbyMessage } from "../../src/server/DiscordLobbyAnnouncer";
import { GamePhase, GameServer } from "../../src/server/GameServer";
import { MapPlaylist } from "../../src/server/MapPlaylist";
import { MasterLobbyService } from "../../src/server/MasterLobbyService";
import { startPolling } from "../../src/server/PollingLoop";
import { ServerEnv } from "../../src/server/ServerEnv";
import {
  cid,
  makeClient as harnessClient,
  makeGame as harnessGame,
  mockLogger,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

vi.mock("../../src/server/PollingLoop", () => ({
  startPolling: vi.fn(),
}));

const HOST = "host-pid";

function makeClient(id: string, spectator = false) {
  return harnessClient({
    clientID: cid(id),
    persistentID: id === "host" ? HOST : `${id}-pid`,
    publicId: `${id}-pub`,
    spectator,
  });
}

function makeGame(
  size: VersusTeamSize,
  gameType: GameType.Public | GameType.Private,
): GameServer {
  return harnessGame({
    log: mockLogger(),
    config: versusGameConfig(size, gameType),
    creatorPersistentID: gameType === GameType.Private ? HOST : undefined,
    publicGameType: gameType === GameType.Public ? "2v2" : undefined,
  });
}

const asHost = (game: GameServer) => ({
  clientID: game.gameInfo().clients![0].clientID,
  isLobbyCreator: true,
  isAdmin: false,
  isAdminBot: false,
});

function startTeams(game: GameServer, client: ReturnType<typeof makeClient>) {
  startGame(game);
  const start = mockWsOf(client)
    .sent()
    .find((m) => m.type === "start");
  if (start?.type !== "start") throw new Error("no start message");
  return start.gameStartInfo.players;
}

describe("GameServer - versus lobby", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("starts a public lobby once full, and reopens it if a player leaves", () => {
    const game = makeGame(2, GameType.Public);
    const players = ["a", "b", "c", "d"].map((id) => makeClient(id));
    for (const p of players.slice(0, 3)) game.joinClient(p);
    expect(game.phase()).toBe(GamePhase.Lobby);

    // No seat is held back for queue priority: all four are open.
    expect(game.joinClient(players[3])).toBe("joined");
    expect(game.phase()).toBe(GamePhase.Active);

    mockWsOf(players[3]).emit({ type: "spectate", spectator: true });
    expect(game.phase()).toBe(GamePhase.Lobby);
  });

  it("waits for its host in a private lobby, and only starts full", () => {
    const game = makeGame(1, GameType.Private);
    const host = makeClient("host");
    game.joinClient(host);

    const toggle = { type: "toggle_game_start_timer" } as any;
    expect(game.handleIntent(toggle, asHost(game)).status).toBe(409);

    game.joinClient(makeClient("b"));
    expect(game.phase()).toBe(GamePhase.Lobby);
    expect(game.handleIntent(toggle, asHost(game)).status).toBe(200);
    vi.advanceTimersByTime(3_000 + 1);
    expect(game.phase()).toBe(GamePhase.Active);
  });

  it("refuses any change to its rules", () => {
    const game = makeGame(1, GameType.Private);
    game.joinClient(makeClient("host"));
    const result = game.handleIntent(
      { type: "update_game_config", config: { bots: 400 } } as any,
      asHost(game),
    );
    expect(result.status).toBe(409);
    expect(game.gameInfo().gameConfig?.bots).toBe(0);
  });

  it("puts players on the side they picked, at most a full team per side", async () => {
    const game = makeGame(2, GameType.Private);
    const [host, b, c, d] = ["host", "b", "c", "d"].map((id) => makeClient(id));
    for (const p of [host, b, c, d]) game.joinClient(p);

    await mockWsOf(host).emit({ type: "pick_team", team: 1 });
    await mockWsOf(b).emit({ type: "pick_team", team: 1 });
    // The east side is full.
    await mockWsOf(c).emit({ type: "pick_team", team: 1 });
    await mockWsOf(d).emit({ type: "pick_team", team: 0 });

    const teams = game.gameInfo().clients!.map((p) => p.teamIndex);
    expect(teams).toEqual([1, 1, undefined, 0]);

    // Changing one's mind frees the place.
    await mockWsOf(b).emit({ type: "pick_team", team: null });
    await mockWsOf(c).emit({ type: "pick_team", team: 1 });
    expect(game.gameInfo().clients!.map((p) => p.teamIndex)).toEqual([
      1,
      undefined,
      1,
      0,
    ]);

    const start = startTeams(game, host);
    expect(start.map((p) => p.teamIndex)).toEqual([1, undefined, 1, 0]);
  });

  it("ignores team picks in a public lobby", async () => {
    const game = makeGame(1, GameType.Public);
    const a = makeClient("a");
    game.joinClient(a);
    await mockWsOf(a).emit({ type: "pick_team", team: 1 });
    expect(game.gameInfo().clients![0].teamIndex).toBeUndefined();
  });
});

describe("Versus scheduling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(startPolling).mockClear();
  });

  it("plays the fixed preset of each format", async () => {
    const playlist = new MapPlaylist();
    for (const [type, size] of [
      ["1v1", 1],
      ["2v2", 2],
      ["3v3", 3],
      ["4v4", 4],
    ] as const) {
      expect(await playlist.gameConfig(type)).toEqual(
        versusGameConfig(size, GameType.Public),
      );
    }
  });

  it("keeps one open lobby per format, with no countdown", async () => {
    vi.stubEnv("DOMAIN", "localhost");
    vi.spyOn(ServerEnv, "numWorkers").mockReturnValue(1);
    const playlist = { gameConfig: vi.fn(async () => ({})) };
    const service = new MasterLobbyService(
      playlist as any,
      {
        info: vi.fn(),
        error: vi.fn(),
      } as any,
    );
    const worker = new EventEmitter() as EventEmitter & {
      send: ReturnType<typeof vi.fn>;
    };
    worker.send = vi.fn();
    service.registerWorker(0, worker as any);
    worker.emit("message", { type: "workerReady", workerId: 0 });
    worker.emit("message", {
      type: "lobbyList",
      lobbies: [{ gameID: "VERSUS01", publicGameType: "1v1", numClients: 1 }],
    });

    const scheduler = vi
      .mocked(startPolling)
      .mock.calls.find(([, ms]) => ms === 1000)![0];
    await scheduler();

    const sent = worker.send.mock.calls.map(([msg]) => msg);
    const created = sent
      .filter((m) => m.type === "createGame")
      .map((m) => m.publicGameType);
    expect(created.filter((t) => t === "1v1")).toHaveLength(0);
    for (const type of ["2v2", "3v3", "4v4"]) {
      expect(created.filter((t) => t === type)).toHaveLength(1);
    }
    expect(
      sent.some((m) => m.type === "updateLobby" && m.gameID === "VERSUS01"),
    ).toBe(false);
  });

  it("names the format in the Discord post", () => {
    const message = lobbyMessage(
      {
        gameID: "VERSUS01",
        numClients: 1,
        publicGameType: "3v3",
        gameConfig: versusGameConfig(3, GameType.Public),
      },
      "https://example.com",
    );
    expect(JSON.stringify(message)).toContain("Versus 3v3");
  });
});
