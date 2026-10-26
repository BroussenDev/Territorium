import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import { Controller } from "../../Controller";
import { ReplaySpeedChangeEvent } from "../../InputHandler";
import { ReplayProgressEvent, ReplaySeekEvent } from "../../ReplaySeek";
import {
  defaultReplaySpeedMultiplier,
  ReplaySpeedMultiplier,
} from "../../utilities/ReplaySpeedMultiplier";
import { translateText } from "../../Utils";
import { GameView } from "../../view";

export class ShowReplayPanelEvent {
  constructor(
    public visible: boolean = true,
    public isSingleplayer: boolean = false,
  ) {}
}

@customElement("replay-panel")
export class ReplayPanel extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;

  @property({ type: Boolean })
  visible: boolean = false;

  @state()
  private _replaySpeedMultiplier: number = defaultReplaySpeedMultiplier;

  @property({ type: Boolean })
  isSingleplayer = false;

  // A replay's position (LocalServer's ReplayProgressEvent), and the turn
  // under the thumb while it is dragged.
  @state() private turn = 0;
  @state() private total = 0;
  @state() private seekingTo: number | null = null;
  @state() private dragging: number | null = null;

  createRenderRoot() {
    return this; // Enable Tailwind CSS
  }

  init() {
    // A replay opens with its timeline shown.
    if (this.game?.config()?.isReplay()) this.visible = true;
    if (this.eventBus) {
      this.eventBus.on(ShowReplayPanelEvent, (event: ShowReplayPanelEvent) => {
        this.visible = event.visible;
        this.isSingleplayer = event.isSingleplayer;
      });
      this.eventBus.on(ReplayProgressEvent, (event: ReplayProgressEvent) => {
        this.turn = event.turn;
        this.total = event.total;
        this.seekingTo = event.seekingTo;
      });
      this.eventBus.on(
        ReplaySpeedChangeEvent,
        (event: ReplaySpeedChangeEvent) => {
          this._replaySpeedMultiplier = event.replaySpeedMultiplier;
          this.requestUpdate();
        },
      );
    }
  }

  getTickIntervalMs() {
    return 1000;
  }

  tick() {
    if (!this.visible) return;
    this.requestUpdate();
  }

  private seek(turn: number) {
    this.dragging = null;
    this.eventBus?.emit(new ReplaySeekEvent(turn));
  }

  // Ten turns a second: a turn as m:ss (h:mm:ss past an hour).
  private clock(turn: number): string {
    const total = Math.floor(turn / 10);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = String(total % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
  }

  // The replay's timeline: where it stands, how long it lasts; dragging or
  // clicking jumps there (backward starts over from that moment).
  private renderTimeline() {
    if (!this.game?.config()?.isReplay() || this.total === 0) return html``;
    const shown = this.dragging ?? this.turn;
    const step = (turns: number) => () =>
      this.seek(Math.max(0, Math.min(this.total, this.turn + turns)));
    return html`
      <div class="mb-3 flex flex-col gap-1.5">
        <div class="flex items-center justify-between text-xs text-white/70">
          <span class="font-mono" translate="no"
            >${this.clock(shown)} / ${this.clock(this.total)}</span
          >
          ${this.seekingTo !== null
            ? html`<span class="text-emerald-300"
                >${translateText("replay_panel.seeking", {
                  time: this.clock(this.seekingTo),
                })}</span
              >`
            : html``}
        </div>
        <input
          type="range"
          class="replay-timeline w-full accent-emerald-400 cursor-pointer"
          min="0"
          max=${this.total}
          step="1"
          .value=${String(shown)}
          aria-label=${translateText("replay_panel.timeline")}
          @input=${(e: Event) =>
            (this.dragging = Number((e.target as HTMLInputElement).value))}
          @change=${(e: Event) =>
            this.seek(Number((e.target as HTMLInputElement).value))}
        />
        <div class="grid grid-cols-4 gap-2">
          ${[
            [-600, "−1 min"],
            [-100, "−10 s"],
            [100, "+10 s"],
            [600, "+1 min"],
          ].map(
            ([turns, label]) =>
              html`<button
                class="py-0.5 px-1 text-xs text-white rounded-sm border transition border-plate-500 hover:border-white/70"
                translate="no"
                @click=${step(turns as number)}
              >
                ${label}
              </button>`,
          )}
        </div>
      </div>
    `;
  }

  onReplaySpeedChange(value: ReplaySpeedMultiplier) {
    this._replaySpeedMultiplier = value;
    this.eventBus?.emit(new ReplaySpeedChangeEvent(value));
  }

  render() {
    if (!this.visible) return html``;

    return html`
      <div
        class="p-2 bg-plate-800/92 backdrop-blur-sm shadow-xs rounded-l-lg"
        @contextmenu=${(e: Event) => e.preventDefault()}
      >
        ${this.renderTimeline()}
        <label class="block mb-2 text-white" translate="no">
          ${this.game?.config()?.isReplay()
            ? translateText("replay_panel.replay_speed")
            : translateText("replay_panel.game_speed")}
        </label>
        <div class="grid grid-cols-4 gap-2">
          ${this.renderSpeedButton(ReplaySpeedMultiplier.slow, "×0.5")}
          ${this.renderSpeedButton(ReplaySpeedMultiplier.normal, "×1")}
          ${this.renderSpeedButton(ReplaySpeedMultiplier.fast, "×2")}
          ${this.renderSpeedButton(
            ReplaySpeedMultiplier.fastest,
            translateText("replay_panel.fastest_game_speed"),
          )}
        </div>
      </div>
    `;
  }

  private renderSpeedButton(value: ReplaySpeedMultiplier, label: string) {
    const backgroundColor =
      this._replaySpeedMultiplier === value ? "bg-brand" : "";

    return html`
      <button
        class="py-0.5 px-1 text-sm text-white rounded-sm border transition border-plate-500 ${backgroundColor} hover:border-white/70"
        @click=${() => this.onReplaySpeedChange(value)}
      >
        ${label}
      </button>
    `;
  }
}
