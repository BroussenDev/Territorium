import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameType } from "../../src/core/game/Game";
import {
  PartialGameRecord,
  ServerChatMessage,
  ServerMessage,
} from "../../src/core/Schemas";
import {
  cid,
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

// The general chat: players' lines go over the socket, the server cleans and
// relays them to everyone in the game, and a report carries the reported
// player's last lines as evidence. Nothing of it reaches the turn log.

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

  function makeTwoPlayerGame() {
    const game = makeGame({
      config: { gameType: GameType.Public, maxPlayers: 3 },
      deps: { archive },
    });
    const alice = makeClient({ clientID: ALICE, ip: "1.1.1.1" });
    const bob = makeClient({ clientID: BOB, ip: "2.2.2.2" });
    game.joinClient(alice);
    game.joinClient(bob);
    return { game, alice, bob };
  }

  function chatSeenBy(
    game: ReturnType<typeof makeGame>,
    client: ReturnType<typeof makeClient>,
  ): ServerChatMessage[] {
    return mockWsOf(client)
      .sent((game as any).zbinCtx)
      .filter((m: ServerMessage): m is ServerChatMessage => m.type === "chat");
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

  it("masks slurs in the relayed line", async () => {
    const { game, alice, bob } = makeTwoPlayerGame();
    startGame(game);

    await mockWsOf(alice).emit({ type: "chat", text: "you nazi" });

    expect(chatSeenBy(game, bob).map((m) => m.text)).toEqual(["you ****"]);
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
