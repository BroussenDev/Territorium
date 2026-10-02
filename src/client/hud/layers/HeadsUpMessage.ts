import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../../../core/AssetUrls";
import { GameMode, GameType, RankedType } from "../../../core/game/Game";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import {
  CAPITAL_SHIELD_RADIUS,
  capitalRebuildTicksLeft,
  capitalShieldSecondsLeft,
  hasCapital,
} from "../../../core/game/NationsMode";
import { Controller } from "../../Controller";
import { translateText } from "../../Utils";
import { GameView } from "../../view";

const COLLUSION_WARNING_CLOSED_KEY = "hasClosedCollusionWarning";

@customElement("heads-up-message")
export class HeadsUpMessage extends LitElement implements Controller {
  public game: GameView;

  @state()
  private isVisible = false;

  @state()
  private hasClosedCollusionWarning =
    localStorage.getItem(COLLUSION_WARNING_CLOSED_KEY) !== null;

  @state()
  private isPaused = false;

  @state()
  private isImmunityActive = false;

  @state()
  private isCatchingUp = false;
  private catchingUpTicks = 0;

  @state()
  private isOvertimeNotice = false;
  // Nations mode: seconds before the player may proclaim a new capital
  // (0 = now), or null while they hold one.
  @state()
  private capitalLostWait: number | null = null;
  // Nations mode: seconds left of the shield around every capital, or 0.
  @state()
  private capitalShieldLeft = 0;

  private static readonly CATCHING_UP_SHOW_THRESHOLD = 10;
  // How long the overtime announcement banner stays up after the start minute.
  private static readonly OVERTIME_NOTICE_SECONDS = 5;

  @state()
  private toastMessage: string | import("lit").TemplateResult | null = null;
  @state()
  private toastColor: "green" | "red" = "green";
  private toastTimeout: number | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener(
      "show-message",
      this.handleShowMessage as EventListener,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(
      "show-message",
      this.handleShowMessage as EventListener,
    );
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  private handleShowMessage = (event: CustomEvent) => {
    const { message, duration, color } = event.detail ?? {};
    if (
      typeof message === "string" ||
      (message && typeof message.values === "object")
    ) {
      this.toastMessage = message;
      this.toastColor = color === "red" ? "red" : "green";
      this.requestUpdate();
      if (this.toastTimeout) {
        clearTimeout(this.toastTimeout);
      }
      this.toastTimeout = window.setTimeout(
        () => {
          this.toastMessage = null;
          this.requestUpdate();
        },
        typeof duration === "number" ? (duration ?? 2000) : 2000,
      );
    }
  };

  init() {
    this.isVisible = true;
    this.requestUpdate();
  }

  tick() {
    const updates = this.game.updatesSinceLastTick();
    const pauseUpdates = updates?.[GameUpdateType.GamePaused];
    if (pauseUpdates && pauseUpdates.length > 0) {
      this.isPaused = pauseUpdates[pauseUpdates.length - 1].paused;
    }

    const showImmunityHudDuration = 10 * 10;
    const spawnEnd = this.game.config().numSpawnPhaseTurns();
    const ticksSinceSpawnEnd = this.game.ticks() - spawnEnd;

    this.isImmunityActive =
      this.game.config().hasExtendedSpawnImmunity() &&
      !this.game.inSpawnPhase() &&
      this.game.isSpawnImmunityActive() &&
      ticksSinceSpawnEnd < showImmunityHudDuration;

    const currentlyCatchingUp =
      !this.game.config().isReplay() && this.game.isCatchingUp();

    if (currentlyCatchingUp) {
      this.catchingUpTicks++;
    } else {
      this.catchingUpTicks = 0;
    }

    this.isCatchingUp =
      this.catchingUpTicks >= HeadsUpMessage.CATCHING_UP_SHOW_THRESHOLD;

    // Announce overtime in this banner (not the toast, which is a brief
    // notification slot). Window-based rather than a fired-once flag, so a
    // late joiner or replay seek doesn't get a stale announcement long after
    // the start minute.
    const overtime = this.game.config().overtimeConfig();
    const overtimeStart = overtime.startMinutes * 60;
    const elapsed = this.game.elapsedGameSeconds();
    this.isOvertimeNotice =
      overtime.enabled &&
      !this.game.inSpawnPhase() &&
      elapsed >= overtimeStart &&
      elapsed < overtimeStart + HeadsUpMessage.OVERTIME_NOTICE_SECONDS;

    const me = this.game.myPlayer();
    this.capitalLostWait =
      this.game.config().isNationsMode() &&
      !this.game.inSpawnPhase() &&
      me !== null &&
      me.isAlive() &&
      !hasCapital(me)
        ? Math.ceil(
            (capitalRebuildTicksLeft(me.capitalLostTick(), this.game.ticks()) *
              this.game.config().msPerTick()) /
              1000,
          )
        : null;
    this.capitalShieldLeft = this.game.inSpawnPhase()
      ? 0
      : Math.ceil(capitalShieldSecondsLeft(this.game));

    this.isVisible =
      this.game.inSpawnPhase() ||
      this.isPaused ||
      this.isImmunityActive ||
      this.isCatchingUp ||
      this.isOvertimeNotice;
    this.requestUpdate();
  }

  private getMessage(): string {
    if (this.isCatchingUp) {
      return translateText("heads_up_message.catching_up");
    }
    if (this.isPaused) {
      if (this.game.config().gameConfig().gameType === GameType.Singleplayer) {
        return translateText("heads_up_message.singleplayer_game_paused");
      } else {
        return translateText("heads_up_message.multiplayer_game_paused");
      }
    }
    if (this.isImmunityActive) {
      return translateText("heads_up_message.pvp_immunity_active", {
        seconds: Math.round(this.game.config().spawnImmunityDuration() / 10),
      });
    }
    if (this.isOvertimeNotice) {
      return translateText("overtime.started");
    }
    // Nations players start in their country: there is no spawn to choose.
    if (this.game.config().isNationsMode()) {
      return translateText("heads_up_message.nations_spawn");
    }
    const spectating =
      this.game.config().isReplay() ||
      this.game.config().isIntentionalSpectator();
    // Versus players may only spawn in their team's zone, left bright on
    // the map.
    if (this.game.config().isVersusMode() && !spectating) {
      return translateText("heads_up_message.versus_spawn");
    }
    if (spectating) {
      return this.game.config().isRandomSpawn()
        ? translateText("heads_up_message.random_spawn_spectator")
        : translateText("heads_up_message.choose_spawn_spectator");
    }
    return this.game.config().isRandomSpawn()
      ? translateText("heads_up_message.random_spawn")
      : translateText("heads_up_message.choose_spawn");
  }

  private onCloseCollusionWarning = (): void => {
    localStorage.setItem(COLLUSION_WARNING_CLOSED_KEY, "true");
    this.hasClosedCollusionWarning = true;
    this.requestUpdate();
  };

  render() {
    return html`
      <div style="pointer-events: none;">
        ${this.toastMessage
          ? html`
              <div
                class="fixed top-6 left-1/2 -translate-x-1/2 z-[1002] px-5 py-3 rounded-md border border-white/10 border-l-4 bg-plate-900/95 text-white shadow-[0_18px_40px_-18px_rgb(0_0_0/0.9)] transition-all duration-300 animate-fade-in-out ${this
                  .toastColor === "red"
                  ? "border-l-red-500"
                  : "border-l-brand"}"
                style="max-width: 90vw; min-width: 200px; text-align: center;"
                @contextmenu=${(e: MouseEvent) => e.preventDefault()}
              >
                ${typeof this.toastMessage === "string"
                  ? html`<span class="font-medium">${this.toastMessage}</span>`
                  : this.toastMessage}
              </div>
            `
          : null}
        ${this.isVisible
          ? html`
              <div
                class="fixed top-[15%] left-1/2 -translate-x-1/2 z-[799]
                            inline-flex items-center justify-center min-h-8 lg:min-h-10
                            w-fit max-w-[90vw]
                            bg-plate-900/85 border border-white/10 rounded-md
                            backdrop-blur-xs font-display text-white text-md lg:text-xl px-3 lg:px-4 py-1
                            text-center break-words"
                style="word-wrap: break-word; hyphens: auto;"
                @contextmenu=${(e: MouseEvent) => e.preventDefault()}
              >
                ${this.getMessage()}
              </div>
            `
          : null}
        ${this.capitalLostWait !== null
          ? html`
              <div
                class="fixed top-[8%] left-1/2 -translate-x-1/2 z-[798]
                            flex flex-col items-center w-fit max-w-[90vw]
                            bg-red-900/75 border border-amber-400/60 rounded-md lg:rounded-lg
                            backdrop-blur-xs text-white px-3 lg:px-4 py-1.5 text-center"
                @contextmenu=${(e: MouseEvent) => e.preventDefault()}
              >
                <div class="text-sm lg:text-base font-semibold">
                  👑 ${translateText("heads_up_message.capital_lost")}
                </div>
                <div class="text-xs lg:text-sm text-amber-200">
                  ${this.capitalLostWait > 0
                    ? translateText("heads_up_message.capital_lost_wait", {
                        time: formatWait(this.capitalLostWait),
                      })
                    : translateText("heads_up_message.capital_lost_ready")}
                </div>
              </div>
            `
          : null}
        ${this.capitalShieldLeft > 0 && this.capitalLostWait === null
          ? html`
              <div
                class="fixed top-[8%] left-1/2 -translate-x-1/2 z-[798]
                            flex items-center gap-2.5 w-fit max-w-[90vw]
                            bg-sky-950/80 border border-sky-300/50 rounded-md lg:rounded-lg
                            backdrop-blur-xs text-white pl-2 pr-3 lg:pr-4 py-1.5"
                @contextmenu=${(e: MouseEvent) => e.preventDefault()}
              >
                <img
                  src=${assetUrl("images/CapitalShieldIcon.svg")}
                  alt=""
                  class="size-8 lg:size-10 shrink-0 drop-shadow"
                />
                <div class="flex flex-col text-left">
                  <div class="text-sm lg:text-base font-semibold">
                    ${translateText("heads_up_message.capital_shield", {
                      radius: CAPITAL_SHIELD_RADIUS,
                    })}
                  </div>
                  <div class="text-xs lg:text-sm text-sky-200 tabular-nums">
                    ${translateText("heads_up_message.capital_shield_ends", {
                      time: formatWait(this.capitalShieldLeft),
                    })}
                  </div>
                </div>
              </div>
            `
          : null}
        ${this.game?.inSpawnPhase() &&
        !this.game.config().isReplay() &&
        !this.game.config().isIntentionalSpectator() &&
        this.game.config().gameConfig().rankedType !== RankedType.OneVOne &&
        this.game.config().gameConfig().gameMode === GameMode.FFA &&
        this.game.config().gameConfig().gameType === GameType.Public &&
        !this.hasClosedCollusionWarning
          ? html`
              <div
                class="fixed top-[25%] left-1/2 -translate-x-1/2 z-[799]
                            inline-flex flex-col items-center justify-center min-h-8 lg:min-h-10
                            w-fit max-w-[90vw]
                            bg-amber-500/70 rounded-md lg:rounded-lg
                            backdrop-blur-xs text-white text-md lg:text-xl px-3 lg:px-4 py-3
                            text-center break-words"
                style="word-wrap: break-word; hyphens: auto; pointer-events: auto;"
                @contextmenu=${(e: MouseEvent) => e.preventDefault()}
              >
                <div>${translateText("heads_up_message.ffa_collusion")}</div>
                <button
                  class="mt-2 px-3 py-1 rounded bg-black/20 hover:bg-black/30 text-sm"
                  @click=${this.onCloseCollusionWarning}
                >
                  ${translateText("heads_up_message.dont_show_again")}
                </button>
              </div>
            `
          : null}
      </div>
    `;
  }
}

function formatWait(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
