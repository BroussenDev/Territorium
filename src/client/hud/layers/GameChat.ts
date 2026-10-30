import type { Colord } from "colord";
import { html, LitElement, nothing, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { GameType, PlayerType } from "../../../core/game/Game";
import { UserSettings } from "../../../core/game/UserSettings";
import {
  CHAT_MESSAGE_MAX_LENGTH,
  ChatNotice,
  ClientID,
} from "../../../core/Schemas";
import {
  canReportChat,
  chatReportBody,
  chatReportContext,
  SeenChatLine,
  sendChatReport,
} from "../../ChatReport";
import { Controller } from "../../Controller";
import {
  ChatMessageEvent,
  ChatNoticeEvent,
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

// The emoji picker, ten to a row.
// prettier-ignore
export const CHAT_EMOJIS = [
  "😀", "😂", "🤣", "😊", "😍", "😎", "🤔", "😏", "😅", "😢",
  "😭", "😡", "🤯", "😱", "🥶", "🤡", "💀", "😴", "🫡", "🤝",
  "👍", "👎", "👏", "🙏", "💪", "👋", "✌️", "🔥", "💥", "⚔️",
  "🛡️", "👑", "🏆", "🎯", "💰", "⚓", "🚀", "☢️", "❤️", "💔",
] as const;

type ChatLine =
  | {
      id: number;
      kind: "chat";
      from: ClientID;
      text: string;
      allies: boolean;
      at: number;
    }
  | { id: number; kind: "notice"; text: string; tone: "warn" | "info" };

type Channel = "all" | "allies";

const PANEL =
  "rounded-lg bg-plate-800/92 text-white shadow-lg backdrop-blur-sm";
const TOOL_BUTTON =
  "rounded-md border border-plate-500 bg-plate-700/50 transition-colors hover:bg-plate-600";

// A flag, drawn for the per-line report button.
const flagIcon = svg`<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></svg>`;

const chatIcon = svg`<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/></svg>`;

// Names are drawn on the dark panel in the sender's territory color, raised
// until it reads (a navy empire's name would otherwise vanish).
function readable(color: Colord): string {
  let c = color;
  for (let i = 0; i < 20 && c.brightness() < 0.62; i++) c = c.lighten(0.05);
  return c.toHex();
}

function formatWait(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${Math.ceil(seconds / 60)} min`;
}

// The in-game chat of a multiplayer game, in the bottom-left corner: every
// player's lines, relayed by the game server (GameServer.handleChat), which
// also moderates them and tells the sender why a line was held back. Nations
// games add an allies channel. Clicking someone's line offers to ignore them
// for the rest of the game (on this client only) or to report them, the
// report carrying their last lines as the server saw them. Spectators read
// without writing.
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
  // The staff muted this account in the chat: until when (ms), Infinity for
  // good, null when not. The server drops every line meanwhile.
  @state() private accountMutedUntil: number | null = null;
  @state() private muted = new Set<ClientID>();
  @state() private reportTarget: PlayerView | null = null;
  @state() private enabled = true;
  @state() private selected: number | null = null;
  @state() private emojis = false;
  @state() private channel: Channel = "all";
  // Signed-in players can report single lines; the line being confirmed, and
  // the lines already reported (one report per line).
  @state() private signedIn = false;
  @state() private confirming: number | null = null;
  @state() private reportedLines = new Set<number>();

  private reported = new Set<ClientID>();
  // Players seen disconnected at the last tick, null before the first one.
  private away: Set<ClientID> | null = null;
  private sentAt: number[] = [];
  private nextId = 0;

  createRenderRoot() {
    return this;
  }

  init() {
    // The element sits in the page before any game exists, so its first
    // render saw no game; draw it again now that there is one.
    this.requestUpdate();
    this.enabled = this.userSettings.gameChat();
    void canReportChat().then((ok) => (this.signedIn = ok));
    this.eventBus.on(ChatMessageEvent, (e) => this.onMessage(e));
    this.eventBus.on(ChatNoticeEvent, (e) => this.onNotice(e));
    this.eventBus.on(PlayerReportedEvent, (e) => {
      this.reported.add(e.reported);
      this.requestUpdate();
    });
  }

  tick() {
    // Follows the setting when it changes mid-game.
    const enabled = this.userSettings.gameChat();
    if (enabled !== this.enabled) this.enabled = enabled;
    this.watchDepartures();
  }

  // Says in the chat when a player leaves the game, and when they come back.
  // The first look only takes note of who is already gone.
  private watchDepartures() {
    if (!this.available()) return;
    const me = this.game.myClientID();
    const away = new Set<ClientID>();
    for (const p of this.game.players()) {
      const id = p.clientID();
      if (p.type() !== PlayerType.Human || !id || id === me) continue;
      if (!p.isDisconnected()) {
        if (this.away?.has(id)) this.announce("player_back", p);
        continue;
      }
      away.add(id);
      if (this.away !== null && !this.away.has(id)) {
        this.announce("player_left", p);
      }
    }
    this.away = away;
  }

  private announce(key: "player_left" | "player_back", player: PlayerView) {
    this.push({
      id: this.nextId++,
      kind: "notice",
      tone: "info",
      text: translateText(`game_chat.${key}`, { name: player.displayName() }),
    });
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

  private hasAlliesChannel(): boolean {
    return this.game.config().isNationsMode() && this.game.myPlayer() !== null;
  }

  private push(line: ChatLine) {
    this.lines = [...this.lines, line].slice(-MAX_LINES);
    if (this.open) this.scrollToEnd();
  }

  private onMessage(e: ChatMessageEvent) {
    if (!this.available() || this.muted.has(e.from)) return;
    const mine = e.from === this.game.myClientID();
    // An allies line counts only if its sender really is our ally: the
    // server delivers it to whoever the sender named.
    if (e.allies && !mine) {
      const me = this.game.myPlayer();
      const sender = this.game.playerByClientID(e.from);
      if (me === null || sender === null || !me.isAlliedWith(sender)) return;
    }
    this.push({
      id: this.nextId++,
      kind: "chat",
      from: e.from,
      text: e.text,
      allies: e.allies,
      at: Date.now(),
    });
    if (!this.open && !mine) this.unread++;
  }

  private onNotice(e: ChatNoticeEvent) {
    if (!this.available()) return;
    if (e.notice === "account_muted") {
      this.accountMutedUntil =
        e.seconds === undefined ? Infinity : Date.now() + e.seconds * 1000;
      this.push({
        id: this.nextId++,
        kind: "notice",
        tone: "warn",
        text: this.accountMuteText(),
      });
      return;
    }
    const name =
      e.from !== undefined
        ? (this.game.playerByClientID(e.from)?.displayName() ?? "?")
        : "";
    this.notify(e.notice, e.seconds, name);
  }

  // The player's own words for the staff mute, with its end date.
  private accountMuteText(): string {
    const until = this.accountMutedUntil;
    if (until === null || until === Infinity) {
      return translateText("game_chat.notice_account_muted_forever");
    }
    return translateText("game_chat.notice_account_muted", {
      date: new Date(until).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    });
  }

  // Whether the staff mute is still running (it lifts itself at its date).
  private accountMuted(): boolean {
    return (
      this.accountMutedUntil !== null && Date.now() < this.accountMutedUntil
    );
  }

  private notify(
    notice: ChatNotice | "no_allies",
    seconds?: number,
    name = "",
  ) {
    this.push({
      id: this.nextId++,
      kind: "notice",
      tone: "warn",
      text: translateText(`game_chat.notice_${notice}`, {
        time: formatWait(seconds ?? 0),
        ...(name !== "" ? { name } : {}),
      }),
    });
  }

  private scrollToEnd() {
    void this.updateComplete.then(() => {
      const list = this.querySelector("[data-chat-lines]");
      if (list) list.scrollTop = list.scrollHeight;
    });
  }

  private input(): HTMLInputElement | null {
    return this.querySelector("[data-chat-input]");
  }

  private toggle() {
    this.open = !this.open;
    this.selected = null;
    this.emojis = false;
    if (this.open) {
      this.unread = 0;
      this.scrollToEnd();
      void this.updateComplete.then(() => this.input()?.focus());
    }
  }

  private allyRecipients(): ClientID[] {
    return (this.game.myPlayer()?.allies() ?? [])
      .filter((p) => p.type() === PlayerType.Human)
      .map((p) => p.clientID())
      .filter((id): id is ClientID => id !== null && id !== undefined);
  }

  private send() {
    const text = this.draft.trim();
    if (text === "" || this.accountMuted()) return;
    let to: ClientID[] | undefined;
    if (this.channel === "allies") {
      to = this.allyRecipients();
      if (to.length === 0) {
        this.notify("no_allies");
        return;
      }
    }
    const now = Date.now();
    this.sentAt = this.sentAt.filter((t) => now - t < BURST_WINDOW_MS);
    if (this.sentAt.length >= BURST_LINES) {
      this.slowDown = true;
      return;
    }
    this.sentAt.push(now);
    this.slowDown = false;
    this.draft = "";
    this.emojis = false;
    this.eventBus.emit(new SendChatMessageEvent(text, to));
  }

  private onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      this.emojis = false;
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

  private insertEmoji(emoji: string) {
    const input = this.input();
    const start = input?.selectionStart ?? this.draft.length;
    const end = input?.selectionEnd ?? start;
    const next = this.draft.slice(0, start) + emoji + this.draft.slice(end);
    if (next.length > CHAT_MESSAGE_MAX_LENGTH) return;
    this.draft = next;
    void this.updateComplete.then(() => {
      const caret = start + emoji.length;
      input?.focus();
      input?.setSelectionRange(caret, caret);
    });
  }

  private mute(from: ClientID) {
    this.muted = new Set([...this.muted, from]);
    this.lines = this.lines.filter((l) => l.kind !== "chat" || l.from !== from);
    this.selected = null;
  }

  private unmuteAll() {
    this.muted = new Set();
  }

  // The conversation around a reported line, as this player saw it.
  private reportContext(line: Extract<ChatLine, { kind: "chat" }>) {
    const seen: SeenChatLine[] = [];
    let index = -1;
    for (const l of this.lines) {
      if (l.kind !== "chat") continue;
      if (l.id === line.id) index = seen.length;
      seen.push({
        at: l.at,
        from: l.from,
        name: this.game.playerByClientID(l.from)?.displayName() ?? "?",
        text: l.text,
        allies: l.allies,
      });
    }
    return chatReportContext(seen, index);
  }

  private async reportLine(line: Extract<ChatLine, { kind: "chat" }>) {
    this.confirming = null;
    if (this.reportedLines.has(line.id)) return;
    this.reportedLines = new Set([...this.reportedLines, line.id]);
    const result = await sendChatReport(
      chatReportBody(
        this.game.gameID(),
        line.text,
        line.from,
        undefined,
        this.reportContext(line),
      ),
    );
    const key =
      result === "ok"
        ? "report_line_sent"
        : result === "rate_limited"
          ? "report_line_rate_limited"
          : "report_line_failed";
    if (result !== "ok") {
      // Not sent: let the player try again.
      const again = new Set(this.reportedLines);
      again.delete(line.id);
      this.reportedLines = again;
    }
    window.dispatchEvent(
      new CustomEvent("show-message", {
        detail: {
          message: translateText(`game_chat.${key}`),
          color: result === "ok" ? "green" : "red",
          duration: 3000,
        },
      }),
    );
  }

  private canReport(sender: PlayerView | null): sender is PlayerView {
    return (
      sender !== null &&
      sender.type() === PlayerType.Human &&
      !this.game.gameOver() &&
      !this.reported.has(sender.clientID() ?? "")
    );
  }

  render() {
    if (!this.available()) return nothing;
    if (!this.open) {
      return html`
        <button
          type="button"
          data-chat-toggle
          class="mb-1 flex items-center gap-2 ${PANEL} px-3 py-1.5 text-sm font-semibold hover:bg-plate-700/92"
          aria-label=${translateText("game_chat.open")}
          @click=${this.toggle}
        >
          ${chatIcon} ${translateText("game_chat.title")}
          ${this.unread > 0
            ? html`<span
                data-chat-unread
                class="min-w-5 rounded-full bg-brand px-1.5 text-center text-xs text-white"
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
        class="mb-1 flex w-full flex-col ${PANEL} sm:w-80 lg:w-96 lg:max-w-full"
      >
        <div class="flex items-center gap-2 px-3 pt-2 pb-1.5">
          ${chatIcon}
          <span class="text-sm font-bold"
            >${translateText("game_chat.title")}</span
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
            class="ml-auto ${TOOL_BUTTON} size-6 text-xs leading-none text-white/80"
            aria-label=${translateText("game_chat.close")}
            title=${translateText("game_chat.close")}
            @click=${this.toggle}
          >
            ✕
          </button>
        </div>
        <ul
          data-chat-lines
          aria-live="polite"
          class="mx-2 max-h-[20vh] overflow-y-auto rounded-md border border-plate-600 bg-plate-900/60 p-1 text-xs lg:max-h-[26vh] lg:text-sm"
        >
          ${this.lines.length === 0
            ? html`<li class="px-1.5 py-1 text-white/60">
                ${translateText("game_chat.empty")}
              </li>`
            : this.lines.map((line) => this.renderLine(line, me))}
        </ul>
        ${canWrite ? this.renderComposer() : this.renderSpectatorNote()}
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

  private renderSpectatorNote() {
    return html`<p class="px-3 py-2 text-xs text-white/60">
      ${translateText("game_chat.spectator")}
    </p>`;
  }

  private renderComposer() {
    const allies = this.channel === "allies";
    return html`
      ${this.emojis
        ? html`<div
            data-chat-emojis
            class="mx-2 mt-1.5 grid grid-cols-10 gap-0.5 rounded-md border border-plate-600 bg-plate-900/60 p-1"
          >
            ${CHAT_EMOJIS.map(
              (emoji) =>
                html`<button
                  type="button"
                  data-chat-emoji
                  class="rounded text-lg leading-7 hover:bg-white/10"
                  @click=${() => this.insertEmoji(emoji)}
                >
                  ${emoji}
                </button>`,
            )}
          </div>`
        : nothing}
      ${this.hasAlliesChannel()
        ? html`<div
            class="mx-2 mt-1.5 flex gap-1 text-xs font-semibold"
            role="radiogroup"
          >
            ${(["all", "allies"] as const).map(
              (channel) =>
                html`<button
                  type="button"
                  role="radio"
                  data-chat-channel=${channel}
                  aria-checked=${this.channel === channel}
                  class="rounded-md border px-2.5 py-0.5 transition-colors ${this
                    .channel === channel
                    ? channel === "allies"
                      ? "border-teal-400 bg-teal-500/25 text-teal-200"
                      : "border-brand bg-brand/25 text-white"
                    : "border-plate-600 text-white/60 hover:text-white"}"
                  @click=${() => {
                    this.channel = channel;
                    this.input()?.focus();
                  }}
                >
                  ${translateText(`game_chat.channel_${channel}`)}
                </button>`,
            )}
          </div>`
        : nothing}
      <div class="flex items-center gap-1.5 p-2">
        <button
          type="button"
          data-chat-emoji-toggle
          class="${TOOL_BUTTON} size-8 shrink-0 text-base ${this.emojis
            ? "bg-plate-600"
            : ""}"
          aria-label=${translateText("game_chat.emojis")}
          aria-expanded=${this.emojis}
          title=${translateText("game_chat.emojis")}
          @click=${() => (this.emojis = !this.emojis)}
        >
          😀
        </button>
        <input
          data-chat-input
          type="text"
          maxlength=${CHAT_MESSAGE_MAX_LENGTH}
          class="h-8 min-w-0 flex-1 rounded-md border bg-plate-900/60 px-2 text-sm text-white placeholder-white/60 outline-hidden ${allies
            ? "border-teal-500/70 focus:border-teal-400"
            : "border-plate-600 focus:border-brand"}"
          ?disabled=${this.accountMuted()}
          title=${this.accountMuted() ? this.accountMuteText() : ""}
          placeholder=${this.accountMuted()
            ? this.accountMuteText()
            : translateText(
                allies
                  ? "game_chat.placeholder_allies"
                  : "game_chat.placeholder",
              )}
          .value=${this.draft}
          @input=${(e: InputEvent) =>
            (this.draft = (e.target as HTMLInputElement).value)}
          @keydown=${this.onKeydown}
        />
        <button
          type="button"
          class="h-8 shrink-0 rounded-md bg-brand px-3 text-sm font-bold text-white transition-colors hover:bg-brand-light disabled:opacity-40"
          ?disabled=${this.draft.trim() === "" || this.accountMuted()}
          @click=${this.send}
        >
          ${translateText("game_chat.send")}
        </button>
      </div>
      ${this.slowDown
        ? html`<p data-chat-slow class="px-3 pb-2 text-xs text-amber-300">
            ${translateText("game_chat.slow_down")}
          </p>`
        : nothing}
    `;
  }

  private renderLine(line: ChatLine, me: ClientID | undefined) {
    if (line.kind === "notice") {
      return line.tone === "warn"
        ? html`<li
            data-chat-notice
            class="px-1.5 py-0.5 text-amber-300 italic"
            dir="auto"
          >
            ⚠ ${line.text}
          </li>`
        : html`<li
            data-chat-event
            class="px-1.5 py-0.5 text-white/60 italic"
            dir="auto"
          >
            ${line.text}
          </li>`;
    }
    const sender = this.game.playerByClientID(line.from);
    const mine = line.from === me;
    const name = mine
      ? translateText("game_chat.you")
      : (sender?.displayName() ?? "?");
    const nameColor = mine
      ? "#fcd34d"
      : sender
        ? readable(sender.territoryColor())
        : "#cbd5e1";
    const selected = this.selected === line.id;
    const text = html`${line.allies
        ? html`<span
            class="rounded-sm bg-teal-500/25 px-1 text-[10px] font-bold text-teal-200 uppercase"
            >${translateText("game_chat.channel_allies")}</span
          >`
        : nothing}
      <span class="font-bold" style="color: ${nameColor}">${name}:</span>
      <span class="text-white/95">${line.text}</span>`;
    const canFlag =
      !mine &&
      this.signedIn &&
      !this.reportedLines.has(line.id) &&
      !this.game.gameOver();
    return html`
      <li data-chat-line class="group relative">
        ${mine
          ? html`<p class="px-1.5 py-0.5 break-words" dir="auto">${text}</p>`
          : html`<button
              type="button"
              data-chat-line-button
              class="w-full rounded px-1.5 py-0.5 text-left break-words transition-colors hover:bg-white/5 ${canFlag
                ? "pr-7"
                : ""} ${selected ? "bg-white/10" : ""}"
              dir="auto"
              title=${translateText("game_chat.line_hint")}
              aria-expanded=${selected}
              @click=${() => (this.selected = selected ? null : line.id)}
            >
              ${text}
            </button>`}
        ${canFlag
          ? html`<button
              type="button"
              data-chat-report-line
              class="absolute top-0.5 right-1 rounded p-0.5 text-white/60 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300 focus-visible:opacity-100 pointer-coarse:opacity-100"
              aria-label=${translateText("game_chat.report_line")}
              title=${translateText("game_chat.report_line")}
              @click=${() =>
                (this.confirming =
                  this.confirming === line.id ? null : line.id)}
            >
              ${flagIcon}
            </button>`
          : nothing}
        ${canFlag && this.confirming === line.id
          ? html`<div
              data-chat-report-confirm
              role="alertdialog"
              aria-label=${translateText("game_chat.report_line_confirm")}
              class="mx-1.5 mb-1 flex flex-wrap items-center gap-1.5 rounded-md border border-red-400/60 bg-plate-800 px-2 py-1 text-xs"
            >
              <span class="font-semibold"
                >${translateText("game_chat.report_line_confirm")}</span
              >
              <button
                type="button"
                data-chat-report-yes
                class="rounded-md border border-red-400/60 bg-red-500/25 px-2 py-0.5 text-red-100 hover:bg-red-500/40"
                @click=${() => void this.reportLine(line)}
              >
                ${translateText("game_chat.report_line_yes")}
              </button>
              <button
                type="button"
                data-chat-report-no
                class="${TOOL_BUTTON} px-2 py-0.5"
                @click=${() => (this.confirming = null)}
              >
                ${translateText("game_chat.report_line_no")}
              </button>
            </div>`
          : nothing}
        ${selected ? this.renderLineActions(line.from, sender) : nothing}
      </li>
    `;
  }

  private renderLineActions(from: ClientID, sender: PlayerView | null) {
    const name = sender?.displayName() ?? "?";
    return html`<div class="flex flex-wrap gap-1 px-1.5 pt-0.5 pb-1 text-xs">
      <button
        type="button"
        data-chat-mute
        class="${TOOL_BUTTON} px-2 py-0.5"
        title=${translateText("game_chat.mute")}
        @click=${() => this.mute(from)}
      >
        🔇 ${translateText("game_chat.ignore_player", { name })}
      </button>
      ${this.canReport(sender)
        ? html`<button
            type="button"
            data-chat-report
            class="rounded-md border border-red-400/60 bg-red-500/15 px-2 py-0.5 text-red-200 transition-colors hover:bg-red-500/30"
            title=${translateText("game_chat.report")}
            @click=${() => {
              this.reportTarget = sender;
              this.selected = null;
            }}
          >
            🚩 ${translateText("game_chat.report_player", { name })}
          </button>`
        : nothing}
    </div>`;
  }
}
