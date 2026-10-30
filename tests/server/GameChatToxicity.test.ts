import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameType } from "../../src/core/game/Game";
import {
  ServerChatMessage,
  ServerChatNoticeMessage,
  ServerMessage,
} from "../../src/core/Schemas";
import { ChatModelData, ChatToxicity } from "../../src/server/ChatToxicity";
import {
  cid,
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

// The learned chat filter inside GameServer.handleChat: a line the word lists
// pass is scored; a high score is held back with an ordinary strike, a middle
// one goes through and is sent for review, and a missing model changes nothing.

const MODEL: ChatModelData = {
  version: "v1",
  minLangSamples: 50,
  thresholds: { block: 0.9, queueMin: 0.6, blockActive: true },
  langs: { "*": { samples: 400, weights: { "w:grr": 10, "w:hmm": 1 } } },
};

describe("chat learned filter in a game", () => {
  const ALICE = cid("alice");
  const BOB = cid("bob");
  let fetchImpl: ReturnType<typeof vi.fn>;
  let toxicity: ChatToxicity;

  beforeEach(() => {
    vi.useFakeTimers();
    fetchImpl = vi.fn().mockResolvedValue(new Response("{}"));
    toxicity = new ChatToxicity({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: () => "https://api.test",
      apiKey: () => "key",
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function setup() {
    const game = makeGame({
      config: { gameType: GameType.Public, maxPlayers: 2 },
      deps: { archive: vi.fn(async () => {}), chatToxicity: toxicity },
    });
    const alice = makeClient({ clientID: ALICE, ip: "1.1.1.1" });
    const bob = makeClient({ clientID: BOB, ip: "2.2.2.2" });
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

  it("holds back a high score, tells its sender, and posts a blocked sample", async () => {
    toxicity.setModel(MODEL);
    const { game, alice, bob } = setup();

    await mockWsOf(alice).emit({ type: "chat", text: "you grr" });

    expect(chats(game, bob)).toEqual([]);
    expect(chats(game, alice)).toEqual([]);
    expect(notices(game, alice)).toEqual([
      { type: "chat_notice", notice: "blocked" },
    ]);
    expect(notices(game, bob)).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toMatchObject({
      text: "you grr",
      kind: "blocked",
      senderPersistentID: expect.any(String),
    });
  });

  it("counts ordinary strikes up to a mute, never the severe tier", async () => {
    toxicity.setModel(MODEL);
    const { game, alice } = setup();

    for (const text of ["grr one", "grr two", "grr three"]) {
      await mockWsOf(alice).emit({ type: "chat", text });
      vi.advanceTimersByTime(4_000);
    }
    expect(notices(game, alice).map((n) => n.notice)).toEqual([
      "blocked",
      "blocked",
      "muted",
    ]);
  });

  it("lets a middle score through and posts an uncertain sample", async () => {
    toxicity.setModel(MODEL);
    const { game, alice, bob } = setup();

    await mockWsOf(alice).emit({ type: "chat", text: "hmm ok" });

    expect(chats(game, bob).map((m) => m.text)).toEqual(["hmm ok"]);
    expect(notices(game, alice)).toEqual([]);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).kind).toBe("uncertain");
  });

  it("passes a clean line without any call", async () => {
    toxicity.setModel(MODEL);
    const { game, alice, bob } = setup();

    await mockWsOf(alice).emit({ type: "chat", text: "good game" });

    expect(chats(game, bob).map((m) => m.text)).toEqual(["good game"]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails open when the model is missing or the scorer throws", async () => {
    const { game, alice, bob } = setup();
    await mockWsOf(alice).emit({ type: "chat", text: "you grr" });
    expect(chats(game, bob).map((m) => m.text)).toEqual(["you grr"]);

    vi.spyOn(toxicity, "decide").mockImplementation(() => {
      throw new Error("boom");
    });
    vi.advanceTimersByTime(4_000);
    await mockWsOf(alice).emit({ type: "chat", text: "still fine" });
    expect(chats(game, bob).map((m) => m.text)).toEqual([
      "you grr",
      "still fine",
    ]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
