import EventEmitter from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MasterLobbyService } from "../../src/server/MasterLobbyService";
import { ServerEnv } from "../../src/server/ServerEnv";

vi.mock("../../src/server/Logger", () => ({
  logger: { child: () => ({ error: vi.fn(), info: vi.fn() }) },
}));
vi.mock("../../src/server/PollingLoop", () => ({ startPolling: vi.fn() }));

function createMockWorker() {
  const emitter = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
  };
  emitter.send = vi.fn();
  return emitter;
}

// The cluster check-in (ClusterCheckin.ts) reports how many games this
// server is running, so an operator can see when a draining server is empty
// and safe to stop. Each worker reports its own count with its lobby list;
// the master sums them.
describe("MasterLobbyService.liveGames", () => {
  let service: MasterLobbyService;

  beforeEach(() => {
    vi.stubEnv("DOMAIN", "localhost");
    vi.spyOn(ServerEnv, "numWorkers").mockReturnValue(2);
    const playlist = { gameConfig: vi.fn(async () => ({})) };
    const log = { info: vi.fn(), error: vi.fn() } as any;
    service = new MasterLobbyService(playlist as any, log);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("sums the counts every worker last reported", () => {
    const w0 = createMockWorker();
    const w1 = createMockWorker();
    service.registerWorker(0, w0 as any);
    service.registerWorker(1, w1 as any);
    expect(service.liveGames()).toBe(0);

    w0.emit("message", { type: "lobbyList", lobbies: [], liveGames: 3 });
    w1.emit("message", { type: "lobbyList", lobbies: [], liveGames: 4 });
    expect(service.liveGames()).toBe(7);

    w1.emit("message", { type: "lobbyList", lobbies: [], liveGames: 1 });
    expect(service.liveGames()).toBe(4);
  });

  it("treats a report without a count (an older worker build) as zero, and forgets a dead worker", () => {
    const w0 = createMockWorker();
    service.registerWorker(0, w0 as any);
    w0.emit("message", { type: "lobbyList", lobbies: [] });
    expect(service.liveGames()).toBe(0);
    w0.emit("message", { type: "lobbyList", lobbies: [], liveGames: 5 });
    expect(service.liveGames()).toBe(5);
    service.removeWorker(0);
    expect(service.liveGames()).toBe(0);
  });

  // A rolling update (the API's deploy) waits for a fenced server to reach
  // zero busy games: games someone is connected to, lobbies included. The
  // queued empty public lobbies a server always keeps are not counted, so
  // an idle server is at zero.
  it("counts the games someone is connected to as busy", () => {
    const w0 = createMockWorker();
    const w1 = createMockWorker();
    service.registerWorker(0, w0 as any);
    service.registerWorker(1, w1 as any);
    const game = (gameID: string, phase: "lobby" | "active") => ({
      gameID,
      kind: "ffa",
      phase,
      players: 3,
      map: "World",
      mode: "Free For All",
      createdAt: 1,
      startedAt: phase === "active" ? 2 : null,
    });
    w0.emit("message", {
      type: "lobbyList",
      lobbies: [],
      liveGames: 6,
      games: [game("a1", "active"), game("a2", "lobby")],
    });
    w1.emit("message", {
      type: "lobbyList",
      lobbies: [],
      liveGames: 4,
      games: [],
    });
    expect(service.busyGames()).toBe(2);
    w0.emit("message", {
      type: "lobbyList",
      lobbies: [],
      liveGames: 5,
      games: [],
    });
    expect(service.busyGames()).toBe(0);
  });
});
