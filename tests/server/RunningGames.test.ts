import { describe, expect, it } from "vitest";
import { GamePhase, type GameServer } from "../../src/server/GameServer";
import { gameKind, runningGame } from "../../src/server/RunningGames";

function fakeGame(opts: {
  isPublic?: boolean;
  publicGameType?: string;
  phase?: GamePhase;
  players?: number;
  started?: boolean;
}): GameServer {
  return {
    id: "GAME0001",
    createdAt: 10,
    gameConfig: { gameMap: "World", gameMode: "Free For All" },
    isPublic: () => opts.isPublic ?? true,
    gameInfo: () => ({ publicGameType: opts.publicGameType }),
    phase: () => opts.phase ?? GamePhase.Active,
    numClients: () => opts.players ?? 3,
    hasStarted: () => opts.started ?? true,
    startedAt: () => ((opts.started ?? true) ? 20 : null),
  } as unknown as GameServer;
}

describe("running games", () => {
  it("tells private, listed, ranked and public games apart", () => {
    expect(gameKind(fakeGame({ isPublic: false }))).toBe("private");
    expect(gameKind(fakeGame({ publicGameType: "hosted" }))).toBe("private");
    expect(gameKind(fakeGame({}))).toBe("ranked");
    expect(gameKind(fakeGame({ publicGameType: "survival" }))).toBe("survival");
  });

  it("lists a game being played", () => {
    expect(runningGame(fakeGame({ publicGameType: "ffa" }))).toEqual({
      gameID: "GAME0001",
      kind: "ffa",
      phase: "active",
      players: 3,
      map: "World",
      mode: "Free For All",
      createdAt: 10,
      startedAt: 20,
    });
  });

  it("shows a lobby with players as a lobby", () => {
    const lobby = fakeGame({
      publicGameType: "ffa",
      phase: GamePhase.Lobby,
      started: false,
    });
    expect(runningGame(lobby)?.phase).toBe("lobby");
  });

  it("leaves out finished games and games nobody is in", () => {
    expect(runningGame(fakeGame({ phase: GamePhase.Finished }))).toBeNull();
    expect(runningGame(fakeGame({ players: 0 }))).toBeNull();
  });
});
