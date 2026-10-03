import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { unsafeHTML } from "lit/directives/unsafe-html.js";
import { EventBus, GameEvent } from "../../../core/EventBus";
import {
  MESSAGE_TYPE_CATEGORIES,
  MessageCategory,
  MessageType,
  Tick,
} from "../../../core/game/Game";
import { onlyImages } from "../../../core/Util";
import { Controller } from "../../Controller";
import { GoToPlayerEvent, GoToUnitEvent } from "../../TransformHandler";
import { translateText } from "../../Utils";
import { GameView, UnitView } from "../../view";

/**
 * Sent by the event feeds (EventsDisplay, ActionableEvents) for every line
 * they show, so the history keeps it after the feed has let it go.
 */
export class HistoryEntryEvent implements GameEvent {
  constructor(
    public readonly description: string,
    public readonly type: MessageType,
    public readonly createdAt: Tick,
    // The description may hold emoji images and must go through onlyImages.
    public readonly unsafe: boolean = false,
    public readonly focusID?: number,
    public readonly unitView?: UnitView,
  ) {}
}

interface HistoryEntry {
  id: number;
  event: HistoryEntryEvent;
}

type Filter = "all" | MessageCategory;

const FILTERS: readonly Filter[] = [
  "all",
  MessageCategory.ATTACK,
  MessageCategory.NUKE,
  MessageCategory.ALLIANCE,
  MessageCategory.TRADE,
  MessageCategory.CHAT,
];

const FILTER_KEYS: Record<Filter, string> = {
  all: "event_history.filter_all",
  [MessageCategory.ATTACK]: "event_history.filter_attack",
  [MessageCategory.NUKE]: "event_history.filter_nuke",
  [MessageCategory.ALLIANCE]: "event_history.filter_diplomacy",
  [MessageCategory.TRADE]: "event_history.filter_trade",
  [MessageCategory.CHAT]: "event_history.filter_chat",
};

// The stripe on the left of each entry, by category.
const CATEGORY_COLORS: Record<MessageCategory, string> = {
  [MessageCategory.ATTACK]: "#f87171",
  [MessageCategory.NUKE]: "#fb923c",
  [MessageCategory.ALLIANCE]: "#34d399",
  [MessageCategory.TRADE]: "#fbbf24",
  [MessageCategory.CHAT]: "#94a3b8",
};

// Oldest entries drop off past this, so a long game stays light.
const MAX_ENTRIES = 500;

const bellIcon = html`<svg
  viewBox="0 0 24 24"
  width="18"
  height="18"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
</svg>`;

// Night-green glass with a gold hairline, like the timer bar beside it.
const styles = html`<style>
  event-history {
    position: relative;
    display: block;
    --eh-night: var(--tr-night, rgba(10, 21, 18, 0.93));
    --eh-line: var(--tr-emerald-line, rgba(16, 185, 129, 0.28));
    --eh-gold: var(--tr-gold, #fbbf24);
    --eh-gold-line: var(--tr-gold-line, rgba(251, 191, 36, 0.45));
  }
  .event-history-bell {
    position: relative;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    color: var(--tr-gold-light, #fde68a);
    background: linear-gradient(180deg, #11221c 0%, #0a1512 100%);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-top: none;
    border-radius: 0 0 6px 6px;
    box-shadow: 0 12px 28px -14px rgba(0, 0, 0, 0.9);
    cursor: pointer;
    transition:
      color 0.15s,
      background-color 0.15s;
  }
  .event-history-bell:hover,
  .event-history-bell.is-open {
    color: #fff;
    background: rgba(6, 78, 59, 0.95);
  }
  .event-history-bell:focus-visible,
  event-history button:focus-visible {
    outline: 2px solid var(--eh-gold);
    outline-offset: 2px;
  }
  .event-history-badge {
    position: absolute;
    top: 3px;
    right: 1px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    border-radius: 9px;
    background: var(--eh-gold);
    color: #0a1512;
    font-size: 10px;
    font-weight: 800;
    line-height: 17px;
    text-align: center;
    box-shadow: 0 0 0 2px var(--tr-night-solid, #0a1512);
  }
  .event-history-panel {
    position: fixed;
    top: 52px;
    right: 8px;
    width: min(360px, calc(100vw - 16px));
    max-height: min(70vh, 560px);
    display: flex;
    flex-direction: column;
    color: #fff;
    background: var(--eh-night);
    backdrop-filter: blur(6px);
    border: 1px solid var(--eh-line);
    border-radius: 12px;
    box-shadow:
      inset 0 1px 0 var(--eh-gold-line),
      0 0 18px rgba(16, 185, 129, 0.12),
      0 12px 32px rgba(0, 0, 0, 0.55);
    overflow: hidden;
    z-index: 1001;
  }
  .event-history-panel header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px 6px 14px;
  }
  .event-history-panel h2 {
    margin: 0;
    font-family: var(--tr-display, Inter, Arial, sans-serif);
    font-size: 16px;
    letter-spacing: 0.03em;
    color: var(--tr-gold-light, #fde68a);
  }
  .event-history-close {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    font-size: 20px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.7);
  }
  .event-history-close:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }
  .event-history-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 12px 8px;
    border-bottom: 1px solid var(--eh-line);
  }
  .event-history-filters button {
    padding: 2px 9px;
    border-radius: 999px;
    border: 1px solid var(--eh-line);
    font-size: 12px;
    color: rgba(255, 255, 255, 0.72);
  }
  .event-history-filters button:hover {
    color: #fff;
  }
  .event-history-filters button.is-active {
    color: #0a1512;
    background: var(--eh-gold);
    border-color: var(--eh-gold);
    font-weight: 700;
  }
  .event-history-panel ol {
    margin: 0;
    padding: 4px 0;
    list-style: none;
    overflow-y: auto;
  }
  .event-history-entry {
    display: flex;
    gap: 10px;
    align-items: baseline;
    width: 100%;
    padding: 6px 12px 6px 14px;
    text-align: left;
    font-size: 13px;
    line-height: 1.35;
    box-shadow: inset 3px 0 0 var(--stripe);
  }
  .event-history-entry.is-focusable {
    cursor: pointer;
  }
  .event-history-entry.is-focusable:hover {
    background: rgba(16, 185, 129, 0.12);
  }
  .event-history-text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .event-history-text img {
    display: inline;
    height: 1.1em;
  }
  .event-history-time {
    flex-shrink: 0;
    font-size: 11px;
    color: rgba(255, 255, 255, 0.5);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .event-history-empty {
    margin: 0;
    padding: 18px 14px 20px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.6);
  }
</style>`;

/**
 * The bell beside the game timer. It keeps every message of the game (attacks,
 * missiles, alliances, peace, trade, chat) with how long ago it happened,
 * long after the event feed has cleared it.
 */
@customElement("event-history")
export class EventHistory extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;

  @state() private entries: HistoryEntry[] = [];
  @state() private open = false;
  @state() private unread = 0;
  @state() private filter: Filter = "all";
  private nextID = 0;

  createRenderRoot() {
    return this;
  }

  init() {
    this.entries = [];
    this.unread = 0;
    this.open = false;
    this.filter = "all";
    this.eventBus.on(HistoryEntryEvent, (e) => this.onEntry(e));
  }

  getTickIntervalMs() {
    return 1000;
  }

  tick() {
    // Keeps the "2 min ago" labels current.
    if (this.open) this.requestUpdate();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopListening();
  }

  private onEntry(e: HistoryEntryEvent) {
    const entries = [...this.entries, { id: this.nextID++, event: e }];
    this.entries =
      entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries;
    if (!this.open) this.unread++;
  }

  private toggle() {
    this.open = !this.open;
    if (this.open) {
      this.unread = 0;
      document.addEventListener("pointerdown", this.onOutsidePointer, true);
      document.addEventListener("keydown", this.onKeyDown);
    } else {
      this.stopListening();
    }
  }

  private close() {
    if (!this.open) return;
    this.open = false;
    this.stopListening();
  }

  private stopListening() {
    document.removeEventListener("pointerdown", this.onOutsidePointer, true);
    document.removeEventListener("keydown", this.onKeyDown);
  }

  private onOutsidePointer = (e: PointerEvent) => {
    if (!this.contains(e.target as Node)) this.close();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close();
  };

  private category(type: MessageType): MessageCategory {
    return MESSAGE_TYPE_CATEGORIES[type] ?? MessageCategory.CHAT;
  }

  private ago(createdAt: Tick): string {
    const seconds = Math.max(
      0,
      Math.floor((this.game.ticks() - createdAt) / 10),
    );
    if (seconds < 10) return translateText("event_history.just_now");
    if (seconds < 60) {
      return translateText("event_history.seconds_ago", { n: seconds });
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return translateText("event_history.minutes_ago", { n: minutes });
    }
    return translateText("event_history.hours_ago", {
      n: Math.floor(minutes / 60),
    });
  }

  private focusOn(event: HistoryEntryEvent) {
    if (event.focusID !== undefined) {
      const player = this.game.playerBySmallID(event.focusID);
      if (player.isPlayer()) this.eventBus.emit(new GoToPlayerEvent(player));
    } else if (event.unitView?.isActive()) {
      this.eventBus.emit(new GoToUnitEvent(event.unitView));
    }
  }

  private renderEntry(entry: HistoryEntry) {
    const event = entry.event;
    const color = CATEGORY_COLORS[this.category(event.type)];
    const canFocus =
      event.focusID !== undefined || event.unitView?.isActive() === true;
    const body = html`
      <span class="event-history-text"
        >${event.unsafe
          ? unsafeHTML(onlyImages(event.description))
          : event.description}</span
      >
      <span class="event-history-time">${this.ago(event.createdAt)}</span>
    `;
    return html`<li style="--stripe: ${color}">
      ${canFocus
        ? html`<button
            type="button"
            class="event-history-entry is-focusable"
            @click=${() => this.focusOn(event)}
          >
            ${body}
          </button>`
        : html`<div class="event-history-entry">${body}</div>`}
    </li>`;
  }

  private renderPanel() {
    const shown = this.entries
      .filter(
        (e) =>
          this.filter === "all" || this.category(e.event.type) === this.filter,
      )
      .reverse();
    return html`<section
      class="event-history-panel"
      role="dialog"
      aria-label=${translateText("event_history.title")}
    >
      <header>
        <h2>${translateText("event_history.title")}</h2>
        <button
          type="button"
          class="event-history-close"
          aria-label=${translateText("common.close")}
          @click=${() => this.close()}
        >
          ×
        </button>
      </header>
      <div class="event-history-filters" role="tablist">
        ${FILTERS.map(
          (f) =>
            html`<button
              type="button"
              role="tab"
              aria-selected=${this.filter === f}
              class=${this.filter === f ? "is-active" : ""}
              @click=${() => (this.filter = f)}
            >
              ${translateText(FILTER_KEYS[f])}
            </button>`,
        )}
      </div>
      ${shown.length === 0
        ? html`<p class="event-history-empty">
            ${translateText("event_history.empty")}
          </p>`
        : html`<ol>
            ${shown.map((e) => this.renderEntry(e))}
          </ol>`}
    </section>`;
  }

  render() {
    if (this.game === undefined) return nothing;
    const badge = this.unread > 99 ? "99+" : String(this.unread);
    return html`
      ${styles}
      <button
        type="button"
        class="event-history-bell ${this.open ? "is-open" : ""}"
        title=${translateText("event_history.title")}
        aria-label=${translateText("event_history.title")}
        aria-expanded=${this.open}
        @click=${() => this.toggle()}
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        ${bellIcon}
        ${this.unread > 0
          ? html`<span class="event-history-badge">${badge}</span>`
          : nothing}
      </button>
      ${this.open ? this.renderPanel() : nothing}
    `;
  }
}
