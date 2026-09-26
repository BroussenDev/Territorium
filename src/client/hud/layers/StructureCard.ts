import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { EventBus } from "../../../core/EventBus";
import {
  Gold,
  PlayerBuildableUnitType,
  UnitType,
} from "../../../core/game/Game";
import { TileRef } from "../../../core/game/GameMap";
import { Controller } from "../../Controller";
import {
  CloseViewEvent,
  ContextMenuEvent,
  MouseUpEvent,
  TouchEvent,
} from "../../InputHandler";
import { TransformHandler } from "../../TransformHandler";
import { SendUpgradeStructureIntentEvent } from "../../Transport";
import { UIState } from "../../UIState";
import { renderNumber, translateText } from "../../Utils";
import { GameView, UnitView } from "../../view";
import {
  cityIcon,
  factoryIcon,
  goldCoinIcon,
  missileSiloIcon,
  portIcon,
  radarIcon,
  samLauncherIcon,
} from "../HotbarIcons";

// The structures a card opens for: the upgradable ones.
const CARD_TYPES: Partial<Record<UnitType, { icon: string; key: string }>> = {
  [UnitType.City]: { icon: cityIcon, key: "city" },
  [UnitType.Factory]: { icon: factoryIcon, key: "factory" },
  [UnitType.Port]: { icon: portIcon, key: "port" },
  [UnitType.MissileSilo]: { icon: missileSiloIcon, key: "missile_silo" },
  [UnitType.SAMLauncher]: { icon: samLauncherIcon, key: "sam_launcher" },
  [UnitType.Radar]: { icon: radarIcon, key: "radar" },
};
const TYPES = Object.keys(CARD_TYPES) as UnitType[];

/** How far from a structure's tile a click still picks it, in tiles. */
const PICK_RADIUS = 2;
const CARD_WIDTH = 264;

/** Frame tier by level: bronze at 2, silver at 3, gold from 4. */
export function levelTier(level: number): "" | "bronze" | "silver" | "gold" {
  if (level >= 4) return "gold";
  if (level === 3) return "silver";
  if (level === 2) return "bronze";
  return "";
}

/** "2:14" for 134 seconds. */
function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Clicking one of your own upgradable structures opens this card: its level,
 * what the next level brings, and an Upgrade button with the price. Military
 * structures show their level cap, and a countdown while the next level is
 * still locked.
 */
@customElement("structure-card")
export class StructureCard extends LitElement implements Controller {
  public game: GameView;
  public eventBus: EventBus;
  public uiState: UIState;
  public transformHandler: TransformHandler;

  @state() private unit: UnitView | null = null;
  @state() private cost: Gold | null = null;
  @state() private canUpgrade = false;
  private x = 0;
  private y = 0;

  createRenderRoot() {
    return this;
  }

  init() {
    this.eventBus.on(MouseUpEvent, (e) => this.onClick(e.x, e.y));
    // A tap opens the radial menu, which has its own upgrade button.
    this.eventBus.on(TouchEvent, () => this.close());
    this.eventBus.on(ContextMenuEvent, () => this.close());
    this.eventBus.on(CloseViewEvent, () => this.close());
  }

  tick() {
    const unit = this.unit;
    if (unit === null) return;
    const me = this.game.myPlayer();
    if (
      !unit.isActive() ||
      me === null ||
      unit.owner() !== me ||
      this.uiState.ghostStructure !== null
    ) {
      this.close();
      return;
    }
    this.refreshPrice(unit);
    this.requestUpdate();
  }

  private onClick(screenX: number, screenY: number) {
    const me = this.game?.myPlayer();
    if (
      me === null ||
      me === undefined ||
      this.game.inSpawnPhase() ||
      this.uiState.ghostStructure !== null
    ) {
      this.close();
      return;
    }
    const cell = this.transformHandler.screenToWorldCoordinates(
      screenX,
      screenY,
    );
    if (!this.game.isValidCoord(cell.x, cell.y)) {
      this.close();
      return;
    }
    const unit = this.pick(this.game.ref(cell.x, cell.y));
    if (unit === null) {
      this.close();
      return;
    }
    this.unit = unit;
    this.cost = null;
    this.canUpgrade = false;
    this.x = screenX;
    this.y = screenY;
    this.refreshPrice(unit);
  }

  private pick(tile: TileRef): UnitView | null {
    const me = this.game.myPlayer();
    let best: UnitView | null = null;
    let bestDist = Infinity;
    for (const { unit, distSquared } of this.game.nearbyUnits(
      tile,
      PICK_RADIUS,
      TYPES,
    )) {
      if (unit.owner() !== me || !unit.isActive()) continue;
      if (distSquared < bestDist) {
        best = unit;
        bestDist = distSquared;
      }
    }
    return best;
  }

  private refreshPrice(unit: UnitView) {
    this.game
      .myPlayer()
      ?.buildables(unit.tile(), [unit.type() as PlayerBuildableUnitType])
      .then(([bu]) => {
        if (this.unit !== unit || bu === undefined) return;
        this.cost = bu.cost;
        this.canUpgrade = bu.canUpgrade === unit.id();
      })
      .catch(() => {});
  }

  private close() {
    if (this.unit === null) return;
    this.unit = null;
  }

  private upgrade() {
    const unit = this.unit;
    if (unit === null || !this.canUpgrade) return;
    this.eventBus.emit(
      new SendUpgradeStructureIntentEvent(unit.id(), unit.type()),
    );
    this.canUpgrade = false;
  }

  /** What the next level brings, one line per effect. */
  private gains(type: UnitType, level: number): string[] {
    const config = this.game.config();
    const next = level + 1;
    switch (type) {
      case UnitType.SAMLauncher:
        return [
          translateText("structure_card.gain_range", {
            from: Math.round(config.samRange(level)),
            to: Math.round(config.samRange(next)),
          }),
          translateText("structure_card.gain_missiles", {
            from: level,
            to: next,
          }),
        ];
      case UnitType.MissileSilo:
        return [
          translateText("structure_card.gain_missiles", {
            from: level,
            to: next,
          }),
        ];
      case UnitType.Radar:
        return [
          translateText("structure_card.gain_range", {
            from: config.radarRange(level),
            to: config.radarRange(next),
          }),
        ];
      default:
        return [translateText("structure_card.gain_stack")];
    }
  }

  private renderAction(unit: UnitView, cap: number) {
    const config = this.game.config();
    const level = unit.level();
    if (level >= cap) {
      return html`<div class="structure-card-note">
        ${translateText("structure_card.max")}
      </div>`;
    }
    const unlockAt = config.structureLevelUnlockSeconds(unit.type(), level + 1);
    const wait = unlockAt - this.game.elapsedGameSeconds();
    if (wait > 0) {
      return html`<div class="structure-card-note" translate="no">
        ${translateText("structure_card.locked", {
          level: level + 1,
          time: clock(wait),
        })}
      </div>`;
    }
    const gold = this.game.myPlayer()?.gold() ?? 0n;
    const affordable = this.cost !== null && this.cost <= gold;
    return html`
      <button
        type="button"
        class="structure-card-upgrade flex w-full items-center justify-between"
        ?disabled=${!this.canUpgrade}
        @click=${() => this.upgrade()}
      >
        <span>${translateText("structure_card.upgrade")}</span>
        ${this.cost !== null
          ? html`<span
              class="structure-card-price inline-flex items-center gap-1 ${affordable
                ? ""
                : "is-short"}"
              translate="no"
            >
              <img src=${goldCoinIcon} width="13" height="13" alt="" />
              ${renderNumber(this.cost)}
            </span>`
          : ""}
      </button>
    `;
  }

  render() {
    const unit = this.unit;
    if (unit === null) return null;
    const info = CARD_TYPES[unit.type()];
    if (info === undefined) return null;
    const config = this.game.config();
    const cap = config.maxStructureLevel(unit.type());
    const level = unit.level();
    const tier = levelTier(level);
    const left = Math.min(
      Math.max(8, this.x - CARD_WIDTH / 2),
      window.innerWidth - CARD_WIDTH - 8,
    );
    // Above the click when there is room, below it otherwise.
    const above = this.y > 220;
    const position = above
      ? `left:${left}px; bottom:${window.innerHeight - this.y + 18}px`
      : `left:${left}px; top:${this.y + 18}px`;

    return html`
      <div
        class="structure-card fixed z-[300] pointer-events-auto"
        style="width:${CARD_WIDTH}px; ${position}"
        @contextmenu=${(e: MouseEvent) => e.preventDefault()}
      >
        <div class="structure-card-head flex items-center gap-2.5">
          <div
            class="structure-card-icon ${tier} flex items-center justify-center shrink-0"
          >
            <img src=${info.icon} alt="" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="structure-card-name">
              ${translateText(`unit_type.${info.key}`)}
            </div>
            <div class="structure-card-level" translate="no">
              ${Number.isFinite(cap)
                ? html`${translateText("structure_card.level_of", {
                      level,
                      max: cap,
                    })}
                    <span
                      class="structure-card-pips inline-flex gap-[3px] ml-1.5 align-middle"
                      aria-hidden="true"
                    >
                      ${Array.from(
                        { length: cap },
                        (_, i) =>
                          html`<i class=${i < level ? tier || "on" : ""}></i>`,
                      )}
                    </span>`
                : translateText("structure_card.level", { level })}
            </div>
          </div>
          <button
            type="button"
            class="structure-card-close shrink-0 self-start"
            aria-label=${translateText("common.close")}
            @click=${() => this.close()}
          >
            ✕
          </button>
        </div>
        ${level < cap
          ? html`<ul class="structure-card-gains">
              ${this.gains(unit.type(), level).map((g) => html`<li>${g}</li>`)}
            </ul>`
          : ""}
        ${this.renderAction(unit, cap)}
      </div>
    `;
  }
}
