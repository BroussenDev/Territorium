import { colord } from "colord";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../src/client/hud/layers/GameChat";
import type { GameChat } from "../../../../src/client/hud/layers/GameChat";
import type { PlayerReportModal } from "../../../../src/client/hud/layers/PlayerReportModal";
import {
  ChatMessageEvent,
  ChatNoticeEvent,
  PlayerReportedEvent,
  SendChatMessageEvent,
} from "../../../../src/client/Transport";
import { EventBus } from "../../../../src/core/EventBus";
import { GameType, PlayerType } from "../../../../src/core/game/Game";

const report = vi.hoisted(() => ({
  canReportChat: vi.fn(async () => true),
  chatReportBody: vi.fn((gameID: string, text: string, sender?: string) => ({
    gameID,
    text,
    senderClientID: sender,
    lang: "fr",
  })),
  sendChatReport: vi.fn(async (_body: unknown) => "ok" as string),
}));
vi.mock("../../../../src/client/ChatReport", () => report);

vi.mock("../../../../src/client/Utils", () => ({
  translateText: vi.fn(
    (key: string, params: Record<string, string | number> = {}) =>
      Object.keys(params).length === 0
        ? key
        : `${key}(${Object.values(params).join(",")})`,
  ),
}));

const ALICE = "aliceAAA";
const BOB = "bobBBBBB";
const CAROL = "carolCCC";

interface FakePlayer {
  disconnected: boolean;
  allyIDs: string[];
  clientID(): string;
  displayName(): string;
  territoryColor(): ReturnType<typeof colord>;
  type(): PlayerType;
  isDisconnected(): boolean;
  isAlliedWith(other: FakePlayer): boolean;
  allies(): FakePlayer[];
}

function player(clientID: string, name: string, color = "#224488") {
  const p: FakePlayer = {
    disconnected: false,
    allyIDs: [] as string[],
    clientID: () => clientID,
    displayName: () => name,
    territoryColor: () => colord(color),
    type: () => PlayerType.Human,
    isDisconnected: () => p.disconnected,
    isAlliedWith: (other: FakePlayer) => p.allyIDs.includes(other.clientID()),
    allies: (): FakePlayer[] => [],
  };
  return p;
}

describe("GameChat", () => {
  let chat: GameChat;
  let bus: EventBus;
  let sent: { text: string; to?: string[] }[];
  let players: Record<string, FakePlayer>;
  let opts: {
    gameType: GameType;
    replay: boolean;
    spectator: boolean;
    enabled: boolean;
    nations: boolean;
  };

  beforeEach(() => {
    report.canReportChat.mockResolvedValue(true);
    report.sendChatReport.mockClear();
    report.sendChatReport.mockResolvedValue("ok");
    opts = {
      gameType: GameType.Public,
      replay: false,
      spectator: false,
      enabled: true,
      nations: false,
    };
    bus = new EventBus();
    sent = [];
    bus.on(SendChatMessageEvent, (e) => sent.push({ text: e.text, to: e.to }));
    players = {
      [ALICE]: player(ALICE, "Alice"),
      [BOB]: player(BOB, "Bob", "#000022"),
      [CAROL]: player(CAROL, "Carol"),
    };
    players[ALICE].allies = () =>
      players[ALICE].allyIDs.map((id) => players[id]);
    chat = document.createElement("game-chat") as GameChat;
    chat.eventBus = bus;
    chat.userSettings = { gameChat: () => opts.enabled } as any;
    chat.game = {
      config: () => ({
        gameConfig: () => ({ gameType: opts.gameType }),
        isReplay: () => opts.replay,
        isNationsMode: () => opts.nations,
      }),
      myClientID: () => ALICE,
      myPlayer: () => (opts.spectator ? null : players[ALICE]),
      players: () => Object.values(players),
      playerByClientID: (id: string) => players[id] ?? null,
      gameOver: () => false,
      gameID: () => "game0001",
    } as any;
    chat.init();
    document.body.appendChild(chat);
  });

  afterEach(() => {
    chat.remove();
  });

  const receive = async (from: string, text: string, allies = false) => {
    bus.emit(new ChatMessageEvent(from, text, allies));
    await chat.updateComplete;
  };
  const q = (sel: string) => chat.querySelector(sel) as HTMLElement | null;
  const click = async (sel: string) => {
    q(sel)!.click();
    await chat.updateComplete;
  };
  const open = () => click("[data-chat-toggle]");
  const type = async (text: string) => {
    const input = q("[data-chat-input]") as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new InputEvent("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await chat.updateComplete;
  };
  const shown = () =>
    [...chat.querySelectorAll("[data-chat-lines] li")].map((l) =>
      l.textContent?.replace(/\s+/g, " ").trim(),
    );

  it("shows its button once the game starts, though the page drew it before", async () => {
    // In the page, the element is connected long before the game exists.
    const early = document.createElement("game-chat") as GameChat;
    document.body.appendChild(early);
    await early.updateComplete;
    expect(early.querySelector("[data-chat-toggle]")).toBeNull();

    early.eventBus = bus;
    early.userSettings = chat.userSettings;
    early.game = chat.game;
    early.init();
    await early.updateComplete;
    expect(early.querySelector("[data-chat-toggle]")).not.toBeNull();
    early.remove();
  });

  it("counts unread lines from others while closed, then shows them", async () => {
    await chat.updateComplete;
    await receive(BOB, "hello");
    await receive(ALICE, "hi bob");
    expect(q("[data-chat-unread]")?.textContent).toBe("1");

    await open();
    expect(shown()).toEqual(["Bob: hello", "game_chat.you: hi bob"]);
    expect(q("[data-chat-unread]")).toBeNull();
  });

  it("writes names in readable colors, and its own in a fixed one", async () => {
    await chat.updateComplete;
    await open();
    await receive(BOB, "hello");
    await receive(ALICE, "hi");
    const [bob, you] = [
      ...chat.querySelectorAll("[data-chat-line] .font-bold"),
    ];
    expect(
      colord((bob as HTMLElement).style.color).brightness(),
    ).toBeGreaterThan(0.6);
    expect(colord((you as HTMLElement).style.color).toHex()).toBe("#fcd34d");
  });

  it("sends typed lines on Enter and holds back a fifth one in ten seconds", async () => {
    await chat.updateComplete;
    await open();
    for (const text of ["one", "  two  ", "three", "four", "five"]) {
      await type(text);
    }
    expect(sent.map((s) => s.text)).toEqual(["one", "two", "three", "four"]);
    expect(sent.every((s) => s.to === undefined)).toBe(true);
    expect(q("[data-chat-slow]")).not.toBeNull();
    // The held-back line stays in the box to send later.
    expect((q("[data-chat-input]") as HTMLInputElement).value).toBe("five");
  });

  it("puts a picked emoji where the cursor is", async () => {
    await chat.updateComplete;
    await open();
    const input = q("[data-chat-input]") as HTMLInputElement;
    input.value = "gg wp";
    input.dispatchEvent(new InputEvent("input"));
    input.setSelectionRange(2, 2);
    await click("[data-chat-emoji-toggle]");
    const emoji = q("[data-chat-emoji]")!;
    emoji.click();
    await chat.updateComplete;
    expect(input.value).toBe(`gg${emoji.textContent!.trim()} wp`);
  });

  it("offers to ignore or report a player by clicking their line", async () => {
    await chat.updateComplete;
    await open();
    await receive(ALICE, "hi");
    // Own lines have no menu.
    expect(chat.querySelectorAll("[data-chat-line-button]")).toHaveLength(0);
    await receive(BOB, "spam");
    expect(q("[data-chat-mute]")).toBeNull();

    await click("[data-chat-line-button]");
    expect(q("[data-chat-mute]")?.textContent).toContain(
      "game_chat.ignore_player(Bob)",
    );
    expect(q("[data-chat-report]")).not.toBeNull();
    await click("[data-chat-line-button]");
    expect(q("[data-chat-mute]")).toBeNull();
  });

  it("ignores a player's past and future lines until unmuted", async () => {
    await chat.updateComplete;
    await open();
    await receive(BOB, "spam");
    await click("[data-chat-line-button]");
    await click("[data-chat-mute]");
    await receive(BOB, "more spam");
    expect(chat.querySelectorAll("[data-chat-line]")).toHaveLength(0);

    await click("[data-chat-unmute]");
    await receive(BOB, "sorry");
    expect(chat.querySelectorAll("[data-chat-line]")).toHaveLength(1);
  });

  it("opens the report form on offensive chat, once per player", async () => {
    await chat.updateComplete;
    await open();
    await receive(BOB, "insult");
    await click("[data-chat-line-button]");
    await click("[data-chat-report]");
    const modal = q("player-report-modal") as PlayerReportModal;
    expect(modal.initialReason).toBe("offensive_chat");
    expect(modal.target?.clientID()).toBe(BOB);

    bus.emit(new PlayerReportedEvent(BOB));
    modal.dispatchEvent(new CustomEvent("close"));
    await chat.updateComplete;
    expect(q("player-report-modal")).toBeNull();
    await click("[data-chat-line-button]");
    expect(q("[data-chat-mute]")).not.toBeNull();
    expect(q("[data-chat-report]")).toBeNull();
  });

  it("tells its player why the server held a line back", async () => {
    await chat.updateComplete;
    await open();
    bus.emit(new ChatNoticeEvent("blocked"));
    bus.emit(new ChatNoticeEvent("muted", 300));
    await chat.updateComplete;
    expect(
      [...chat.querySelectorAll("[data-chat-notice]")].map((l) =>
        l.textContent?.trim(),
      ),
    ).toEqual([
      "⚠ game_chat.notice_blocked(0 s)",
      "⚠ game_chat.notice_muted(5 min)",
    ]);
  });

  it("says when a player leaves the game and comes back", async () => {
    players[CAROL].disconnected = true;
    chat.tick();
    await open();
    expect(shown()).toEqual(["game_chat.empty"]);

    players[BOB].disconnected = true;
    chat.tick();
    await chat.updateComplete;
    players[BOB].disconnected = false;
    chat.tick();
    await chat.updateComplete;
    expect(shown()).toEqual([
      "game_chat.player_left(Bob)",
      "game_chat.player_back(Bob)",
    ]);
  });

  it("has an allies channel in Nations games only", async () => {
    await chat.updateComplete;
    await open();
    expect(q("[data-chat-channel]")).toBeNull();

    opts.nations = true;
    chat.requestUpdate();
    await chat.updateComplete;
    await click('[data-chat-channel="allies"]');
    await type("no one hears");
    expect(sent).toEqual([]);
    expect(shown()).toEqual(["⚠ game_chat.notice_no_allies(0 s)"]);

    players[ALICE].allyIDs = [BOB];
    await type("push north");
    expect(sent).toEqual([{ text: "push north", to: [BOB] }]);

    await click('[data-chat-channel="all"]');
    await type("gg all");
    expect(sent[1]).toEqual({ text: "gg all", to: undefined });
  });

  it("shows allies lines only from real allies", async () => {
    opts.nations = true;
    players[ALICE].allyIDs = [BOB];
    await chat.updateComplete;
    await open();
    await receive(BOB, "on my way", true);
    await receive(CAROL, "trust me", true);
    await receive(ALICE, "thanks", true);
    expect(shown()).toEqual([
      "game_chat.channel_allies Bob: on my way",
      "game_chat.channel_allies game_chat.you: thanks",
    ]);
  });

  it("lets a spectator read without a message box", async () => {
    opts.spectator = true;
    await chat.updateComplete;
    await open();
    await receive(BOB, "hello");
    expect(chat.querySelectorAll("[data-chat-line]")).toHaveLength(1);
    expect(q("[data-chat-input]")).toBeNull();
  });

  it.each([
    ["a solo game", { gameType: GameType.Singleplayer }],
    ["a replay", { replay: true }],
    ["the chat setting off", { enabled: false }],
  ])("stays out of %s", async (_, change) => {
    Object.assign(opts, change);
    chat.init();
    chat.requestUpdate();
    await chat.updateComplete;
    await receive(BOB, "hello");
    expect(q("[data-chat-toggle]")).toBeNull();
  });
  describe("reporting a single line", () => {
    const settle = async () => {
      await Promise.resolve();
      await Promise.resolve();
      await chat.updateComplete;
    };
    const toasts: any[] = [];
    const onToast = (e: Event) => toasts.push((e as CustomEvent).detail);
    beforeEach(() => {
      toasts.length = 0;
      window.addEventListener("show-message", onToast);
    });
    afterEach(() => window.removeEventListener("show-message", onToast));

    it("puts a flag button, with a custom svg icon, on other players' lines only", async () => {
      await open();
      await receive(BOB, "hello");
      await receive(ALICE, "mine");
      await settle();
      const buttons = chat.querySelectorAll("[data-chat-report-line]");
      expect(buttons).toHaveLength(1);
      expect(buttons[0].querySelector("svg")).not.toBeNull();
      expect(buttons[0].textContent?.trim()).toBe("");
      expect(buttons[0].getAttribute("aria-label")).toBe(
        "game_chat.report_line",
      );
      // Hidden until hover or focus, but always there on touch screens.
      expect(buttons[0].className).toContain("opacity-0");
      expect(buttons[0].className).toContain("group-hover:opacity-100");
      expect(buttons[0].className).toContain("focus-visible:opacity-100");
      expect(buttons[0].className).toContain("pointer-coarse:opacity-100");
    });

    it("is hidden for players who are not signed in", async () => {
      report.canReportChat.mockResolvedValue(false);
      const other = document.createElement("game-chat") as GameChat;
      other.eventBus = bus;
      other.userSettings = chat.userSettings;
      other.game = chat.game;
      other.init();
      document.body.appendChild(other);
      await other.updateComplete;
      other.querySelector<HTMLElement>("[data-chat-toggle]")!.click();
      bus.emit(new ChatMessageEvent(BOB, "hello", false));
      await Promise.resolve();
      await Promise.resolve();
      await other.updateComplete;
      expect(other.querySelector("[data-chat-line]")).not.toBeNull();
      expect(other.querySelector("[data-chat-report-line]")).toBeNull();
      other.remove();
    });

    it("asks to confirm, then posts the line with its sender and language", async () => {
      await open();
      await receive(BOB, "you are bad");
      await settle();
      await click("[data-chat-report-line]");
      expect(q("[data-chat-report-confirm]")).not.toBeNull();
      expect(report.sendChatReport).not.toHaveBeenCalled();

      await click("[data-chat-report-yes]");
      await settle();
      expect(report.sendChatReport).toHaveBeenCalledWith({
        gameID: "game0001",
        text: "you are bad",
        senderClientID: BOB,
        lang: "fr",
      });
      expect(toasts[toasts.length - 1]).toMatchObject({
        message: "game_chat.report_line_sent",
        color: "green",
      });
      // One report per line.
      expect(q("[data-chat-report-line]")).toBeNull();
      expect(q("[data-chat-report-confirm]")).toBeNull();
    });

    it("sends nothing when the confirmation is cancelled", async () => {
      await open();
      await receive(BOB, "hello");
      await settle();
      await click("[data-chat-report-line]");
      await click("[data-chat-report-no]");
      expect(report.sendChatReport).not.toHaveBeenCalled();
      expect(q("[data-chat-report-confirm]")).toBeNull();
      expect(q("[data-chat-report-line]")).not.toBeNull();
    });

    it.each([
      ["rate_limited", "game_chat.report_line_rate_limited"],
      ["error", "game_chat.report_line_failed"],
    ])("toasts a %s answer and lets the player retry", async (result, key) => {
      report.sendChatReport.mockResolvedValue(result);
      await open();
      await receive(BOB, "hello");
      await settle();
      await click("[data-chat-report-line]");
      await click("[data-chat-report-yes]");
      await settle();
      expect(toasts[toasts.length - 1]).toMatchObject({
        message: key,
        color: "red",
      });
      expect(q("[data-chat-report-line]")).not.toBeNull();
    });
  });
});
