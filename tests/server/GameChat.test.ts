import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameType } from "../../src/core/game/Game";
import {
  PartialGameRecord,
  ServerChatMessage,
  ServerChatNoticeMessage,
  ServerMessage,
} from "../../src/core/Schemas";
import {
  cid,
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

// The in-game chat: players' lines go over the socket, the server cleans,
// moderates and relays them to everyone in the game (or, in a Nations game,
// to the allies a line names), and a report carries the reported player's
// last lines as evidence. Nothing of it reaches the turn log.

describe("in-game chat", () => {
  let archive: ReturnType<
    typeof vi.fn<(r: PartialGameRecord) => Promise<void>>
  >;

  beforeEach(() => {
    vi.useFakeTimers();
    archive = vi.fn(async () => {});
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const ALICE = cid("alice");
  const BOB = cid("bob");

  const CAROL = cid("carol");

  function makeTwoPlayerGame(gameVariant?: "nations") {
    const game = makeGame({
      config: { gameType: GameType.Public, maxPlayers: 3, gameVariant },
      deps: { archive },
    });
    const alice = makeClient({ clientID: ALICE, ip: "1.1.1.1" });
    const bob = makeClient({ clientID: BOB, ip: "2.2.2.2" });
    game.joinClient(alice);
    game.joinClient(bob);
    return { game, alice, bob };
  }

  function makeThreePlayerGame(gameVariant?: "nations") {
    const { game, alice, bob } = makeTwoPlayerGame(gameVariant);
    const carol = makeClient({ clientID: CAROL, ip: "3.3.3.3" });
    game.joinClient(carol);
    return { game, alice, bob, carol };
  }

  function chatSeenBy(
    game: ReturnType<typeof makeGame>,
    client: ReturnType<typeof makeClient>,
  ): ServerChatMessage[] {
    return mockWsOf(client)
      .sent((game as any).zbinCtx)
      .filter((m: ServerMessage): m is ServerChatMessage => m.type === "chat");
  }

  function noticesSeenBy(
    game: ReturnType<typeof makeGame>,
    client: ReturnType<typeof makeClient>,
  ): ServerChatNoticeMessage[] {
    return mockWsOf(client)
      .sent((game as any).zbinCtx)
      .filter(
        (m: ServerMessage): m is ServerChatNoticeMessage =>
          m.type === "chat_notice",
      );
  }

  it("relays a cleaned line to every player, stamped with its sender", async () => {
    const { game, alice, bob } = makeTwoPlayerGame();
    startGame(game);

    await mockWsOf(alice).emit({
      type: "chat",
      text: "  gg\n\nwell   played\u202e  ",
    });

    const expected = [{ type: "chat", from: ALICE, text: "gg well played" }];
    expect(chatSeenBy(game, alice)).toEqual(expected);
    expect(chatSeenBy(game, bob)).toEqual(expected);
  });

  it("blocks hate speech and tells only its sender why", async () => {
    const { game, alice, bob } = makeTwoPlayerGame();
    startGame(game);

    await mockWsOf(alice).emit({ type: "chat", text: "you nazi" });

    expect(chatSeenBy(game, bob)).toEqual([]);
    expect(chatSeenBy(game, alice)).toEqual([]);
    expect(noticesSeenBy(game, alice)).toEqual([
      { type: "chat_notice", notice: "blocked" },
    ]);
    expect(noticesSeenBy(game, bob)).toEqual([]);
  });

  it("masks insults, warns their sender, then mutes them", async () => {
    const { game, alice, bob } = makeTwoPlayerGame();
    startGame(game);

    for (const text of ["gg connard", "ta gueule", "salope"]) {
      await mockWsOf(alice).emit({ type: "chat", text });
      vi.advanceTimersByTime(4_000);
    }
    await mockWsOf(alice).emit({ type: "chat", text: "hello?" });

    expect(chatSeenBy(game, bob).map((m) => m.text)).toEqual([
      "gg *******",
      "** ******",
      "******",
    ]);
    expect(noticesSeenBy(game, alice)).toEqual([
      { type: "chat_notice", notice: "warned" },
      { type: "chat_notice", notice: "warned" },
      { type: "chat_notice", notice: "muted", seconds: 120 },
      { type: "chat_notice", notice: "muted", seconds: 116 },
    ]);
  });

  it("sends a Nations allies line only to its sender and the named allies", async () => {
    const { game, alice, bob, carol } = makeThreePlayerGame("nations");
    startGame(game);

    await mockWsOf(alice).emit({
      type: "chat",
      text: "attack east",
      to: [BOB],
    });

    const expected = [
      { type: "chat", from: ALICE, text: "attack east", allies: true },
    ];
    expect(chatSeenBy(game, alice)).toEqual(expected);
    expect(chatSeenBy(game, bob)).toEqual(expected);
    expect(chatSeenBy(game, carol)).toEqual([]);
  });

  it("drops allies lines outside Nations games", async () => {
    const { game, alice, bob, carol } = makeThreePlayerGame();
    startGame(game);

    await mockWsOf(alice).emit({ type: "chat", text: "psst", to: [BOB] });

    for (const c of [alice, bob, carol])
      expect(chatSeenBy(game, c)).toEqual([]);
  });

  it("ignores lines before the game starts and blank lines", async () => {
    const { game, alice, bob } = makeTwoPlayerGame();
    await mockWsOf(alice).emit({ type: "chat", text: "hello lobby" });
    startGame(game);
    await mockWsOf(alice).emit({ type: "chat", text: " \u0007 " });

    expect(chatSeenBy(game, bob)).toEqual([]);
  });

  it("lets spectators read but not write", async () => {
    const { game, alice } = makeTwoPlayerGame();
    const watcher = makeClient({ clientID: cid("watcher"), spectator: true });
    game.joinClient(watcher);
    startGame(game);

    await mockWsOf(watcher).emit({ type: "chat", text: "hi from the stands" });
    await mockWsOf(alice).emit({ type: "chat", text: "hi" });

    expect(chatSeenBy(game, watcher).map((m) => m.text)).toEqual(["hi"]);
    expect(chatSeenBy(game, alice).map((m) => m.text)).toEqual(["hi"]);
  });

  it("drops lines past the burst limit", async () => {
    const { game, alice, bob } = makeTwoPlayerGame();
    startGame(game);

    for (let i = 1; i <= 6; i++) {
      await mockWsOf(alice).emit({ type: "chat", text: `line ${i}` });
    }
    expect(chatSeenBy(game, bob)).toHaveLength(4);

    vi.advanceTimersByTime(10_000);
    await mockWsOf(alice).emit({ type: "chat", text: "later" });
    const seen = chatSeenBy(game, bob);
    expect(seen[seen.length - 1].text).toBe("later");
  });

  it("attaches the reported player's last lines, as typed, to the report", async () => {
    const { game, alice, bob } = makeTwoPlayerGame();
    startGame(game);

    for (let i = 1; i <= 12; i++) {
      await mockWsOf(bob).emit({ type: "chat", text: `nazi ${i}` });
      // Stay under the burst limit.
      vi.advanceTimersByTime(4_000);
    }
    await mockWsOf(alice).emit({
      type: "report",
      reported: BOB,
      reason: "offensive_chat",
    });
    // Alice never chatted, so a report against her carries no lines.
    await mockWsOf(bob).emit({
      type: "report",
      reported: ALICE,
      reason: "griefing",
    });

    for (const c of [alice, bob]) {
      await mockWsOf(c).emit({
        type: "winner",
        winner: ["player", ALICE],
        allPlayersStats: {},
      });
    }
    const record = archive.mock.calls[0][0];
    expect(record.info.reports).toEqual([
      {
        reportedBy: ALICE,
        reported: BOB,
        reason: "offensive_chat",
        messages: Array.from({ length: 10 }, (_, i) => `nazi ${i + 3}`),
      },
      { reportedBy: BOB, reported: ALICE, reason: "griefing" },
    ]);
    expect(JSON.stringify(record.turns)).not.toContain("nazi");
  });
});
