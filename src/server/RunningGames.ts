import type { ClosableGame } from "../core/ServerStatus";
import { type GameServer, GamePhase } from "./GameServer";
import type { RunningGame } from "./IPCBridgeSchema";

/** The kind of game a GameServer runs, among the closable ones. */
export function gameKind(game: GameServer): ClosableGame {
  if (!game.isPublic()) return "private";
  const type = game.gameInfo().publicGameType;
  // Public games without a lobby type are ranked matches (invite-only).
  if (type === undefined) return "ranked";
  return type === "hosted" ? "private" : type;
}

/**
 * A game as the admin panel's server page lists it, or null for one that is
 * over or that nobody is connected to (the queued public lobbies, a lobby
 * whose countdown ran out empty): a restart costs no one anything there.
 */
export function runningGame(game: GameServer): RunningGame | null {
  const phase = game.phase();
  if (phase === GamePhase.Finished) return null;
  if (game.numClients() === 0) return null;
  const config = game.gameConfig;
  return {
    gameID: game.id,
    kind: gameKind(game),
    phase: game.hasStarted() ? "active" : "lobby",
    players: game.numClients(),
    map: String(config.gameMap),
    mode: String(config.gameMode),
    createdAt: game.createdAt,
    startedAt: game.startedAt(),
  };
}
