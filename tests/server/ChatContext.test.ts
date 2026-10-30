import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GameType } from "../../src/core/game/Game";
import { PlayerReportSchema } from "../../src/core/Schemas";
import {
  CHAT_CONTEXT_BEFORE,
  CHAT_CONTEXT_MAX_AGE_MS,
  CHAT_CONTEXT_MAX_LINES,
  CHAT_CONTEXT_MAX_SENT,
  ChatContextBuffer,
} from "../../src/server/ChatContext";
import { ChatModelData, ChatToxicity } from "../../src/server/ChatToxicity";
import {
  cid,
  makeClient,
  makeGame,
  mockWsOf,
  startGame,
} from "../util/GameServerHarness";

// Mocked so no incident leaves the process: the calls are what is checked.
const reportTgsIncident = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../src/server/TgsApi", async (orig) => ({
  ...(await orig<typeof import("../../src/server/TgsApi")>()),
  reportTgsIncident,
}));

describe("ChatContextBuffer", () => {
  let now = 1_000_000;
  const line = (n: number, extra = {}) => ({
    id: "a",
    name: "Alice",
    ch: "all" as const,
    text: `line ${n}`,
    ...extra,
  });

  it("keeps at most MAX_LINES lines", () => {
    const buf = new ChatContextBuffer(() => now);
    for (let i = 0; i < CHAT_CONTEXT_MAX_LINES + 20; i++) buf.record(line(i));
    expect(buf.size()).toBe(CHAT_CONTEXT_MAX_LINES);
  });

  it("drops lines older than the max age", () => {
    const buf = new ChatContextBuffer(() => now);
    buf.record(line(0));
    now += CHAT_CONTEXT_MAX_AGE_MS + 1;
    buf.record(line(1));
    expect(buf.size()).toBe(1);
  });

  it("returns the lines before, the marked line, and those after, capped", () => {
    now = 5_000_000;
    const buf = new ChatContextBuffer(() => now);
    const entries = [];
    for (let i = 0; i < 30; i++) entries.push(buf.record(line(i)));
    const ctx = buf.around(entries[25]);
    const texts = ctx.lines.map((l) => l.text);
    expect(texts[0]).toBe(`line ${25 - CHAT_CONTEXT_BEFORE}`);
    expect(ctx.lines.filter((l) => l.hit)).toHaveLength(1);
    expect(ctx.lines.find((l) => l.hit)?.text).toBe("line 25");
    expect(texts[texts.length - 1]).toBe("line 29");
    expect(ctx.lines.length).toBeLessThanOrEqual(CHAT_CONTEXT_MAX_SENT);
  });

  it("keeps the channel, the readers and the original text of a masked line", () => {
    now = 5_000_000;
    const buf = new ChatContextBuffer(() => now);
    const e = buf.record(
      line(1, { ch: "team", to: ["Bob"], text: "x".repeat(500) }),
    );
    e.act = "masked";
    const l = buf.around(e).lines[0];
    expect(l).toMatchObject({ ch: "team", to: ["Bob"], act: "masked" });
    expect(l.text).toHaveLength(300);
  });

  it("finds the latest line of a player", () => {
    const buf = new ChatContextBuffer(() => now);
    buf.record(line(1));
    buf.record(line(2, { id: "b" }));
    const last = buf.record(line(3));
    expect(buf.lastBy("a")).toBe(last);
    expect(buf.lastBy("zzz")).toBeUndefined();
  });
});

const MODEL: ChatModelData = {
  version: "v1",
  minLangSamples: 50,
  thresholds: { block: 0.9, queueMin: 0.6, blockActive: true },
  langs: { "*": { samples: 400, weights: { "w:grr": 10, "w:hmm": 1 } } },
};

describe("chat context in a game", () => {
  const ALICE = cid("alice");
  const BOB = cid("bob");
  let fetchImpl: ReturnType<typeof vi.fn>;
  let toxicity: ChatToxicity;

  beforeEach(() => {
    vi.useFakeTimers();
    reportTgsIncident.mockClear();
    fetchImpl = vi.fn().mockResolvedValue(new Response("{}"));
    toxicity = new ChatToxicity({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: () => "https://api.test",
      apiKey: () => "key",
    });
    toxicity.setModel(MODEL);
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

  it("attaches the conversation to a blocked sample", async () => {
    const { alice, bob } = setup();
    await mockWsOf(bob).emit({ type: "chat", text: "salut" });
    await mockWsOf(alice).emit({ type: "chat", text: "you grr" });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.context.lines.map((l: any) => l.text)).toEqual([
      "salut",
      "you grr",
    ]);
    expect(body.context.lines[1]).toMatchObject({ hit: true, act: "blocked" });
    expect(body.context.lines[0]).toMatchObject({ ch: "all" });
  });

  it("flags an uncertain line in its context", async () => {
    const { alice } = setup();
    await mockWsOf(alice).emit({ type: "chat", text: "hmm ok" });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.context.lines[0]).toMatchObject({ act: "flagged", hit: true });
  });

  it("attaches the lines before a severe incident, then completes it", async () => {
    const { alice, bob } = setup();
    await mockWsOf(bob).emit({ type: "chat", text: "je t'attaque" });
    await mockWsOf(alice).emit({ type: "chat", text: "je vais te tuer" });

    expect(reportTgsIncident).toHaveBeenCalledTimes(1);
    const first = (reportTgsIncident.mock.calls[0] as any[])[4];
    expect(first.lines.map((l: any) => l.text)).toEqual([
      "je t'attaque",
      "je vais te tuer",
    ]);
    expect(first.lines[1]).toMatchObject({ hit: true, act: "removed" });

    // Bob answers within the minute: the follow-up carries it.
    await mockWsOf(bob).emit({ type: "chat", text: "calme toi" });
    vi.advanceTimersByTime(30_000);
    expect(reportTgsIncident).toHaveBeenCalledTimes(2);
    const second = (reportTgsIncident.mock.calls[1] as any[])[4];
    expect(second.lines.map((l: any) => l.text)).toEqual([
      "je t'attaque",
      "je vais te tuer",
      "calme toi",
    ]);
  });

  it("keeps the readers of a team line", async () => {
    const game = makeGame({
      config: {
        gameType: GameType.Public,
        maxPlayers: 2,
        gameVariant: "nations",
      } as any,
      deps: { archive: vi.fn(async () => {}), chatToxicity: toxicity },
    });
    const alice = makeClient({ clientID: ALICE, ip: "1.1.1.1" });
    const bob = makeClient({ clientID: BOB, ip: "2.2.2.2" });
    game.joinClient(alice);
    game.joinClient(bob);
    startGame(game);
    await mockWsOf(alice).emit({ type: "chat", text: "hmm ok", to: [BOB] });
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.context.lines[0]).toMatchObject({
      ch: "team",
      to: [bob.username],
    });
  });

  it("the report schema accepts a context", () => {
    const ok = PlayerReportSchema.safeParse({
      reportedBy: ALICE,
      reported: BOB,
      reason: "offensive_chat",
      context: { lines: [{ t: 1, id: "a", name: "A", ch: "all", text: "x" }] },
    });
    expect(ok.success).toBe(true);
  });
});
