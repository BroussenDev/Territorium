import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { GameType, PlayerType } from "../../../core/game/Game";
import { UserSettings } from "../../../core/game/UserSettings";
import { CHAT_MESSAGE_MAX_LENGTH, ClientID } from "../../../core/Schemas";
import { Controller } from "../../Controller";
import {
  ChatMessageEvent,
  PlayerReportedEvent,
  SendChatMessageEvent,
} from "../../Transport";
import { translateText } from "../../Utils";
import { GameView } from "../../view";
import { PlayerView } from "../../view/PlayerView";
import "./PlayerReportModal";

// Kept in step with the server's limit (ClientMsgRateLimiter): past it the
// server drops lines silently, so the panel says so before sending.
const BURST_LINES = 4;
const BURST_WINDOW_MS = 10_000;
const MAX_LINES = 100;

interface ChatLine {
  id: number;
  from: ClientID;
  text: string;
}

// The general chat of a multiplayer game: every player's lines, relayed by
// the game server (GameServer.handleChat). A player can mute someone for the
// rest of the game (on this client only) or report them, the report carrying
// their last lines as the server saw them. Spectators read without writing.
@customElement("game-chat")
export class GameChat extends LitElement implements Controller {
  public eventBus: EventBus;
  public game: GameView;
  public userSettings: UserSettings;

  @state() private open = false;
  @state() private lines: ChatLine[] = [];
  @state() private unread = 0;
  @state() private draft = "";
  @state() private slowDown = false;
  @state() private muted = new Set<ClientID>();
  @state() private reportTarget: PlayerView | null = null;
  @state() private enabled = true;

  private reported = new Set<ClientID>();
  private sentAt: number[] = [];
  private nextId = 0;

  createRenderRoot() {
    return this;
  }

  init() {
    this.enabled = this.userSettings.gameChat();
    this.eventBus.on(ChatMessageEvent, (e) => this.onMessage(e));
    this.eventBus.on(PlayerReportedEvent, (e) => {
      this.reported.add(e.reported);
      this.requestUpdate();
    });
  }

  tick() {
    // Follows the setting when it changes mid-game.
    const enabled = this.userSettings.gameChat();
    if (enabled !== this.enabled) this.enabled = enabled;
  }

  getTickIntervalMs() {
    return 1000;
  }

  private available(): boolean {
    const config = this.game?.config();
    return (
      !!config &&
      this.enabled &&
      config.gameConfig().gameType !== GameType.Singleplayer &&
      !config.isReplay()
    );
  }

  private onMessage(e: ChatMessageEvent) {
    if (!this.available() || this.muted.has(e.from)) return;
    this.lines = [
      ...this.lines,
      { id: this.nextId++, from: e.from, text: e.text },
    ].slice(-MAX_LINES);
    if (!this.open && e.from !== this.game.myClientID()) this.unread++;
    if (this.open) this.scrollToEnd();
  }

  private scrollToEnd() {
    void this.updateComplete.then(() => {
      const list = this.querySelector("[data-chat-lines]");
      if (list) list.scrollTop = list.scrollHeight;
    });
  }

  private toggle() {
    this.open = !this.open;
    if (this.open) {
      this.unread = 0;
      this.scrollToEnd();
      void this.updateComplete.then(() =>
        (
          this.querySelector("[data-chat-input]") as HTMLInputElement | null
        )?.focus(),
      );
    }
  }

  private send() {
    const text = this.draft.trim();
    if (text === "") return;
    const now = Date.now();
    this.sentAt = this.sentAt.filter((t) => now - t < BURST_WINDOW_MS);
    if (this.sentAt.length >= BURST_LINES) {
      this.slowDown = true;
      return;
    }
    this.sentAt.push(now);
    this.slowDown = false;
    this.draft = "";
    this.eventBus.emit(new SendChatMessageEvent(text));
  }

  private onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      (e.target as HTMLInputElement).blur();
      return;
    }
    // Typed letters are text, not game hotkeys.
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      this.send();
    }
  }

  private mute(from: ClientID) {
    this.muted = new Set([...this.muted, from]);
    this.lines = this.lines.filter((l) => l.from !== from);
  }

  private unmuteAll() {
    this.muted = new Set();
  }

  private canReport(sender: PlayerView | null): sender is PlayerView {
    return (
      sender !== null &&
      sender.type() === PlayerType.Human &&
      !this.game.gameOver() &&
      !this.reported.has(sender.clientID() ?? "")
    );
  }

  private senderColor(sender: PlayerView | null): string {
    if (!sender) return "#d1d5db";
    const color = sender.territoryColor();
    return (color.isDark() ? color.lighten(0.25) : color).toHex();
  }

  render() {
    if (!this.available()) return nothing;
    if (!this.open) {
      return html`
        <button
          type="button"
          data-chat-toggle
          class="mb-1 flex items-center gap-2 rounded-lg bg-gray-800/92 backdrop-blur-sm px-3 py-1.5 text-sm font-semibold text-white shadow-lg hover:bg-gray-700/92"
          aria-label=${translateText("game_chat.open")}
          @click=${this.toggle}
        >
          <span aria-hidden="true">💬</span>
          ${translateText("game_chat.title")}
          ${this.unread > 0
            ? html`<span
                data-chat-unread
                class="min-w-5 rounded-full bg-emerald-500 px-1.5 text-center text-xs text-white"
                >${this.unread}</span
              >`
            : nothing}
        </button>
      `;
    }
    const me = this.game.myClientID();
    const canWrite = this.game.myPlayer() !== null;
    return html`
      <div
        class="mb-1 flex w-full flex-col rounded-lg bg-gray-800/92 text-white shadow-lg backdrop-blur-sm min-[1200px]:w-96"
      >
        <div
          class="flex items-center gap-2 border-b border-white/10 px-3 py-1.5"
        >
          <span class="text-sm font-semibold"
            >💬 ${translateText("game_chat.title")}</span
          >
          ${this.muted.size > 0
            ? html`<button
                type="button"
                data-chat-unmute
                class="text-xs text-white/60 underline hover:text-white"
                @click=${this.unmuteAll}
              >
                ${translateText("game_chat.unmute_all", {
                  count: this.muted.size,
                })}
              </button>`
            : nothing}
          <button
            type="button"
            class="ml-auto px-1 text-white/60 hover:text-white"
            aria-label=${translateText("game_chat.close")}
            title=${translateText("game_chat.close")}
            @click=${this.toggle}
          >
            ✕
          </button>
        </div>
        <ul
          data-chat-lines
          class="max-h-[18vh] overflow-y-auto px-3 py-1.5 text-xs lg:max-h-[24vh] lg:text-sm"
        >
          ${this.lines.length === 0
            ? html`<li class="py-1 text-white/50">
                ${translateText("game_chat.empty")}
              </li>`
            : this.lines.map((line) => this.renderLine(line, me))}
        </ul>
        ${canWrite
          ? html`
              <div class="flex gap-2 border-t border-white/10 p-2">
                <input
                  data-chat-input
                  type="text"
                  maxlength=${CHAT_MESSAGE_MAX_LENGTH}
                  class="min-w-0 flex-1 rounded-md bg-black/30 px-2 py-1 text-sm text-white placeholder-white/40 outline-hidden focus:ring-1 focus:ring-emerald-400/60"
                  placeholder=${translateText("game_chat.placeholder")}
                  .value=${this.draft}
                  @input=${(e: InputEvent) =>
                    (this.draft = (e.target as HTMLInputElement).value)}
                  @keydown=${this.onKeydown}
                />
                <button
                  type="button"
                  class="rounded-md bg-emerald-600 px-3 py-1 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40"
                  ?disabled=${this.draft.trim() === ""}
                  @click=${this.send}
                >
                  ${translateText("game_chat.send")}
                </button>
              </div>
              ${this.slowDown
                ? html`<p
                    data-chat-slow
                    class="px-3 pb-2 text-xs text-amber-300"
                  >
                    ${translateText("game_chat.slow_down")}
                  </p>`
                : nothing}
            `
          : html`<p
              class="border-t border-white/10 px-3 py-2 text-xs text-white/50"
            >
              ${translateText("game_chat.spectator")}
            </p>`}
      </div>
      ${this.reportTarget
        ? html`<div class="fixed inset-0 z-1200">
            <player-report-modal
              .open=${true}
              .target=${this.reportTarget}
              .eventBus=${this.eventBus}
              .initialReason=${"offensive_chat"}
              @close=${() => (this.reportTarget = null)}
            ></player-report-modal>
          </div>`
        : nothing}
    `;
  }

  private renderLine(line: ChatLine, me: ClientID | undefined) {
    const sender = this.game.playerByClientID(line.from);
    const mine = line.from === me;
    const name = mine
      ? translateText("game_chat.you")
      : (sender?.displayName() ?? "?");
    return html`
      <li class="group flex items-start gap-1 py-0.5" data-chat-line>
        <p class="min-w-0 flex-1 break-words" dir="auto">
          <span class="font-semibold" style="color: ${this.senderColor(sender)}"
            >${name}:</span
          >
          ${line.text}
        </p>
        ${mine
          ? nothing
          : html`<span
              class="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            >
              <button
                type="button"
                data-chat-mute
                class="rounded px-1 hover:bg-white/10"
                title=${translateText("game_chat.mute")}
                aria-label=${translateText("game_chat.mute")}
                @click=${() => this.mute(line.from)}
              >
                🔇
              </button>
              ${this.canReport(sender)
                ? html`<button
                    type="button"
                    data-chat-report
                    class="rounded px-1 hover:bg-white/10"
                    title=${translateText("game_chat.report")}
                    aria-label=${translateText("game_chat.report")}
                    @click=${() => (this.reportTarget = sender)}
                  >
                    🚩
                  </button>`
                : nothing}
            </span>`}
      </li>
    `;
  }
}
