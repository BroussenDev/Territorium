import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameType } from "../../src/core/game/Game";
import {
  ServerChatMessage,
  ServerChatNoticeMessage,
  ServerMessage,
} from "../../src/core/Schemas";
import {
  ACCOUNT_MUTE_TTL_MS,
  AccountChatMutes,
} from "../../src/server/AccountChatMute";
import {
  cid,
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

// A staff chat mute of the account, learned from the API: the cache around
// it, and the game dropping the muted player's lines.

const FOREVER = 253402300799000;

describe("AccountChatMutes cache", () => {
  let clock: number;
  let fetchImpl: ReturnType<typeof vi.fn>;
  let answer: { chatMutedUntil: number | null };
  let mutes: AccountChatMutes;

  beforeEach(() => {
    clock = 1_000_000;
    answer = { chatMutedUntil: null };
    fetchImpl = vi.fn(async () => new Response(JSON.stringify(answer)));
    mutes = new AccountChatMutes({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: () => "https://api.test",
      apiKey: () => "key",
      now: () => clock,
      enabled: () => true,
    });
  });

  it("asks the API with the game key and answers from the cache for a minute", async () => {
    answer = { chatMutedUntil: clock + 3_600_000 };
    expect(await mutes.refresh("pid1")).toBe(clock + 3_600_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(
      "https://api.test/tgs/player-status/pid1",
    );
    expect(fetchImpl.mock.calls[0][1].headers["x-api-key"]).toBe("key");

    clock += ACCOUNT_MUTE_TTL_MS - 1;
    expect(mutes.mutedUntil("pid1")).toBe(1_000_000 + 3_600_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refreshes in the background once the entry is a minute old", async () => {
    answer = { chatMutedUntil: clock + 3_600_000 };
    await mutes.refresh("pid1");
    clock += ACCOUNT_MUTE_TTL_MS;
    answer = { chatMutedUntil: null };
    // Still muted by the old answer, while the new one is on its way.
    expect(mutes.mutedUntil("pid1")).not.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(mutes.mutedUntil("pid1")).toBeNull());
  });

  it("ends the mute at its date even without a refresh", async () => {
    answer = { chatMutedUntil: clock + 30_000 };
    await mutes.refresh("pid1");
    expect(mutes.mutedUntil("pid1")).not.toBeNull();
    clock += 30_001;
    expect(mutes.mutedUntil("pid1")).toBeNull();
  });

  it("fails open and keeps the last answer when the API is down", async () => {
    expect(mutes.mutedUntil("pid2")).toBeNull();
    fetchImpl.mockRejectedValue(new Error("down"));
    await mutes.refresh("pid2");
    expect(mutes.mutedUntil("pid2")).toBeNull();
    answer = { chatMutedUntil: clock + 5_000_000 };
    fetchImpl.mockImplementation(
      async () => new Response(JSON.stringify(answer)),
    );
    await mutes.refresh("pid3");
    fetchImpl.mockRejectedValue(new Error("down"));
    clock += ACCOUNT_MUTE_TTL_MS;
    await mutes.refresh("pid3");
    expect(mutes.mutedUntil("pid3")).toBe(1_000_000 + 5_000_000);
  });

  it("recognises the permanent sentinel", () => {
    expect(mutes.isPermanent(FOREVER)).toBe(true);
    expect(mutes.isPermanent(clock + 86_400_000)).toBe(false);
  });
});

describe("a staff-muted account in a game", () => {
  const ALICE = cid("alice");
  const BOB = cid("bob");
  let clock: number;
  let answers: Record<string, number | null>;
  let mutes: AccountChatMutes;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "setInterval"] });
    clock = Date.now();
    answers = {};
    mutes = new AccountChatMutes({
      fetchImpl: (async (url: string) => {
        const pid = decodeURIComponent(url.split("/").pop() ?? "");
        return new Response(
          JSON.stringify({ chatMutedUntil: answers[pid] ?? null }),
        );
      }) as unknown as typeof fetch,
      baseUrl: () => "https://api.test",
      apiKey: () => "key",
      now: () => clock,
      enabled: () => true,
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function setup() {
    const game = makeGame({
      config: { gameType: GameType.Public, maxPlayers: 2 },
      deps: { archive: vi.fn(async () => {}), accountMutes: mutes },
    });
    const alice = makeClient({
      clientID: ALICE,
      persistentID: "alice-pid",
      ip: "1.1.1.1",
    });
    const bob = makeClient({
      clientID: BOB,
      persistentID: "bob-pid",
      ip: "2.2.2.2",
    });
    game.joinClient(alice);
    game.joinClient(bob);
    startGame(game);
    return { game, alice, bob };
  }
  const sent = (game: any, c: any): ServerMessage[] =>
    mockWsOf(c).sent(game.zbinCtx);
  const chats = (game: any, c: any) =>
    sent(game, c).filter((m): m is ServerChatMessage => m.type === "chat");
  const notices = (game: any, c: any) =>
    sent(game, c).filter(
      (m): m is ServerChatNoticeMessage => m.type === "chat_notice",
    );
  // The join-time lookup has landed (it is a real fetch answer).
  const settle = async () => {
    await mutes.refresh("alice-pid");
    await mutes.refresh("bob-pid");
  };

  it("drops the muted player's line, tells them how long, and relays nobody's", async () => {
    answers["alice-pid"] = clock + 3_600_000;
    const { game, alice, bob } = setup();
    await settle();

    await mockWsOf(alice).emit({ type: "chat", text: "hello" });

    expect(chats(game, bob)).toEqual([]);
    expect(chats(game, alice)).toEqual([]);
    expect(notices(game, alice)).toEqual([
      { type: "chat_notice", notice: "account_muted", seconds: 3600 },
    ]);
    expect(notices(game, bob)).toEqual([]);
    // Each new attempt is answered again.
    await mockWsOf(alice).emit({ type: "chat", text: "again" });
    expect(notices(game, alice)).toHaveLength(2);
  });

  it("tells a muted player once at their ping, and a permanent mute has no time", async () => {
    answers["alice-pid"] = 253402300799000;
    const { game, alice } = setup();
    await settle();

    await mockWsOf(alice).emit({ type: "ping" });
    await mockWsOf(alice).emit({ type: "ping" });

    expect(notices(game, alice)).toEqual([
      { type: "chat_notice", notice: "account_muted" },
    ]);
  });

  it("lets an unmuted player write, and the muted one again once the mute ends", async () => {
    answers["alice-pid"] = clock + 60_000;
    const { game, alice, bob } = setup();
    await settle();

    await mockWsOf(bob).emit({ type: "chat", text: "hi all" });
    expect(chats(game, alice).map((m) => m.text)).toEqual(["hi all"]);
    expect(notices(game, bob)).toEqual([]);

    await mockWsOf(alice).emit({ type: "chat", text: "muted line" });
    expect(chats(game, bob).map((m) => m.text)).toEqual(["hi all"]);

    clock += 61_000;
    await vi.advanceTimersByTimeAsync(4_000);
    await mockWsOf(alice).emit({ type: "chat", text: "back again" });
    expect(chats(game, bob).map((m) => m.text)).toEqual([
      "hi all",
      "back again",
    ]);
  });
});
