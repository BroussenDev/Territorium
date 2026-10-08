import { html, LitElement, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { AttackLogicInput } from "../../../core/configuration/Config";
import type { EventBus } from "../../../core/EventBus";
import {
  AttackEstimate,
  estimateAttack,
} from "../../../core/game/AttackEstimate";
import { TerrainType, UnitType } from "../../../core/game/Game";
import type { TileRef } from "../../../core/game/GameMap";
import { CAPITAL_FALLEN_DEBUFF_TICKS } from "../../../core/game/NationsMode";
import { UserSettings } from "../../../core/game/UserSettings";
import { MouseMoveEvent } from "../../InputHandler";
import { TransformHandler } from "../../TransformHandler";
import type { UIState } from "../../UIState";
import { renderNumber, renderTroops, translateText } from "../../Utils";
import type { GameView, PlayerView } from "../../view";

// How often the preview follows the mouse, in milliseconds.
const REFRESH_MS = 120;

// How often a still preview catches up with the troops growing.
const IDLE_REFRESH_MS = 500;

// Tiles around the cursor scanned for the attack front.
const FRONT_RADIUS = 40;

// Front assumed when none lies near the cursor (the attack spreads from
// wherever the two territories touch).
const FALLBACK_FRONT = 10;

type Preview = {
  x: number;
  y: number;
  openLand: boolean;
  target: string;
  terrain: TerrainType;
  defensePost: boolean;
  traitor: boolean;
  fallout: boolean;
  estimate: AttackEstimate;
};

/**
 * The attack preview: next to the cursor, over land you can attack, how many
 * troops the attack sends (your attack ratio), how many it is likely to
 * lose, how many tiles it takes and how long it runs, with what weighs on it
 * (terrain, defense post, traitor, fallout). The numbers come from the
 * simulation's own rule (AttackEstimate). On by default; Settings turns it
 * off.
 */
@customElement("attack-preview")
export class AttackPreview extends LitElement {
  public eventBus: EventBus;
  public game: GameView;
  public transform: TransformHandler;
  public uiState: UIState;

  @state() private preview: Preview | null = null;

  private readonly userSettings = new UserSettings();
  private lastUpdate = 0;
  private lastMouse: { x: number; y: number } | null = null;
  // Bumped on every mouse move, so a slow answer about an older tile is
  // dropped.
  private request = 0;

  createRenderRoot() {
    return this;
  }

  init() {
    this.eventBus.on(MouseMoveEvent, (e: MouseMoveEvent) => this.onMove(e));
  }

  tick() {
    // Troops keep growing under a still cursor: keep the numbers current.
    if (this.lastMouse === null || this.preview === null) return;
    const now = Date.now();
    if (now - this.lastUpdate < IDLE_REFRESH_MS) return;
    this.lastUpdate = now;
    void this.refresh(this.lastMouse.x, this.lastMouse.y);
  }

  private onMove(e: MouseMoveEvent) {
    this.lastMouse = { x: e.x, y: e.y };
    const now = Date.now();
    if (now - this.lastUpdate < REFRESH_MS) return;
    this.lastUpdate = now;
    void this.refresh(e.x, e.y);
  }

  private async refresh(x: number, y: number) {
    const request = ++this.request;
    const game = this.game;
    const me = game.myPlayer();
    if (
      !this.userSettings.attackPreview() ||
      me === null ||
      !me.isAlive() ||
      game.inSpawnPhase() ||
      game.gameOver()
    ) {
      this.preview = null;
      return;
    }
    const world = this.transform.screenToWorldCoordinates(x, y);
    if (!game.isValidCoord(world.x, world.y)) {
      this.preview = null;
      return;
    }
    const tile = game.ref(world.x, world.y);
    const owner = game.owner(tile);
    const defender = owner.isPlayer() ? (owner as PlayerView) : null;
    if (
      !game.isLand(tile) ||
      defender === me ||
      (defender !== null && me.isFriendly(defender))
    ) {
      this.preview = null;
      return;
    }
    const actions = await me.actions(tile, []).catch(() => null);
    if (request !== this.request) return;
    if (actions === null || !actions.canAttack) {
      this.preview = null;
      return;
    }

    const sent = Math.floor(me.troops() * this.uiState.attackRatio);
    if (sent < 1) {
      this.preview = null;
      return;
    }
    const defensePost =
      defender !== null &&
      game.hasUnitNearby(
        tile,
        game.config().defensePostRange(),
        UnitType.DefensePost,
        defender.id(),
      );
    const fallout = game.hasFallout(tile);
    const input: Omit<AttackLogicInput, "attackTroops"> = {
      terrain: game.terrainType(tile),
      attacker: { type: me.type(), numTiles: me.numTilesOwned() },
      defender:
        defender === null
          ? null
          : {
              type: defender.type(),
              numTiles: Math.max(1, defender.numTilesOwned()),
              troops: defender.troops(),
              isTraitor: defender.isTraitor(),
              isDisconnectedTeammate: false,
              capitalFallen:
                game.config().isNationsMode() &&
                defender.capitalLostTick() >= 0 &&
                game.ticks() - defender.capitalLostTick() <
                  CAPITAL_FALLEN_DEBUFF_TICKS,
            },
      defenderHasDefensePost: defensePost,
      falloutRatio: fallout
        ? game.numTilesWithFallout() / Math.max(1, game.numLandTiles())
        : null,
      borderSize: this.frontNear(tile, me, owner.smallID()),
    };
    this.preview = {
      x,
      y,
      openLand: defender === null,
      target:
        defender === null
          ? translateText("attack_preview.open_land")
          : defender.displayName(),
      terrain: input.terrain,
      defensePost,
      traitor: defender?.isTraitor() ?? false,
      fallout,
      estimate: estimateAttack(game.config(), input, sent),
    };
  }

  // Tiles of the target touching your territory around the cursor: the
  // stretch of front an attack pushes along here.
  private frontNear(tile: TileRef, me: PlayerView, target: number): number {
    const game = this.game;
    const mine = me.smallID();
    const cx = game.x(tile);
    const cy = game.y(tile);
    let front = 0;
    for (let y = cy - FRONT_RADIUS; y <= cy + FRONT_RADIUS; y++) {
      for (let x = cx - FRONT_RADIUS; x <= cx + FRONT_RADIUS; x++) {
        if (!game.isValidCoord(x, y)) continue;
        const t = game.ref(x, y);
        if (game.ownerID(t) !== target || !game.isLand(t)) continue;
        if (game.neighbors(t).some((n) => game.ownerID(n) === mine)) front++;
      }
    }
    return front > 0 ? front : FALLBACK_FRONT;
  }

  private terrainName(terrain: TerrainType): string {
    switch (terrain) {
      case TerrainType.Highland:
        return translateText("attack_preview.terrain_highland");
      case TerrainType.Mountain:
        return translateText("attack_preview.terrain_mountain");
      default:
        return translateText("attack_preview.terrain_plains");
    }
  }

  private formatTime(seconds: number): string {
    if (seconds < 1) return translateText("attack_preview.instant");
    const s = Math.round(seconds);
    if (s < 60) return translateText("attack_preview.seconds", { s });
    return translateText("attack_preview.minutes", {
      m: Math.floor(s / 60),
      s: String(s % 60).padStart(2, "0"),
    });
  }

  render() {
    const p = this.preview;
    if (p === null) return html``;
    const { estimate } = p;
    const share = estimate.sent > 0 ? estimate.lost / estimate.sent : 0;
    // Against a player: red when the attack spends itself, amber when it
    // costs half or more. Open land always takes every troop sent.
    const costColor = p.openLand
      ? "text-white"
      : share >= 0.95 && !estimate.wipesOut
        ? "text-red-300"
        : share >= 0.5
          ? "text-amber-200"
          : "text-emerald-200";
    const chips = [
      { show: true, text: this.terrainName(p.terrain), tone: "neutral" },
      {
        show: p.defensePost,
        text: translateText("attack_preview.defense_post"),
        tone: "bad",
      },
      {
        show: p.fallout,
        text: translateText("attack_preview.fallout"),
        tone: "bad",
      },
      {
        show: p.traitor,
        text: translateText("attack_preview.traitor"),
        tone: "good",
      },
    ].filter((c) => c.show);
    const left = Math.min(p.x + 18, window.innerWidth - 248);
    const top = Math.min(p.y + 18, window.innerHeight - 170);
    return html`
      <div
        data-attack-preview
        class="pointer-events-none fixed z-[900] w-[230px] rounded-md border border-white/10 border-l-4 border-l-red-400 bg-[#0a1512]/92 px-3 py-2 text-white shadow-[0_12px_28px_-14px_rgb(0_0_0/0.9)] backdrop-blur-xs"
        style="left: ${left}px; top: ${top}px;"
      >
        <div class="flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            class="size-4 shrink-0 text-red-300"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            ${svg`<path d="M14.5 17.5 3 6V3h3l11.5 11.5"></path>
              <path d="m13 19 6-6M16 16l4 4M19 21l2-2"></path>`}
          </svg>
          <span class="min-w-0 truncate font-display text-sm font-semibold"
            >${p.target}</span
          >
        </div>
        <dl
          class="mt-1.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs tabular-nums"
        >
          <dt class="text-white/60">${translateText("attack_preview.sent")}</dt>
          <dd class="text-right">${renderTroops(estimate.sent)}</dd>
          <dt class="text-white/60">${translateText("attack_preview.lost")}</dt>
          <dd class="text-right ${costColor}">
            ${renderTroops(estimate.lost)}
          </dd>
          <dt class="text-white/60">
            ${translateText("attack_preview.tiles")}
          </dt>
          <dd class="text-right">
            ${estimate.wipesOut
              ? translateText("attack_preview.all_tiles")
              : renderNumber(estimate.tiles)}
          </dd>
          <dt class="text-white/60">${translateText("attack_preview.time")}</dt>
          <dd class="text-right">${this.formatTime(estimate.seconds)}</dd>
        </dl>
        <div class="mt-1.5 flex flex-wrap gap-1">
          ${chips.map(
            (c) =>
              html`<span
                class="rounded-sm px-1.5 py-px text-[10px] font-semibold ${c.tone ===
                "bad"
                  ? "bg-red-500/20 text-red-200"
                  : c.tone === "good"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-white/10 text-white/75"}"
                >${c.text}</span
              >`,
          )}
        </div>
      </div>
    `;
  }
}
