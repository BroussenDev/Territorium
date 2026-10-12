import { describe, expect, it } from "vitest";
import {
  joinIsGateable,
  multiplayerAllowedForBackend,
  shouldBlockJoin,
  shouldBlockMultiplayerAction,
  shouldBlockSocketSourcedAction,
} from "../src/client/GameModeSelector";
import { GameType } from "../src/core/game/Game";

describe("shouldBlockMultiplayerAction with a session", () => {
  it("does not block when signed in", () => {
    expect(shouldBlockMultiplayerAction({ status: "signed-in" }, false)).toBe(
      false,
    );
  });

  it("does not block while the first sign-in is still in flight", () => {
    expect(shouldBlockMultiplayerAction({ status: "unknown" }, false)).toBe(
      false,
    );
  });

  it("blocks on a signed-out session", () => {
    expect(
      shouldBlockMultiplayerAction(
        { status: "signed-out", reason: "steam-wedged" },
        false,
      ),
    ).toBe(true);
  });

  it("does not block on the web, where there is no session state", () => {
    expect(shouldBlockMultiplayerAction(null, false)).toBe(false);
  });
});

// The parameter is ServerList.backendUnreachableConfirmed(), not the raw
// backendReachable(): the states this rule must NOT gate -- nothing tried
// yet, and one missed heartbeat over a still-serving cached list -- are
// already false by the time they reach here. Those are pinned against the
// real module in tests/client/ServerList.test.ts.
describe("multiplayerAllowedForBackend", () => {
  it("allows multiplayer unless an outage is confirmed", () => {
    expect(multiplayerAllowedForBackend(false)).toBe(true);
  });

  it("blocks multiplayer on a confirmed outage", () => {
    expect(multiplayerAllowedForBackend(true)).toBe(false);
  });
});

describe("shouldBlockMultiplayerAction with a backend outage", () => {
  it("blocks on the web, where there is no session state", () => {
    expect(shouldBlockMultiplayerAction(null, true)).toBe(true);
  });

  it("does not block while the backend is fine", () => {
    expect(shouldBlockMultiplayerAction(null, false)).toBe(false);
  });

  it("still blocks on a missing session while the backend is fine", () => {
    expect(
      shouldBlockMultiplayerAction(
        { status: "signed-out", reason: "network" },
        false,
      ),
    ).toBe(true);
  });
});

describe("joinIsGateable", () => {
  // Matchmaking, deep links and the host/join modals all dispatch join-lobby
  // without passing a dimmed button, so the funnel gate is the only thing
  // standing between a signed-out player and the server's Turnstile close.
  it("gates an ordinary multiplayer join", () => {
    expect(joinIsGateable({ gameID: "g1", source: "public" } as any)).toBe(
      true,
    );
  });

  it("gates a matchmaking join", () => {
    expect(joinIsGateable({ gameID: "g2", source: "matchmaking" } as any)).toBe(
      true,
    );
  });

  // Runs entirely in-client -- no session, no server, nothing to gate.
  it("does not gate single-player", () => {
    expect(
      joinIsGateable({
        gameID: "g3",
        source: "private",
        gameStartInfo: { config: { gameType: GameType.Singleplayer } },
      } as any),
    ).toBe(false);
  });

  // Simulates from the archived record; there is no server to refuse it.
  it("does not gate a replay", () => {
    expect(
      joinIsGateable({
        gameID: "g4",
        source: "private",
        gameRecord: {},
      } as any),
    ).toBe(false);
  });
});

describe("shouldBlockJoin", () => {
  const mp = { gameID: "g", source: "matchmaking" } as any;
  const solo = {
    gameID: "g",
    source: "private",
    gameStartInfo: { config: { gameType: GameType.Singleplayer } },
  } as any;

  it("allows a multiplayer join when signed in", () => {
    expect(shouldBlockJoin(mp, { status: "signed-in" })).toBe(false);
  });

  it("blocks a multiplayer join when signed out", () => {
    expect(
      shouldBlockJoin(mp, { status: "signed-out", reason: "steam-wedged" }),
    ).toBe(true);
  });

  it("never blocks single-player, whatever the session says", () => {
    expect(
      shouldBlockJoin(solo, { status: "signed-out", reason: "steam-wedged" }),
    ).toBe(false);
  });

  // OPE-439. Reachability is not a funnel input at all: by the time a join
  // arrives here its source has already reached a server (an /exists probe,
  // createLobby, a live lobby socket, or the matchmaking queue), so the
  // server-list API's health cannot make this join wrong. Refusing would
  // eject a player whose reload just proved their game is live.
  it("does not block on the web, where there is no session state", () => {
    expect(shouldBlockJoin(mp, null)).toBe(false);
  });
});

/**
 * The other half of the reachability rule (GameModeSelector, top of file):
 * whatever the server-list API is doing, it may not gate an action whose
 * target arrived over a live game-server socket -- a public or hosted lobby
 * card, in either browser. The card exists because a game server sent it over
 * a socket that is still open, which is the only liveness the join needs.
 *
 * This predicate takes no reachability argument AT ALL, which is the point:
 * there is no value a caller could pass that would make a card refuse on the
 * list API's health. The desktop session still applies -- it is a statement
 * about this client, not about any server.
 */
describe("shouldBlockSocketSourcedAction", () => {
  it("allows a card click on the web, where there is no session state", () => {
    expect(shouldBlockSocketSourcedAction(null)).toBe(false);
  });

  it("allows a card click when signed in", () => {
    expect(shouldBlockSocketSourcedAction({ status: "signed-in" })).toBe(false);
  });

  it("still blocks a card click while signed out", () => {
    expect(
      shouldBlockSocketSourcedAction({
        status: "signed-out",
        reason: "steam-wedged",
      }),
    ).toBe(true);
  });

  // The finding this rule answers: the funnel refused to gate a "public" join
  // on reachability while the card that produces it dimmed and refused one
  // step earlier, on exactly the same lobby. Now both ask the same question.
  it("agrees with the funnel on the join its card produces", () => {
    const publicJoin = { gameID: "g", source: "public" } as any;
    for (const session of [
      null,
      { status: "signed-in" } as const,
      { status: "signed-out", reason: "steam-wedged" } as const,
    ]) {
      expect(shouldBlockSocketSourcedAction(session)).toBe(
        shouldBlockJoin(publicJoin, session),
      );
    }
  });
});
