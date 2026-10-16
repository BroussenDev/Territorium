import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCosmetics } from "../../../../src/client/Cosmetics";
import "../../../../src/client/hud/layers/WinModal";
import {
  survivalReport,
  type WinModal,
} from "../../../../src/client/hud/layers/WinModal";
import { SendWinnerEvent } from "../../../../src/client/Transport";
import type { GameView } from "../../../../src/client/view";
import { EventBus } from "../../../../src/core/EventBus";
import { GameUpdateType } from "../../../../src/core/game/GameUpdates";

vi.mock("../../../../src/client/Utils", () => ({
  translateText: vi.fn((key: string) => key),
  getTranslatedPlayerTeamLabel: vi.fn(
    (team: string | null) => (team === "Red" ? "Rood" : (team ?? "")), // "Rood" is Dutch for "Red"
  ),
  getGamesPlayed: vi.fn(() => 10),
  isInIframe: vi.fn(() => false),
  homeHref: vi.fn(() => "/"),
}));

vi.mock("../../../../src/client/Api", () => ({
  getUserMe: vi.fn(async () => false as const),
}));

vi.mock("../../../../src/client/ClientEnv", () => ({
  ClientEnv: {
    shareOrigin: () => "https://territorium.test",
    gamePath: (gameID: string) => `/w0/game/${gameID}`,
  },
}));

vi.mock("../../../../src/client/Cosmetics", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../../../src/client/Cosmetics")
  >()),
  fetchCosmetics: vi.fn(async () => null),
  resolveCosmetics: vi.fn(() => []),
}));

vi.mock("../../../../src/client/CrazyGamesSDK", () => ({
  crazyGamesSDK: {
    happytime: vi.fn(),
    requestAd: vi.fn(),
    gameplayStop: vi.fn(),
    isOnCrazyGames: vi.fn(() => false),
  },
}));

import { crazyGamesSDK } from "../../../../src/client/CrazyGamesSDK";
import {
  getTranslatedPlayerTeamLabel,
  translateText,
} from "../../../../src/client/Utils";

type Winner = ["team", string] | ["player", string] | undefined;

function makeGame(opts: {
  winner: Winner;
  myTeam?: string;
  myClientID?: string;
  gameType?: string;
  survival?: boolean;
  winnerPlayer?: {
    isPlayer: () => boolean;
    clientID: () => string | null;
    displayName: () => string;
  };
}): GameView {
  const winUpdate = { winner: opts.winner, allPlayersStats: {} };
  return {
    myPlayer: () => ({
      isAlive: () => true,
      hasSpawned: () => true,
      team: () => opts.myTeam ?? null,
      clientID: () => opts.myClientID ?? null,
    }),
    inSpawnPhase: () => false,
    // Off the one-second recap boundary: these tests are about the win.
    ticks: () => 101,
    updatesSinceLastTick: () => ({ [GameUpdateType.Win]: [winUpdate] }),
    playerByClientID: () => opts.winnerPlayer,
    gameID: () => "amDoEPS2Dz",
    config: () => ({
      gameConfig: () => ({ rankedType: undefined, gameType: opts.gameType }),
      numSpawnPhaseTurns: () => 100,
      isSurvivalMode: () => opts.survival ?? false,
    }),
    // A Survival defense: Ann (smallID 1) took 3 invaders and Bo (2) one,
    // holding 250 of 1000 land tiles; one of the two warlords fell.
    gameOver: () => true,
    survivalStatus: () => ({
      wavesLanded: 10,
      bosses: [
        { smallID: 10, wave: 5 },
        { smallID: 11, wave: 10 },
      ],
      eliminations: { 1: 3, 2: 1 },
    }),
    playerBySmallID: (id: number) => ({
      isPlayer: () => true,
      displayName: () => ({ 1: "Ann", 2: "Bo" })[id] ?? `p${id}`,
      isAlive: () => id === 11,
    }),
    players: () => [
      { type: () => "HUMAN", numTilesOwned: () => 200 },
      { type: () => "HUMAN", numTilesOwned: () => 50 },
      { type: () => "NATION", numTilesOwned: () => 400 },
    ],
    numLandTiles: () => 1000,
  } as unknown as GameView;
}

describe("WinModal tick win handling", () => {
  let modal: WinModal | undefined;

  function setup(game: GameView) {
    const eventBus = new EventBus();
    const winnerEvents: SendWinnerEvent[] = [];
    eventBus.on(SendWinnerEvent, (e) => winnerEvents.push(e));
    modal = document.createElement("win-modal") as WinModal;
    modal.game = game;
    modal.eventBus = eventBus;
    return winnerEvents;
  }

  afterEach(() => {
    modal?.remove();
    modal = undefined;
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("emits the winner and celebrates when my team wins", async () => {
    const events = setup(
      makeGame({ winner: ["team", "Blue"], myTeam: "Blue" }),
    );
    modal!.tick();

    expect(events).toHaveLength(1);
    expect(events[0].winner).toEqual(["team", "Blue"]);
    expect(crazyGamesSDK.happytime).toHaveBeenCalled();
    await vi.waitFor(() => expect(modal!.isVisible).toBe(true));
  });

  it("emits the (translated) winner without celebrating when another team wins", async () => {
    const events = setup(makeGame({ winner: ["team", "Red"], myTeam: "Blue" }));
    modal!.tick();

    expect(events).toHaveLength(1);
    expect(events[0].winner).toEqual(["team", "Red"]);
    expect(crazyGamesSDK.happytime).not.toHaveBeenCalled();
    expect(getTranslatedPlayerTeamLabel).toHaveBeenCalledWith("Red");
    expect(translateText).toHaveBeenCalledWith("win_modal.other_team", {
      team: "Rood",
    });
    await vi.waitFor(() => expect(modal!.isVisible).toBe(true));
  });

  it("titles a Survival game by the defense's fate", async () => {
    const events = setup(
      makeGame({
        winner: ["team", "Humans"],
        myTeam: "Humans",
        survival: true,
      }),
    );
    modal!.tick();

    expect(events[0].winner).toEqual(["team", "Humans"]);
    expect(translateText).toHaveBeenCalledWith("win_modal.survival_won");
    expect(crazyGamesSDK.happytime).toHaveBeenCalled();

    setup(
      makeGame({
        winner: ["team", "Nations"],
        myTeam: "Humans",
        survival: true,
      }),
    );
    modal!.tick();
    expect(translateText).toHaveBeenCalledWith("win_modal.survival_lost");
  });

  it("reports how far a Survival defense held and who led it", () => {
    expect(
      survivalReport(makeGame({ winner: ["team", "Humans"], survival: true })),
    ).toEqual({
      wave: 10,
      best: { name: "Ann", eliminations: 3 },
      landShare: 25,
      warlords: 2,
      warlordsDown: 1,
    });
  });

  it("emits a player winner resolved through playerByClientID", async () => {
    const events = setup(
      makeGame({
        winner: ["player", "winner-client"],
        myClientID: "my-client",
        winnerPlayer: {
          isPlayer: () => true,
          clientID: () => "winner-client",
          displayName: () => "Bob",
        },
      }),
    );
    modal!.tick();

    expect(events).toHaveLength(1);
    expect(events[0].winner).toEqual(["player", "winner-client"]);
    expect(crazyGamesSDK.happytime).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(modal!.isVisible).toBe(true));
  });

  it("celebrates when the winning client is me", async () => {
    setup(
      makeGame({
        winner: ["player", "my-client"],
        myClientID: "my-client",
        winnerPlayer: {
          isPlayer: () => true,
          clientID: () => "my-client",
          displayName: () => "Me",
        },
      }),
    );
    modal!.tick();

    expect(crazyGamesSDK.happytime).toHaveBeenCalled();
    await vi.waitFor(() => expect(modal!.isVisible).toBe(true));
  });

  it("emits a winnerless result when the match is cancelled", async () => {
    const events = setup(makeGame({ winner: undefined }));
    modal!.tick();

    expect(events).toHaveLength(1);
    expect(events[0].winner).toBeUndefined();
    await vi.waitFor(() => expect(modal!.isVisible).toBe(true));
  });

  it("shows the buttons as soon as show() runs, before the cosmetics fetch settles", async () => {
    // A visible modal activates steam-wishlist, which observes its own size;
    // jsdom has no ResizeObserver.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.mocked(fetchCosmetics).mockReturnValueOnce(new Promise(() => {}));
    setup(makeGame({ winner: ["team", "Blue"], myTeam: "Blue" }));
    document.body.appendChild(modal!);

    void modal!.show();
    await modal!.updateComplete;

    expect(modal!.isVisible).toBe(true);
    const exit = modal!.querySelector("o-button[data-win-exit]");
    expect(exit).not.toBeNull();
    expect(exit!.parentElement!.classList.contains("hidden")).toBe(false);
  });

  it("holds the closing buttons for a few seconds so the store items get a look", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.useFakeTimers();
    try {
      setup(makeGame({ winner: ["team", "Blue"], myTeam: "Blue" }));
      document.body.appendChild(modal!);
      void modal!.show();
      await modal!.updateComplete;

      const exit = () =>
        modal!.querySelector("o-button[data-win-exit]") as HTMLElement;
      expect(exit().hasAttribute("disable")).toBe(true);
      expect(exit().title).toBe("win_modal.exit (5)");

      await vi.advanceTimersByTimeAsync(4000);
      await modal!.updateComplete;
      expect(exit().title).toBe("win_modal.exit (1)");

      await vi.advanceTimersByTimeAsync(1000);
      await modal!.updateComplete;
      expect(exit().hasAttribute("disable")).toBe(false);
      expect(exit().title).toBe("win_modal.exit");
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers the replay link of a finished multiplayer game", async () => {
    setup(
      makeGame({
        winner: ["team", "Blue"],
        myTeam: "Blue",
        gameType: "Public",
      }),
    );
    document.body.appendChild(modal!);
    modal!.tick();

    await vi.waitFor(() =>
      expect(modal!.querySelector("[data-win-replay]")).not.toBeNull(),
    );
    const link = (modal as unknown as { replayLink: string }).replayLink;
    expect(link).toBe("https://territorium.test/w0/game/amDoEPS2Dz");
  });

  it("offers no replay link for a guest's singleplayer game", async () => {
    setup(
      makeGame({
        winner: ["team", "Blue"],
        myTeam: "Blue",
        gameType: "Singleplayer",
      }),
    );
    document.body.appendChild(modal!);
    modal!.tick();

    await vi.waitFor(() => expect(modal!.isVisible).toBe(true));
    await modal!.updateComplete;
    expect(modal!.querySelector("[data-win-replay]")).toBeNull();
  });

  it("ignores a player win whose winner is not a known player", () => {
    const events = setup(
      makeGame({ winner: ["player", "gone"], winnerPlayer: undefined }),
    );
    modal!.tick();

    expect(events).toHaveLength(0);
    expect(modal!.isVisible).toBe(false);
  });
});
