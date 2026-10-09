import EventEmitter from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MasterLobbyService } from "../../src/server/MasterLobbyService";
import { startPolling } from "../../src/server/PollingLoop";
import { ServerEnv } from "../../src/server/ServerEnv";

vi.mock("../../src/server/Logger", () => ({
  logger: { child: () => ({ error: vi.fn(), info: vi.fn() }) },
}));

// Capture the loops instead of running them, so a test runs one pass by hand.
vi.mock("../../src/server/PollingLoop", () => ({
  startPolling: vi.fn(),
}));

function createMockWorker(): EventEmitter & { send: ReturnType<typeof vi.fn> } {
  const emitter = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
  };
  emitter.send = vi.fn();
  return emitter;
}

// 1000ms is the lobby scheduler, 500ms the broadcast.
function task(intervalMs: number): () => Promise<void> {
  const call = vi
    .mocked(startPolling)
    .mock.calls.find(([, ms]) => ms === intervalMs);
  if (call === undefined) throw new Error("loop was not started");
  return call[0];
}

describe("MasterLobbyService with closed games", () => {
  let worker: ReturnType<typeof createMockWorker>;
  let service: MasterLobbyService;

  beforeEach(() => {
    vi.stubEnv("DOMAIN", "localhost");
    vi.spyOn(ServerEnv, "numWorkers").mockReturnValue(1);
    const playlist = { gameConfig: vi.fn(async () => ({})) };
    const log = { info: vi.fn(), error: vi.fn() } as any;
    service = new MasterLobbyService(playlist as any, log);
    worker = createMockWorker();
    service.registerWorker(0, worker as any);
    worker.emit("message", { type: "workerReady", workerId: 0 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(startPolling).mockClear();
  });

  const created = () =>
    worker.send.mock.calls
      .filter(([msg]) => msg.type === "createGame")
      .map(([msg]) => msg.publicGameType);

  it("schedules no lobby of a closed kind", async () => {
    service.setServerStatus({ closed: ["survival"], maintenance: null });
    await task(1000)();
    expect(created()).toContain("ffa");
    expect(created()).not.toContain("survival");
  });

  it("schedules nothing once a maintenance begins", async () => {
    service.setServerStatus({
      closed: [],
      maintenance: { startsAt: Date.now() - 1 },
    });
    await task(1000)();
    expect(created()).toEqual([]);
  });

  it("hides closed lobbies from players and tells the workers", async () => {
    worker.emit("message", {
      type: "lobbyList",
      lobbies: [
        { gameID: "SURV0001", publicGameType: "survival", numClients: 1 },
        { gameID: "FFA00001", publicGameType: "ffa", numClients: 1 },
      ],
      games: [
        {
          gameID: "FFA00002",
          kind: "ffa",
          phase: "active",
          players: 4,
          map: "World",
          mode: "Free For All",
          createdAt: 1,
          startedAt: 2,
        },
        { gameID: "BROKEN" },
      ],
      soloGames: 2,
    });
    const status = { closed: ["survival" as const], maintenance: null };
    service.setServerStatus(status);
    await task(500)();
    const broadcasts = worker.send.mock.calls.filter(
      ([msg]) => msg.type === "lobbiesBroadcast",
    );
    const last = broadcasts[broadcasts.length - 1][0];
    expect(last.publicGames.games.survival).toEqual([]);
    expect(last.publicGames.games.ffa).toHaveLength(1);
    expect(last.serverStatus).toEqual(status);

    const running = service.runningGames();
    expect(running.games.map((g) => g.gameID)).toEqual(["FFA00002"]);
    expect(running.soloGames).toBe(2);
  });
});
