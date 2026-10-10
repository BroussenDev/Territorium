import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { keyed } from "lit/directives/keyed.js";
import { assetUrl } from "../../../core/AssetUrls";
import { EventBus } from "../../../core/EventBus";
import { ClientID } from "../../../core/Schemas";
import { Config } from "../../../core/configuration/Config";
import { GameMode, GameType, Gold } from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import {
  OBJECTIVE_GOLD_PER_TICK,
  OBJECTIVE_TROOP_GROWTH_PERCENT,
  objectiveBonusCap,
} from "../../../core/game/Objectives";
import {
  USER_SETTINGS_CHANGED_EVENT,
  UserSettings,
} from "../../../core/game/UserSettings";
import { Controller } from "../../Controller";
import { AttackRatioEvent } from "../../InputHandler";
import { UIState } from "../../UIState";
import {
  getGamesPlayed,
  renderNumber,
  renderTroops,
  translateText,
} from "../../Utils";
import { GameView } from "../../view";
import { PlayerView } from "../../view/PlayerView";
import { goldCoinIcon, soldierIcon } from "../HotbarIcons";
import { TutorialHighlight, TutorialHighlightEvent } from "../Tutorial";
const swordIcon = assetUrl("images/SwordIcon.svg");

@customElement("control-panel")
export class ControlPanel extends LitElement implements Controller {
  public game: GameView;
  public clientID: ClientID;
  public eventBus: EventBus;
  public uiState: UIState;

  @state()
  private attackRatio: number = 0.2;

  @state()
  private _maxTroops: number;

  @state()
  private troopRate: number;

  @state()
  private _troops: number;

  @state()
  private _isVisible = false;

  @state()
  private _notification: { type: "warning" | "info"; message: string } | null =
    null;

  @state()
  private _gold: Gold;

  @state()
  private _attackingTroops: number = 0;

  @state()
  private _goldGain: bigint | null = null;
  @state()
  private _goldGainPulseId: number = 0;
  private _goldGainTimeoutId: ReturnType<typeof setTimeout> | null = null;

  @state()
  private _objectivesHeld = 0;
  @state()
  private _objectivesRewarded = 0;
  @state()
  private _objectivesTotal = 0;
  // Seconds before the objectives appear, null once they have (or when the
  // game has none).
  private _objectivesRevealIn: number | null = null;

  @state()
  private _tutorialHighlight: TutorialHighlight | null = null;

  private _troopRateIsIncreasing: boolean = true;

  private _lastTroopIncreaseRate: number;

  // Border detection cache
  private _nearbyPlayerIDs: Set<number> = new Set();
  private _borderRefreshCounter: number = 0;
  private _borderTilesPromise: Promise<void> | null = null;
  // Track last attack tick per target player (for 15-second threshold)
  private _lastAttackTickByTarget: Map<number, number> = new Map();
  private static readonly BORDER_REFRESH_INTERVAL = 10; // recompute every 1s
  private static readonly ATTACK_THRESHOLD_TICKS = 15 * 10; // 15 seconds

  connectedCallback() {
    super.connectedCallback();
    // The attack ratio is cached below for the lifetime of the game, but the
    // settings modal is now reachable mid-match, so follow the stored value
    // when it changes there. (This panel's own slider is session-only: it
    // never writes UserSettings, so there is no loop.)
    globalThis.addEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:settings.attackRatio`,
      this.onAttackRatioSettingChanged,
    );
  }

  init() {
    this.attackRatio = new UserSettings().attackRatio();
    this.uiState.attackRatio = this.attackRatio;
    this.eventBus.on(TutorialHighlightEvent, (e) => {
      this._tutorialHighlight = e.target;
    });
    this.eventBus.on(AttackRatioEvent, (event) => {
      let newAttackRatio = this.attackRatio + event.attackRatio / 100;

      if (newAttackRatio < 0.01) {
        newAttackRatio = 0.01;
      }

      if (newAttackRatio > 1) {
        newAttackRatio = 1;
      }

      if (newAttackRatio === 0.11 && this.attackRatio === 0.01) {
        // If we're changing the ratio from 1%, then set it to 10% instead of 11% to keep a consistency
        newAttackRatio = 0.1;
      }

      this.attackRatio = newAttackRatio;
      this.onAttackRatioChange(this.attackRatio);
    });
  }

  tick() {
    if (!this._isVisible && !this.game.inSpawnPhase()) {
      this.setVisibile(true);
    }

    const player = this.game.myPlayer();
    if (player === null || !player.isAlive()) {
      this.setVisibile(false);
      return;
    }

    this.updateTroopIncrease();

    const config = this.game.config();
    this._maxTroops = config.maxTroops(player);
    this._gold = player.gold();
    this._troops = player.troops();
    this._attackingTroops = player
      .outgoingAttacks()
      .map((a) => a.troops)
      .reduce((a, b) => a + b, 0);
    this.troopRate = config.troopIncreaseRate(player) * 10;
    this._objectivesTotal = this.game.objectives().length;
    this._objectivesRevealIn =
      this._objectivesTotal === 0 && config.objectives()
        ? Math.max(
            0,
            Math.ceil(
              config.objectiveRevealDelay() / 10 -
                this.game.elapsedGameSeconds(),
            ),
          )
        : null;
    this._objectivesHeld = player.objectivesHeld();
    this._objectivesRewarded = player.objectivesRewarded();

    const helpEnabled = new UserSettings().helpMessages();

    // Don't target veteran players
    if (helpEnabled && getGamesPlayed() < 20) {
      // Track outgoing attacks for 15-second threshold
      this.trackOutgoingAttacks(player);

      // Refresh border detection cache periodically
      this.refreshNearbyPlayers(player);

      // Compute notification
      this._notification = this.computeNotification(player, config);
    }

    const updates = this.game.updatesSinceLastTick();
    if (updates) {
      const myID = player.id();
      const bonusEvents = updates[GameUpdateType.BonusEvent];
      if (bonusEvents) {
        for (const ev of bonusEvents) {
          if (ev.player === myID && ev.gold > 0) {
            this.addGoldGain(BigInt(ev.gold));
          }
        }
      }
      const conquestEvents = updates[GameUpdateType.ConquestEvent];
      if (conquestEvents) {
        for (const ev of conquestEvents) {
          if (ev.conquerorId === myID && ev.gold > 0n) {
            this.addGoldGain(ev.gold);
          }
        }
      }
      const donateEvents = updates[GameUpdateType.DonateEvent];
      if (donateEvents) {
        for (const ev of donateEvents) {
          if (
            ev.donationType === "gold" &&
            ev.recipientId === myID &&
            ev.amount > 0n
          ) {
            this.addGoldGain(ev.amount);
          }
        }
      }
    }

    this.requestUpdate();
  }

  // Last-wins: when multiple gold events arrive in one tick, the pip shows
  // only the most recent amount (not a sum) — each gain restarts the pulse.
  private addGoldGain(amount: bigint) {
    this._goldGain = amount;
    this._goldGainPulseId++;
    if (this._goldGainTimeoutId !== null) {
      clearTimeout(this._goldGainTimeoutId);
    }
    this._goldGainTimeoutId = setTimeout(() => {
      this._goldGain = null;
      this._goldGainTimeoutId = null;
      this.requestUpdate();
    }, 2000);
  }

  private trackOutgoingAttacks(player: PlayerView) {
    const currentTick = this.game.ticks();
    for (const attack of player.outgoingAttacks()) {
      if (attack.targetID !== 0 && !attack.retreating) {
        this._lastAttackTickByTarget.set(attack.targetID, currentTick);
      }
    }
    // Clean up old entries
    for (const [playerID, tick] of this._lastAttackTickByTarget.entries()) {
      if (currentTick - tick > ControlPanel.ATTACK_THRESHOLD_TICKS * 2) {
        this._lastAttackTickByTarget.delete(playerID);
      }
    }
  }

  private refreshNearbyPlayers(player: PlayerView) {
    this._borderRefreshCounter++;
    if (
      this._borderRefreshCounter < ControlPanel.BORDER_REFRESH_INTERVAL ||
      this._borderTilesPromise !== null
    ) {
      return;
    }
    this._borderRefreshCounter = 0;
    this._borderTilesPromise = player.borderTiles().then((bt) => {
      this._borderTilesPromise = null;
      const myID = player.smallID();
      const nearby = new Set<number>();
      for (const tile of bt.borderTiles) {
        for (const neighbor of this.game.neighbors(tile as TileRef)) {
          const ownerID = this.game.ownerID(neighbor);
          if (ownerID !== 0 && ownerID !== myID) {
            nearby.add(ownerID);
          }
        }
      }
      this._nearbyPlayerIDs = nearby;
    });
  }

  private computeNotification(
    player: PlayerView,
    config: Config,
  ): { type: "warning" | "info"; message: string } | null {
    const currentTick = this.game.ticks();

    // Army limit warning
    const { gameMode, gameType } = config.gameConfig();
    const isPublicTeamGame =
      gameMode === GameMode.Team && gameType === GameType.Public;
    const canDonateTroops = config.donateTroops();
    if (isPublicTeamGame && canDonateTroops) {
      const ratio = this._troops / Math.max(this._maxTroops, 1);
      if (ratio >= config.armyLimitWarningThreshold()) {
        return {
          type: "warning",
          message: "control_panel.army_limit_warning",
        };
      }
    }

    // Low troops (Less than 1k) warning
    if (this._troops < 10000 && this._troops > 0) {
      return { type: "warning", message: "control_panel.low_troops_warning" };
    }

    // Info messages: check nearby players for traitors, AFK allies, AFK teammates
    for (const nearbyID of this._nearbyPlayerIDs) {
      let other;
      try {
        other = this.game.playerBySmallID(nearbyID);
      } catch {
        continue;
      }
      if (!other.isPlayer() || !other.isAlive()) continue;

      const lastAttackTick = this._lastAttackTickByTarget.get(nearbyID) ?? -1;
      const secondsSinceAttack = (currentTick - lastAttackTick) / 10;
      const hasNotAttackedRecently =
        lastAttackTick < 0 || secondsSinceAttack > 15;

      if (!hasNotAttackedRecently) continue;

      if (other.isTraitor() && player.isAlliedWith(other)) {
        return { type: "info", message: "control_panel.traitor_neighbor_info" };
      }
      if (other.isDisconnected() && player.isAlliedWith(other)) {
        return {
          type: "info",
          message: "control_panel.allied_afk_neighbor_info",
        };
      }
      if (other.isDisconnected() && player.isOnSameTeam(other)) {
        return {
          type: "info",
          message: "control_panel.teammate_afk_neighbor_info",
        };
      }
    }

    return null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    globalThis.removeEventListener(
      `${USER_SETTINGS_CHANGED_EVENT}:settings.attackRatio`,
      this.onAttackRatioSettingChanged,
    );
    if (this._goldGainTimeoutId !== null) {
      clearTimeout(this._goldGainTimeoutId);
      this._goldGainTimeoutId = null;
    }
  }

  private updateTroopIncrease() {
    const player = this.game?.myPlayer();
    if (player === null) return;
    const troopIncreaseRate = this.game.config().troopIncreaseRate(player);
    this._troopRateIsIncreasing =
      troopIncreaseRate >= this._lastTroopIncreaseRate;
    this._lastTroopIncreaseRate = troopIncreaseRate;
  }

  onAttackRatioChange(newRatio: number) {
    // The element outlives any one game; uiState only exists once init() ran.
    // Before that (the hidden slider on the lobby page) this.attackRatio holds
    // the value, and init() reloads it from UserSettings anyway.
    if (this.uiState === undefined) return;
    this.uiState.attackRatio = newRatio;
  }

  private onAttackRatioSettingChanged = () => {
    if (this.uiState === undefined) return;
    this.attackRatio = new UserSettings().attackRatio();
    this.onAttackRatioChange(this.attackRatio);
    this.requestUpdate();
  };

  setVisibile(visible: boolean) {
    this._isVisible = visible;
    this.requestUpdate();
  }

  private handleRatioSliderInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const value = Number(input.value);
    this.attackRatio = value / 100;
    this.onAttackRatioChange(this.attackRatio);
  }

  private handleRatioSliderPointerUp(e: Event) {
    (e.target as HTMLInputElement).blur();
  }

  private calculateTroopBar(): { greenPercent: number; orangePercent: number } {
    const base = Math.max(this._maxTroops, 1);
    const greenPercentRaw = (this._troops / base) * 100;
    const orangePercentRaw = (this._attackingTroops / base) * 100;

    const greenPercent = Math.max(0, Math.min(100, greenPercentRaw));
    const orangePercent = Math.max(
      0,
      Math.min(100 - greenPercent, orangePercentRaw),
    );

    return { greenPercent, orangePercent };
  }

  /**
   * Troops as a row of claimed tiles: solid emerald for troops at home,
   * pale for troops away attacking, empty cells for room left to grow.
   */
  private renderTileGauge(heightClass: string) {
    const { greenPercent, orangePercent } = this.calculateTroopBar();
    return html`
      <div class="tile-gauge relative w-full ${heightClass}" aria-hidden="true">
        <div class="absolute inset-0 bg-white/[0.09]"></div>
        <div
          class="absolute inset-y-0 left-0 w-full origin-left bg-brand-bright transition-transform duration-200 ease-out"
          style="transform: scaleX(${greenPercent / 100});"
        ></div>
        <div
          class="absolute inset-y-0 left-0 w-full origin-left bg-brand-bright/35 transition-transform duration-200 ease-out"
          style="transform: translateX(${greenPercent}%) scaleX(${orangePercent /
          100});"
        ></div>
      </div>
    `;
  }

  private renderTroopRate(sizeClass: string) {
    return html`<span
      class="shrink-0 rounded-sm px-1.5 py-0.5 font-bold leading-none tabular-nums ${sizeClass} ${this.tutorialHighlightClass(
        "troop_rate",
      )} ${this._troopRateIsIncreasing
        ? "bg-brand/15 text-brand-bright"
        : "bg-orange-500/15 text-orange-300"}"
      translate="no"
      >+${renderTroops(this.troopRate)}/s</span
    >`;
  }

  private renderGold(sizeClass: string) {
    return html`<div
      class="relative flex shrink-0 items-center gap-1.5 rounded-md border border-capital/40 bg-capital/10 px-2 py-1 font-display font-bold leading-none tabular-nums text-capital-light ${sizeClass} ${this.tutorialHighlightClass(
        "gold",
      )}"
      translate="no"
    >
      ${this._goldGain !== null
        ? keyed(
            this._goldGainPulseId,
            html`<span
              class="gold-gain-pop absolute -top-5 right-1 text-brand-bright text-sm font-extrabold tabular-nums whitespace-nowrap pointer-events-none drop-shadow-[0_2px_3px_rgba(0,0,0,0.9)]"
              >+${renderNumber(this._goldGain)}</span
            >`,
          )
        : ""}
      <img src=${goldCoinIcon} width="14" height="14" class="shrink-0" />
      <span>${renderNumber(this._gold)}</span>
    </div>`;
  }

  private renderRatioSlider(extraClass: string) {
    const percent = Math.round(this.attackRatio * 100);
    return html`<input
      type="range"
      min="1"
      max="100"
      aria-label=${translateText("user_setting.attack_ratio_label")}
      .value=${String(percent)}
      style="--val: ${percent}%"
      @input=${(e: Event) => this.handleRatioSliderInput(e)}
      @pointerup=${(e: Event) => this.handleRatioSliderPointerUp(e)}
      class="tr-range min-w-0 ${extraClass}"
    />`;
  }

  private tutorialHighlightClass(target: TutorialHighlight): string {
    return this._tutorialHighlight === target ? "tutorial-highlight" : "";
  }

  private renderNotification() {
    if (!this._notification) return html``;
    const isWarning = this._notification.type === "warning";
    return html`
      <div
        class="flex items-center gap-2 px-2 py-1 rounded-sm border-l-2 text-xs font-medium mb-2 ${isWarning
          ? "border-orange-400 bg-orange-400/10 text-orange-200"
          : "border-brand-bright bg-brand/10 text-emerald-200"}"
      >
        <span
          class="size-1.5 shrink-0 rounded-[1px] bg-current"
          aria-hidden="true"
        ></span>
        <span>${translateText(this._notification.message)}</span>
      </div>
    `;
  }

  /** Map objectives held and their bonus; only when the game has them. */
  private renderObjectives() {
    if (this._objectivesRevealIn !== null) {
      return html`<div
        class="flex items-center gap-1.5 px-1.5 py-0.5 mb-1 rounded-md border border-plate-600 text-xs font-medium text-white/70 ${this.tutorialHighlightClass(
          "objectives",
        )}"
      >
        <span aria-hidden="true">◆</span>
        <span>${this.objectivesRevealText()}</span>
      </div>`;
    }
    if (this._objectivesTotal === 0) return html``;
    const held = this._objectivesHeld;
    return html`
      <div
        title=${this.objectivesHint()}
        class="flex items-center gap-1.5 px-1.5 py-0.5 mb-1 rounded-md border text-xs font-medium ${this.tutorialHighlightClass(
          "objectives",
        )} ${held > 0
          ? "border-amber-300/60 bg-amber-300/10 text-amber-200"
          : "border-plate-600 text-white/70"}"
      >
        <span aria-hidden="true">◆</span>
        <span
          >${translateText("objectives.held", {
            held,
            total: this._objectivesTotal,
          })}</span
        >
        ${held > 0
          ? html`<span class="ml-auto tabular-nums"
              >${this.objectivesBonus()}</span
            >`
          : ""}
      </div>
    `;
  }

  /** The desktop's objectives chip, beside the attack slider. */
  private renderObjectivesChip() {
    if (this._objectivesRevealIn !== null) {
      return html`<div
        class="objectives-chip flex flex-col justify-center shrink-0 self-stretch px-2 rounded-sm border border-white/10 leading-tight text-white/70 ${this.tutorialHighlightClass(
          "objectives",
        )}"
        translate="no"
      >
        <span class="text-xs font-bold whitespace-nowrap tabular-nums"
          ><span aria-hidden="true">◆</span>
          ${this.objectivesRevealText()}</span
        >
      </div>`;
    }
    if (this._objectivesTotal === 0) return html``;
    const held = this._objectivesHeld;
    return html`
      <div
        title=${this.objectivesHint()}
        class="objectives-chip flex flex-col justify-center shrink-0 self-stretch px-2 rounded-sm border leading-tight ${this.tutorialHighlightClass(
          "objectives",
        )} ${held > 0
          ? "border-amber-300/60 bg-amber-300/10 text-amber-200"
          : "border-plate-600 text-white/70"}"
        translate="no"
      >
        <span class="text-xs font-bold whitespace-nowrap"
          ><span aria-hidden="true">◆</span> ${translateText(
            "objectives.held",
            {
              held,
              total: this._objectivesTotal,
            },
          )}</span
        >
        ${held > 0
          ? html`<span class="text-[10px] tabular-nums whitespace-nowrap"
              >${this.objectivesBonus()}</span
            >`
          : ""}
      </div>
    `;
  }

  /** "Objectives in 0:42", before they appear on the map. */
  private objectivesRevealText(): string {
    const s = this._objectivesRevealIn ?? 0;
    return translateText("objectives.reveal_in", {
      time: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
    });
  }

  private objectivesHint(): string {
    return translateText("objectives.cap_hint", {
      max: objectiveBonusCap(this._objectivesTotal),
    });
  }

  private objectivesBonus(): string {
    const rewarded = this._objectivesRewarded;
    const cap = objectiveBonusCap(this._objectivesTotal);
    return translateText(
      rewarded >= cap ? "objectives.bonus_max" : "objectives.bonus",
      {
        gold: Number(OBJECTIVE_GOLD_PER_TICK) * rewarded,
        troops: OBJECTIVE_TROOP_GROWTH_PERCENT * rewarded,
      },
    );
  }

  private renderDesktop() {
    const committed = (this.game?.myPlayer()?.troops() ?? 0) * this.attackRatio;
    return html`
      ${this.renderNotification()}
      <!-- Troops at home and their capacity, growth, and the treasury. -->
      <div class="flex items-center justify-between gap-3">
        <div class="flex min-w-0 items-center gap-2" translate="no">
          <img
            src=${soldierIcon}
            alt=""
            aria-hidden="true"
            width="18"
            height="18"
            class="shrink-0 brightness-0 invert opacity-75"
          />
          <span
            class="font-display text-xl font-bold leading-none tabular-nums text-white"
            >${renderTroops(this._troops)}</span
          >
          <span
            class="font-display text-sm font-semibold leading-none tabular-nums text-white/45"
            >/ ${renderTroops(this._maxTroops)}</span
          >
          ${this.renderTroopRate("text-xs")}
        </div>
        ${this.renderGold("text-base")}
      </div>
      <div class="mt-2 ${this.tutorialHighlightClass("troops")}">
        ${this.renderTileGauge("h-3")}
      </div>
      <!-- How much of the army each attack takes. -->
      <div
        class="mt-2.5 flex items-center gap-2.5 ${this.tutorialHighlightClass(
          "attack_ratio",
        )}"
        translate="no"
      >
        <img
          src=${swordIcon}
          alt=""
          aria-hidden="true"
          width="14"
          height="14"
          class="shrink-0 brightness-0 invert opacity-75"
        />
        <span
          class="w-[4.75rem] shrink-0 whitespace-nowrap leading-none tabular-nums"
          ><span class="font-display text-base font-bold text-white"
            >${(this.attackRatio * 100).toFixed(0)}%</span
          >
          <span class="text-xs text-white/50"
            >${renderTroops(committed)}</span
          ></span
        >
        ${this.renderRatioSlider("flex-1")} ${this.renderObjectivesChip()}
      </div>
    `;
  }

  private renderMobile() {
    return html`
      ${this.renderNotification()} ${this.renderObjectives()}
      <div class="flex items-center gap-2">
        ${this.renderGold("text-xs")}
        <div
          class="flex w-[40%] shrink-0 flex-col gap-1 ${this.tutorialHighlightClass(
            "troops",
          )}"
          translate="no"
        >
          <div class="flex items-center justify-between gap-1">
            <span
              class="font-display text-xs font-bold leading-none tabular-nums text-white"
              >${renderTroops(this._troops)}<span class="text-white/45">
                / ${renderTroops(this._maxTroops)}</span
              ></span
            >
            ${this.renderTroopRate("text-[10px]")}
          </div>
          ${this.renderTileGauge("h-2")}
        </div>
        <span
          class="w-9 shrink-0 text-center font-display text-xs font-bold tabular-nums text-white"
          translate="no"
          >${(this.attackRatio * 100).toFixed(0)}%</span
        >
        <div
          class="flex-1 ${this.tutorialHighlightClass("attack_ratio")}"
          translate="no"
        >
          ${this.renderRatioSlider("w-full")}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <style>
        @keyframes gold-gain-pop {
          0% {
            transform: translateY(4px);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .gold-gain-pop {
          animation: gold-gain-pop 0.25s ease-out;
        }
      </style>
      <div
        class="relative pointer-events-auto ${this._isVisible
          ? "relative w-full text-sm px-3 pt-3 pb-2"
          : "hidden"}"
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div class="lg:hidden">${this.renderMobile()}</div>
        <div class="hidden lg:block">${this.renderDesktop()}</div>
      </div>
    `;
  }

  createRenderRoot() {
    return this; // Disable shadow DOM to allow Tailwind styles
  }
}
