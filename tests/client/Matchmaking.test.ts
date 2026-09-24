import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserMeResponse } from "../../src/core/ApiSchemas";

const apiMocks = vi.hoisted(() => ({
  getUserMe: vi.fn(),
  fetchRankedStatus: vi.fn(),
  pollRankedQueue: vi.fn(),
  leaveRankedQueue: vi.fn(),
}));

// The two ClientEnv reads the version check below depends on: this bundle's
// commit, and the commit the matched game's server runs (the API's list).
const envMocks = vi.hoisted(() => ({
  gitCommit: vi.fn(() => "bfd5563a11111111111111111111111111111111"),
  gameVersion: vi.fn((_gameID: string): string | undefined => undefined),
}));

// The identity predicate is deliberately not mocked: the gate is exercised
// for real below.
vi.mock("../../src/client/Api", () => apiMocks);

vi.mock("../../src/client/ClientEnv", () => ({
  ClientEnv: {
    instanceId: vi.fn(() => "test-instance"),
    workerPath: vi.fn(() => "w0"),
    gitCommit: envMocks.gitCommit,
    gameVersion: envMocks.gameVersion,
    siteHost: vi.fn(() => "openfront.test"),
    gamePath: vi.fn((gameID: string) => `/w0/game/${gameID}`),
    gameHttpBase: vi.fn(() => "https://falk2-a.openfront.io"),
    gameWorkerPath: vi.fn(() => "w0"),
  },
}));

// Only the network half is stubbed. redirectToGameVersion is the real
// decision -- it is the thing under test below.
vi.mock("../../src/client/ServerList", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/client/ServerList")>()),
  ensureServerList: vi.fn(async () => "api" as const),
}));

vi.mock("../../src/client/Utils", () => ({
  translateText: vi.fn((key: string) => key),
}));

import { MatchmakingModal } from "../../src/client/Matchmaking";

const STEAM_ONLY_USER = {
  steam: {
    steamId: "76561198000000000",
    personaName: "Player",
    avatarUrl: null,
  },
} as UserMeResponse["user"];

function userMe(
  user: UserMeResponse["user"] = {
    email: "player@example.com",
  } as UserMeResponse["user"],
): UserMeResponse {
  return {
    user,
    player: {
      publicId: "player-id",
      adfree: false,
      unlimitedRanked: false,
      canCreatePublicLobbies: false,
      achievements: { singleplayerMap: [], player: [] },
      clans: [],
      friends: [],
      subscription: null,
    },
  };
}

const waiting = (count: number, startsIn: number | null = null) => ({
  count,
  min: 8,
  max: 16,
  lowMin: 4,
  startsIn,
  lowIn: 180,
});

let showPage: Mock<(page: string) => void>;
let showMessage: Mock<(event: Event) => void>;

beforeEach(() => {
  vi.useFakeTimers();
  apiMocks.getUserMe.mockReset().mockResolvedValue(userMe());
  apiMocks.fetchRankedStatus.mockReset().mockResolvedValue(false);
  apiMocks.pollRankedQueue.mockReset().mockResolvedValue(waiting(1));
  apiMocks.leaveRankedQueue.mockReset().mockResolvedValue(undefined);
  showPage = vi.fn<(page: string) => void>();
  (window as unknown as { showPage: unknown }).showPage = showPage;
  showMessage = vi.fn<(event: Event) => void>();
  window.addEventListener("show-message", showMessage);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  window.removeEventListener("show-message", showMessage);
  delete (window as unknown as { showPage?: unknown }).showPage;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// Opens the modal and lets the join delay pass, so the first poll is in.
async function openQueued() {
  const modal = new MatchmakingModal();
  modal.open();
  await vi.advanceTimersByTimeAsync(1500);
  return modal;
}

describe("MatchmakingModal identity gate", () => {
  it("admits a Steam-only account to the ranked queue", async () => {
    apiMocks.getUserMe.mockResolvedValue(userMe(STEAM_ONLY_USER));
    const modal = await openQueued();

    expect(apiMocks.pollRankedQueue).toHaveBeenCalledOnce();
    expect(modal.isOpen()).toBe(true);
    expect(showPage).not.toHaveBeenCalled();
    expect(showMessage).not.toHaveBeenCalled();
  });

  it("rejects a guest without polling the queue", async () => {
    apiMocks.getUserMe.mockResolvedValue(false);
    const modal = await openQueued();

    expect(showPage).toHaveBeenCalledWith("page-account");
    expect(showMessage).toHaveBeenCalledOnce();
    expect(apiMocks.pollRankedQueue).not.toHaveBeenCalled();
    expect(modal.isOpen()).toBe(false);
  });

  it("rejects a session with no linked identity at all", async () => {
    apiMocks.getUserMe.mockResolvedValue(userMe({} as UserMeResponse["user"]));
    const modal = await openQueued();

    expect(showPage).toHaveBeenCalledWith("page-account");
    expect(apiMocks.pollRankedQueue).not.toHaveBeenCalled();
    expect(modal.isOpen()).toBe(false);
  });

  it("sends the player to log in when the API refuses the queue", async () => {
    apiMocks.pollRankedQueue.mockResolvedValue("login_required");
    const modal = await openQueued();

    expect(showPage).toHaveBeenCalledWith("page-account");
    expect(modal.isOpen()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(apiMocks.pollRankedQueue).toHaveBeenCalledOnce();
  });
});

describe("MatchmakingModal queue polling", () => {
  it("never queues a player who backs out during the join delay", async () => {
    const modal = new MatchmakingModal();
    modal.open();
    await vi.advanceTimersByTimeAsync(500);
    modal.close();
    await vi.advanceTimersByTimeAsync(10_000);

    expect(apiMocks.pollRankedQueue).not.toHaveBeenCalled();
    expect(apiMocks.leaveRankedQueue).not.toHaveBeenCalled();
  });

  it("keeps polling well inside the API's 10 s silence limit", async () => {
    await openQueued();
    await vi.advanceTimersByTimeAsync(7_500);

    expect(apiMocks.pollRankedQueue).toHaveBeenCalledTimes(4);
  });

  it("keeps polling through a failed request", async () => {
    apiMocks.pollRankedQueue
      .mockResolvedValueOnce(false)
      .mockResolvedValue(waiting(3));
    await openQueued();
    await vi.advanceTimersByTimeAsync(2_500);

    expect(apiMocks.pollRankedQueue).toHaveBeenCalledTimes(2);
  });

  it("shows the queue size and the start countdown", async () => {
    apiMocks.pollRankedQueue.mockResolvedValue(waiting(9, 20));
    const modal = new MatchmakingModal();
    document.body.appendChild(modal);
    modal.open();
    await vi.advanceTimersByTimeAsync(1600);

    expect(modal.textContent).toContain("9");
    expect(modal.textContent).toContain("ranked.starts_in");
    modal.close();
    modal.remove();
  });

  it("leaves the queue when closed while searching", async () => {
    const modal = await openQueued();
    modal.close();

    expect(apiMocks.leaveRankedQueue).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(apiMocks.pollRankedQueue).toHaveBeenCalledOnce();
  });

  it("ignores a poll answered after the modal closed", async () => {
    let answer!: (value: unknown) => void;
    apiMocks.pollRankedQueue.mockReturnValueOnce(
      new Promise((resolve) => (answer = resolve)),
    );
    const modal = await openQueued();
    modal.close();
    answer({ gameId: "cAbCd12345" });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(apiMocks.pollRankedQueue).toHaveBeenCalledOnce();
  });

  it("requeues only while the modal is open", async () => {
    const modal = await openQueued();
    expect(modal.requeue()).toBe(true);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(apiMocks.pollRankedQueue).toHaveBeenCalledTimes(2);

    modal.close();
    expect(modal.requeue()).toBe(false);
  });
});

// A match can land on a server running another build, and being bounced at
// join time costs a ranked game its start deadline (OPE-471).
describe("MatchmakingModal opens the match at its server's version", () => {
  const OWN = "bfd5563a11111111111111111111111111111111";
  const OLD = "5ccc50a722222222222222222222222222222222";
  const SHORT_OLD = "5ccc50a";
  const GAME_ID = "cAbCd12345";

  const realLocation = window.location;
  let fetchMock: ReturnType<typeof vi.fn>;

  function stubLocation(host: string, pathname = "/") {
    const loc = {
      protocol: "https:",
      host,
      hostname: host,
      pathname,
      search: "",
      href: `https://${host}${pathname}`,
    };
    Object.defineProperty(window, "location", {
      value: loc,
      writable: true,
      configurable: true,
    });
    return loc;
  }

  // Drives a modal from the queue to just after checkGame has seen the
  // match's game exist.
  async function matchAndCheck() {
    apiMocks.pollRankedQueue.mockResolvedValue({ gameId: GAME_ID });
    const joined = vi.fn();
    const modal = await openQueued();
    modal.addEventListener("join-lobby", joined);
    await vi.advanceTimersByTimeAsync(1000);
    return { modal, joined };
  }

  beforeEach(() => {
    envMocks.gitCommit.mockReturnValue(OWN);
    envMocks.gameVersion.mockReturnValue(undefined);
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ exists: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    delete (window as unknown as { openfrontDesktop?: unknown })
      .openfrontDesktop;
    stubLocation("openfront.io");
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      value: realLocation,
      writable: true,
      configurable: true,
    });
  });

  it("joins directly when the match landed on this build", async () => {
    envMocks.gameVersion.mockReturnValue(OWN);
    const loc = stubLocation("openfront.io");

    const { modal, joined } = await matchAndCheck();

    expect(joined).toHaveBeenCalledOnce();
    expect((joined.mock.calls[0][0] as CustomEvent).detail).toMatchObject({
      gameID: GAME_ID,
      source: "matchmaking",
    });
    expect(loc.href).toBe("https://openfront.io/");
    // Matched players are no longer queued: closing must not leave.
    modal.close();
    expect(apiMocks.leaveRankedQueue).not.toHaveBeenCalled();
  });

  it("goes to the game's version instead of joining on another build", async () => {
    envMocks.gameVersion.mockReturnValue(OLD);
    const loc = stubLocation("openfront.io");

    const { joined } = await matchAndCheck();

    expect(loc.href).toBe(`/v/${SHORT_OLD}/game/${GAME_ID}`);
    expect(joined).not.toHaveBeenCalled();
  });

  it("stops polling once it has navigated", async () => {
    envMocks.gameVersion.mockReturnValue(OLD);

    await matchAndCheck();
    expect(fetchMock).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("joins when no version is known for the game", async () => {
    envMocks.gameVersion.mockReturnValue(undefined);
    const loc = stubLocation("openfront.io");

    const { joined } = await matchAndCheck();

    expect(joined).toHaveBeenCalledOnce();
    expect(loc.href).toBe("https://openfront.io/");
  });
});
