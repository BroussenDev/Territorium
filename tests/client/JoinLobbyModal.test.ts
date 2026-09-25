import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const presenceMocks = vi.hoisted(() => ({
  isAvailable: vi.fn(() => false),
  openInviteDialog: vi.fn(async () => true),
}));

// The desktop bridge is absent in a browser and in jsdom. Mocking the module
// lets each test state which shell it is running in, which is the only thing
// the invite button is gated on.
vi.mock("../../src/client/DesktopPresence", () => ({
  desktopPresence: {
    isAvailable: presenceMocks.isAvailable,
    openInviteDialog: presenceMocks.openInviteDialog,
    set: vi.fn(),
    consumePendingInvite: vi.fn(async () => null),
    subscribeInvites: vi.fn(() => () => undefined),
  },
}));

vi.mock("../../src/client/Api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/Api")>()),
  getApiBase: vi.fn(() => "https://api.test"),
}));

vi.mock("../../src/client/InGameModal", () => ({
  showInGameAlert: vi.fn(async () => true),
  showInGameConfirm: vi.fn(async () => true),
}));

import { ClientEnv } from "../../src/client/ClientEnv";
import { showInGameConfirm } from "../../src/client/InGameModal";
import { JoinLobbyModal } from "../../src/client/JoinLobbyModal";
import {
  Difficulty,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
} from "../../src/core/game/Game";
import { createPartialGameRecord } from "../../src/core/Util";

describe("JoinLobbyModal server time offset", () => {
  let nowMs = 0;

  beforeEach(() => {
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates serverTimeOffset from lobby serverTime", () => {
    const modal = new JoinLobbyModal();
    (modal as any).syncCountdownTimer = vi.fn();

    nowMs = 220_000;
    (modal as any).updateFromLobby({
      gameID: "g1",
      serverTime: 200_000,
      startsAt: 230_000,
      clients: [],
    });

    expect((modal as any).serverTimeOffset).toBe(-20_000);
    expect((modal as any).lobbyStartAt).toBe(230_000);
  });

  it("does not trigger join timeout early when local clock is ahead", () => {
    const modal = new JoinLobbyModal();
    const closeSpy = vi
      .spyOn(modal, "closeAndLeave")
      .mockImplementation(() => undefined);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    (modal as any).isModalOpen = true;
    (modal as any).isConnecting = true;
    (modal as any).handledJoinTimeout = false;

    // Local clock is +60s ahead of server clock.
    nowMs = 160_000;
    (modal as any).lobbyStartAt = 105_000;
    (modal as any).serverTimeOffset = -60_000;

    (modal as any).checkForJoinTimeout();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect((modal as any).handledJoinTimeout).toBe(false);
  });

  it("triggers join timeout once adjusted server time reaches lobbyStartAt", () => {
    const modal = new JoinLobbyModal();
    const closeSpy = vi
      .spyOn(modal, "closeAndLeave")
      .mockImplementation(() => undefined);
    const dispatchSpy = vi.spyOn(window, "dispatchEvent");

    (modal as any).isModalOpen = true;
    (modal as any).isConnecting = true;
    (modal as any).handledJoinTimeout = false;
    (modal as any).lobbyStartAt = 105_000;
    (modal as any).serverTimeOffset = -60_000;

    nowMs = 165_000;
    (modal as any).checkForJoinTimeout();

    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect((modal as any).handledJoinTimeout).toBe(true);
  });
});

describe("JoinLobbyModal spectate link", () => {
  // A spectate URL is the same lobby link with ?spectate: it must reach the
  // server as a spectator join, and fall through to the archive once the game
  // is over exactly as the play link does.
  const modalWith = (exists: boolean, archived: string) => {
    const modal = new JoinLobbyModal();
    (modal as any).startTrackingLobby = vi.fn();
    (modal as any).resetTrackingState = vi.fn();
    (modal as any).showMessage = vi.fn();
    (modal as any).checkActiveLobby = vi.fn().mockResolvedValue(exists);
    (modal as any).checkArchivedGame = vi.fn().mockResolvedValue(archived);
    return modal;
  };

  it("joins a live lobby as a spectator", async () => {
    const modal = modalWith(true, "not_found");
    await (modal as any).handleUrlJoin("AbCd1234", true);
    expect((modal as any).checkActiveLobby).toHaveBeenCalledWith(
      "AbCd1234",
      true,
    );
    expect((modal as any).checkArchivedGame).not.toHaveBeenCalled();
  });

  it("joins as a player without the flag", async () => {
    const modal = modalWith(true, "not_found");
    await (modal as any).handleUrlJoin("AbCd1234");
    expect((modal as any).checkActiveLobby).toHaveBeenCalledWith(
      "AbCd1234",
      false,
    );
  });

  it("becomes the replay once the game is over", async () => {
    const modal = modalWith(false, "success");
    await (modal as any).handleUrlJoin("AbCd1234", true);
    expect((modal as any).checkArchivedGame).toHaveBeenCalledWith("AbCd1234");
    expect((modal as any).showMessage).not.toHaveBeenCalled();
  });
});

describe("JoinLobbyModal replay of an archived game", () => {
  const BUILD = "a".repeat(40);
  const OTHER = "b".repeat(40);

  const record = (over: Record<string, unknown> = {}) => ({
    ...createPartialGameRecord(
      "AbCd1234",
      {
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
      },
      [
        {
          clientID: "clientAA",
          username: "Racer",
          clanTag: null,
          persistentID: null,
          stats: {},
        },
      ],
      [{ turnNumber: 0, intents: [] }],
      0,
      60_000,
      undefined,
    ),
    gitCommit: BUILD,
    ...over,
  });

  const check = async (archived: unknown) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(archived))),
    );
    const modal = new JoinLobbyModal();
    (modal as any).redirectToVersionedShell = vi.fn(async () => false);
    const joins: CustomEvent[] = [];
    modal.addEventListener("join-lobby", (e) => joins.push(e as CustomEvent));
    const result = await (modal as any).checkArchivedGame("AbCd1234");
    return { result, joins };
  };

  beforeEach(() => {
    vi.spyOn(ClientEnv, "gitCommit").mockReturnValue(BUILD);
    vi.mocked(showInGameConfirm).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("plays a record of this build straight away", async () => {
    const { result, joins } = await check(record());
    expect(result).toBe("success");
    expect(showInGameConfirm).not.toHaveBeenCalled();
    expect(joins[0].detail.gameRecord.info.gameID).toBe("AbCd1234");
  });

  it("says the replay wasn't recorded when the record has no moves", async () => {
    const noTurns: Record<string, unknown> = record();
    delete noTurns.turns;
    const { result, joins } = await check(noTurns);
    expect(result).toBe("replay_unavailable");
    expect(joins).toHaveLength(0);
  });

  it("offers to watch a record of another build anyway", async () => {
    vi.mocked(showInGameConfirm).mockResolvedValueOnce(true);
    const { result, joins } = await check(record({ gitCommit: OTHER }));
    expect(showInGameConfirm).toHaveBeenCalledWith(
      "private_lobby.replay_other_version",
      expect.objectContaining({ variant: "warning" }),
    );
    expect(result).toBe("success");
    expect(joins).toHaveLength(1);
  });

  it("stays put when the player declines another build's replay", async () => {
    vi.mocked(showInGameConfirm).mockResolvedValueOnce(false);
    const { result, joins } = await check(record({ gitCommit: OTHER }));
    expect(result).toBe("declined");
    expect(joins).toHaveLength(0);
  });

  it("treats a record without a commit as another build", async () => {
    vi.mocked(showInGameConfirm).mockResolvedValueOnce(true);
    const noCommit: Record<string, unknown> = record();
    delete noCommit.gitCommit;
    const { result, joins } = await check(noCommit);
    expect(showInGameConfirm).toHaveBeenCalledTimes(1);
    expect(result).toBe("success");
    expect(joins[0].detail.gameRecord.info.gameID).toBe("AbCd1234");
  });
});

// OPE-205. Steam's invite dialog is reachable only through the in-game
// overlay, so this button is desktop-shell-only: desktopPresence.isAvailable()
// checks shell.api >= 2, which is false in a browser and on an older depot's
// shell. These tests pin the gating and the wiring; whether the dialog
// actually renders is OPE-200's acceptance criterion and needs a packaged
// Steam build to verify.
describe("JoinLobbyModal Steam invite button", () => {
  const INVITE = "[data-test-invite-friends]";

  function renderHeader(modal: JoinLobbyModal): HTMLElement {
    const container = document.createElement("div");
    render(
      (
        modal as unknown as { renderHeaderSlot(): unknown }
      ).renderHeaderSlot() as never,
      container,
    );
    return container;
  }

  // A joined lobby whose config has arrived; private FFA unless overridden.
  function lobbyModal(config?: {
    gameType: GameType;
    gameMode: GameMode;
  }): JoinLobbyModal {
    const modal = new JoinLobbyModal();
    (modal as unknown as { currentLobbyId: string }).currentLobbyId =
      "ABCD1234";
    (modal as unknown as { gameConfig: unknown }).gameConfig = config ?? {
      gameType: GameType.Private,
      gameMode: GameMode.FFA,
    };
    return modal;
  }

  beforeEach(() => {
    presenceMocks.isAvailable.mockReset().mockReturnValue(false);
    presenceMocks.openInviteDialog.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is absent in a browser", () => {
    presenceMocks.isAvailable.mockReturnValue(false);

    expect(renderHeader(lobbyModal()).querySelector(INVITE)).toBeNull();
  });

  it("is absent before joining a lobby, even on the desktop shell", () => {
    presenceMocks.isAvailable.mockReturnValue(true);
    const modal = new JoinLobbyModal();

    // There is nothing to invite anyone into until a lobby is joined.
    expect(renderHeader(modal).querySelector(INVITE)).toBeNull();
  });

  it("appears in a joined private lobby on the desktop shell", () => {
    presenceMocks.isAvailable.mockReturnValue(true);

    expect(renderHeader(lobbyModal()).querySelector(INVITE)).not.toBeNull();
  });

  // The URL-join and accepted-Steam-invite paths render this header before
  // the first lobby_info delivers the config. That window must not show a
  // button the config may be about to forbid.
  it("is absent while the lobby's config is still unknown", () => {
    presenceMocks.isAvailable.mockReturnValue(true);
    const modal = lobbyModal();
    (modal as unknown as { gameConfig: unknown }).gameConfig = null;

    expect(renderHeader(modal).querySelector(INVITE)).toBeNull();
  });

  it("opens the Steam invite dialog when clicked", () => {
    presenceMocks.isAvailable.mockReturnValue(true);
    const button =
      renderHeader(lobbyModal()).querySelector<HTMLButtonElement>(INVITE);

    button?.click();

    expect(presenceMocks.openInviteDialog).toHaveBeenCalledOnce();
  });

  // The bridge resolves false when Steam is absent or the overlay refuses.
  // Nothing in the lobby should break on that -- the click is best-effort.
  it("survives the bridge reporting failure", async () => {
    presenceMocks.isAvailable.mockReturnValue(true);
    presenceMocks.openInviteDialog.mockResolvedValue(false);
    const button =
      renderHeader(lobbyModal()).querySelector<HTMLButtonElement>(INVITE);

    expect(() => button?.click()).not.toThrow();
    await Promise.resolve();
  });

  // Inviting Steam friends into a public FFA match encourages teaming, so
  // the button is suppressed exactly there and nowhere else.
  it("is absent in a public FFA lobby", () => {
    presenceMocks.isAvailable.mockReturnValue(true);
    const modal = lobbyModal({
      gameType: GameType.Public,
      gameMode: GameMode.FFA,
    });

    expect(renderHeader(modal).querySelector(INVITE)).toBeNull();
  });

  it("appears in a public team lobby", () => {
    presenceMocks.isAvailable.mockReturnValue(true);
    const modal = lobbyModal({
      gameType: GameType.Public,
      gameMode: GameMode.Team,
    });

    expect(renderHeader(modal).querySelector(INVITE)).not.toBeNull();
  });

  it("does not suppress the private-lobby copy button", () => {
    presenceMocks.isAvailable.mockReturnValue(true);
    const modal = lobbyModal();
    vi.spyOn(
      modal as unknown as { isPrivateLobby(): boolean },
      "isPrivateLobby",
    ).mockReturnValue(true);

    const header = renderHeader(modal);

    expect(header.querySelector("copy-button")).not.toBeNull();
    expect(header.querySelector(INVITE)).not.toBeNull();
  });
});
