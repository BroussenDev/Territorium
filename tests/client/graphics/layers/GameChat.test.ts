import { colord } from "colord";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../src/client/hud/layers/GameChat";
import type { GameChat } from "../../../../src/client/hud/layers/GameChat";
import type { PlayerReportModal } from "../../../../src/client/hud/layers/PlayerReportModal";
import {
  ChatMessageEvent,
  PlayerReportedEvent,
  SendChatMessageEvent,
} from "../../../../src/client/Transport";
import { EventBus } from "../../../../src/core/EventBus";
import { GameType, PlayerType } from "../../../../src/core/game/Game";

vi.mock("../../../../src/client/Utils", () => ({
  translateText: vi.fn((key: string) => key),
}));

const ALICE = "aliceAAA";
const BOB = "bobBBBBB";

function player(clientID: string, name: string) {
  return {
    clientID: () => clientID,
    displayName: () => name,
    territoryColor: () => colord("#224488"),
    type: () => PlayerType.Human,
  };
}

describe("GameChat", () => {
  let chat: GameChat;
  let bus: EventBus;
  let sent: string[];
  let opts: {
    gameType: GameType;
    replay: boolean;
    spectator: boolean;
    enabled: boolean;
  };

  beforeEach(() => {
    opts = {
      gameType: GameType.Public,
      replay: false,
      spectator: false,
      enabled: true,
    };
    bus = new EventBus();
    sent = [];
    bus.on(SendChatMessageEvent, (e) => sent.push(e.text));
    const players: Record<string, ReturnType<typeof player>> = {
      [ALICE]: player(ALICE, "Alice"),
      [BOB]: player(BOB, "Bob"),
    };
    chat = document.createElement("game-chat") as GameChat;
    chat.eventBus = bus;
    chat.userSettings = { gameChat: () => opts.enabled } as any;
    chat.game = {
      config: () => ({
        gameConfig: () => ({ gameType: opts.gameType }),
        isReplay: () => opts.replay,
      }),
      myClientID: () => ALICE,
      myPlayer: () => (opts.spectator ? null : players[ALICE]),
      playerByClientID: (id: string) => players[id] ?? null,
      gameOver: () => false,
    } as any;
    chat.init();
    document.body.appendChild(chat);
  });

  afterEach(() => {
    chat.remove();
  });

  const receive = async (from: string, text: string) => {
    bus.emit(new ChatMessageEvent(from, text));
    await chat.updateComplete;
  };
  const q = (sel: string) => chat.querySelector(sel) as HTMLElement | null;
  const open = async () => {
    q("[data-chat-toggle]")!.click();
    await chat.updateComplete;
  };
  const type = async (text: string) => {
    const input = q("[data-chat-input]") as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new InputEvent("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await chat.updateComplete;
  };

  it("counts unread lines from others while closed, then shows them", async () => {
    await chat.updateComplete;
    await receive(BOB, "hello");
    await receive(ALICE, "hi bob");
    expect(q("[data-chat-unread]")?.textContent).toBe("1");

    await open();
    const lines = [...chat.querySelectorAll("[data-chat-line] p")].map((l) =>
      l.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(lines).toEqual(["Bob: hello", "game_chat.you: hi bob"]);
    expect(q("[data-chat-unread]")).toBeNull();
  });

  it("sends typed lines on Enter and holds back a fifth one in ten seconds", async () => {
    await chat.updateComplete;
    await open();
    for (const text of ["one", "  two  ", "three", "four", "five"]) {
      await type(text);
    }
    expect(sent).toEqual(["one", "two", "three", "four"]);
    expect(q("[data-chat-slow]")).not.toBeNull();
    // The held-back line stays in the box to send later.
    expect((q("[data-chat-input]") as HTMLInputElement).value).toBe("five");
  });

  it("mutes a player's past and future lines until unmuted", async () => {
    await chat.updateComplete;
    await open();
    await receive(BOB, "spam");
    q("[data-chat-mute]")!.click();
    await chat.updateComplete;
    await receive(BOB, "more spam");
    expect(chat.querySelectorAll("[data-chat-line]")).toHaveLength(0);

    q("[data-chat-unmute]")!.click();
    await chat.updateComplete;
    await receive(BOB, "sorry");
    expect(chat.querySelectorAll("[data-chat-line]")).toHaveLength(1);
  });

  it("opens the report form on offensive chat, once per player", async () => {
    await chat.updateComplete;
    await open();
    await receive(BOB, "insult");
    q("[data-chat-report]")!.click();
    await chat.updateComplete;
    const modal = q("player-report-modal") as PlayerReportModal;
    expect(modal.initialReason).toBe("offensive_chat");
    expect(modal.target?.clientID()).toBe(BOB);

    bus.emit(new PlayerReportedEvent(BOB));
    modal.dispatchEvent(new CustomEvent("close"));
    await chat.updateComplete;
    expect(q("player-report-modal")).toBeNull();
    expect(q("[data-chat-report]")).toBeNull();
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
});
