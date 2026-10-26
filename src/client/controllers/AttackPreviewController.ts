/**
 * AttackPreviewController — over land you can attack, paints on the map the
 * tiles the attack would take and puts a small label by the cursor (tiles,
 * duration, and against a player, the troops it costs).
 *
 * Cheap on purpose, since it follows the mouse: the label moves on every
 * mouse event without re-rendering; the estimate and the zone are worked
 * out at most every REFRESH_MS, from the tile state buffer with reused
 * typed arrays (no allocation per tile); whether the target can be attacked
 * is asked of the simulation once per target and cached.
 */

import type { AttackLogicInput } from "../../core/configuration/Config";
import { EventBus } from "../../core/EventBus";
import { estimateAttack } from "../../core/game/AttackEstimate";
import { TerrainType, UnitType } from "../../core/game/Game";
import { CAPITAL_FALLEN_DEBUFF_TICKS } from "../../core/game/NationsMode";
import { UserSettings } from "../../core/game/UserSettings";
import { Controller } from "../Controller";
import type { AttackPreview } from "../hud/layers/AttackPreview";
import { MouseMoveEvent } from "../InputHandler";
import { MapRenderer } from "../render/gl";
import { OWNER_MASK } from "../render/gl/utils/TileCodec";
import { TransformHandler } from "../TransformHandler";
import type { UIState } from "../UIState";
import { GameView, PlayerView } from "../view";

// Fastest the estimate and the zone are worked out again, in milliseconds.
const REFRESH_MS = 150;
// A still cursor still follows the troops growing, this often.
const IDLE_REFRESH_MS = 600;
// How long "can I attack this target" is trusted.
const CAN_ATTACK_TTL_MS = 1_000;
// Half-size of the square around the cursor where the front is measured.
const FRONT_RADIUS = 30;
// Front assumed when none lies near the cursor.
const FALLBACK_FRONT = 10;
// Most tiles painted (and estimated), however big the attack.
const MAX_ZONE_TILES = 4_000;

export class AttackPreviewController implements Controller {
  private readonly settings = new UserSettings();
  private lastMouse: { x: number; y: number } | null = null;
  private lastRun = 0;
  private trailing: ReturnType<typeof setTimeout> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private canAttack = new Map<number, { ok: boolean; at: number }>();
  private asking = new Set<number>();
  private shown = false;

  // BFS scratch, reused: a stamp per tile marks "seen this run".
  private seen: Uint32Array | null = null;
  private stamp = 0;
  private queue = new Int32Array(MAX_ZONE_TILES * 4);
  private zone = new Int32Array(MAX_ZONE_TILES);

  constructor(
    private game: GameView,
    private eventBus: EventBus,
    private transform: TransformHandler,
    private view: MapRenderer,
    private uiState: UIState,
    private label: AttackPreview,
  ) {}

  init() {
    this.eventBus.on(MouseMoveEvent, (e) => this.onMove(e));
  }

  private onMove(e: MouseMoveEvent) {
    this.lastMouse = { x: e.x, y: e.y };
    this.label.moveTo(e.x, e.y);
    const wait = REFRESH_MS - (performance.now() - this.lastRun);
    if (wait <= 0) {
      this.run();
    } else {
      this.trailing ??= setTimeout(() => {
        this.trailing = null;
        this.run();
      }, wait);
    }
  }

  private hide() {
    if (this.idle !== null) clearTimeout(this.idle);
    this.idle = null;
    if (!this.shown) return;
    this.shown = false;
    this.view.clearAttackPreview();
    this.label.hide();
  }

  private run() {
    this.lastRun = performance.now();
    const mouse = this.lastMouse;
    const game = this.game;
    const me = game.myPlayer();
    if (
      mouse === null ||
      !this.settings.attackPreview() ||
      me === null ||
      !me.isAlive() ||
      game.inSpawnPhase() ||
      game.gameOver()
    ) {
      this.hide();
      return;
    }
    const cell = this.transform.screenToWorldCoordinates(mouse.x, mouse.y);
    if (!game.isValidCoord(cell.x, cell.y)) {
      this.hide();
      return;
    }
    const tile = game.ref(cell.x, cell.y);
    const mine = me.smallID();
    const target = game.tileState(tile) & OWNER_MASK;
    if (!game.isLand(tile) || target === mine) {
      this.hide();
      return;
    }
    const defender =
      target === 0 ? null : (game.playerBySmallID(target) as PlayerView);
    if (
      defender !== null &&
      (!defender.isPlayer() || me.isFriendly(defender))
    ) {
      this.hide();
      return;
    }
    if (!this.attackable(me, tile, target)) {
      this.hide();
      return;
    }

    // Impassable land can't be attacked: nothing to estimate (the attack
    // model throws on it).
    if (game.terrainType(tile) === TerrainType.Impassable) {
      this.hide();
      return;
    }
    const sent = Math.floor(me.troops() * this.uiState.attackRatio);
    if (sent < 1) {
      this.hide();
      return;
    }
    const front = this.measureFront(cell.x, cell.y, mine, target);
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
      defenderHasDefensePost:
        defender !== null &&
        game.hasUnitNearby(
          tile,
          game.config().defensePostRange(),
          UnitType.DefensePost,
          defender.id(),
        ),
      falloutRatio: game.hasFallout(tile)
        ? game.numTilesWithFallout() / Math.max(1, game.numLandTiles())
        : null,
      borderSize: front > 0 ? front : FALLBACK_FRONT,
    };
    const estimate = estimateAttack(game.config(), input, sent, MAX_ZONE_TILES);
    const count = this.fillZone(estimate.tiles);
    this.view.setAttackPreview(this.zone, count);
    this.label.show({
      tiles: estimate.tiles,
      seconds: estimate.seconds,
      lost: estimate.lost,
      sent,
      vsPlayer: defender !== null,
      wipesOut: estimate.wipesOut,
      defensePost: input.defenderHasDefensePost,
      terrain: input.terrain,
    });
    this.shown = true;

    if (this.idle !== null) clearTimeout(this.idle);
    this.idle = setTimeout(() => {
      this.idle = null;
      if (this.shown) this.run();
    }, IDLE_REFRESH_MS);
  }

  // Whether `me` may attack the owner of `tile` (0 = open land), as the
  // simulation says; cached per target, asked again in the background.
  private attackable(me: PlayerView, tile: number, target: number): boolean {
    const now = performance.now();
    const known = this.canAttack.get(target);
    if (
      (known === undefined || now - known.at > CAN_ATTACK_TTL_MS) &&
      !this.asking.has(target)
    ) {
      this.asking.add(target);
      me.actions(tile, [])
        .then((actions) => {
          const before = this.canAttack.get(target)?.ok;
          this.canAttack.set(target, {
            ok: actions.canAttack,
            at: performance.now(),
          });
          if (before !== actions.canAttack) this.run();
        })
        .catch(() => {})
        .finally(() => this.asking.delete(target));
    }
    return known?.ok ?? false;
  }

  // Tiles of `target` touching `mine` in the square around (cx, cy): the
  // front the attack pushes along here. They seed the zone.
  private measureFront(cx: number, cy: number, mine: number, target: number) {
    const game = this.game;
    const w = game.width();
    const h = game.height();
    const state = game.tileStateBuffer();
    if (this.seen === null || this.seen.length !== w * h) {
      this.seen = new Uint32Array(w * h);
      this.stamp = 0;
    }
    this.stamp++;
    this.queueLen = 0;
    const owner = (ref: number) => state[ref] & OWNER_MASK;
    for (
      let y = Math.max(0, cy - FRONT_RADIUS);
      y <= Math.min(h - 1, cy + FRONT_RADIUS);
      y++
    ) {
      for (
        let x = Math.max(0, cx - FRONT_RADIUS);
        x <= Math.min(w - 1, cx + FRONT_RADIUS);
        x++
      ) {
        const ref = y * w + x;
        if (owner(ref) !== target || !game.isLand(ref)) continue;
        if (
          (x > 0 && owner(ref - 1) === mine) ||
          (x < w - 1 && owner(ref + 1) === mine) ||
          (y > 0 && owner(ref - w) === mine) ||
          (y < h - 1 && owner(ref + w) === mine)
        ) {
          if (this.queueLen < this.queue.length) {
            this.queue[this.queueLen++] = ref;
            this.seen![ref] = this.stamp;
          }
        }
      }
    }
    this.target = target;
    return this.queueLen;
  }

  private queueLen = 0;
  private target = 0;

  // Spreads from the front into the target's land, breadth first, for
  // `tiles` tiles: the zone the attack would take.
  private fillZone(tiles: number): number {
    const game = this.game;
    const w = game.width();
    const h = game.height();
    const state = game.tileStateBuffer();
    const seen = this.seen!;
    const want = Math.min(tiles, MAX_ZONE_TILES);
    let head = 0;
    let count = 0;
    while (head < this.queueLen && count < want) {
      const ref = this.queue[head++];
      this.zone[count++] = ref;
      const x = ref % w;
      const y = (ref / w) | 0;
      if (x > 0) this.enqueue(ref - 1, state, seen);
      if (x < w - 1) this.enqueue(ref + 1, state, seen);
      if (y > 0) this.enqueue(ref - w, state, seen);
      if (y < h - 1) this.enqueue(ref + w, state, seen);
    }
    return count;
  }

  private enqueue(n: number, state: Uint16Array, seen: Uint32Array) {
    if (seen[n] === this.stamp) return;
    if ((state[n] & OWNER_MASK) !== this.target || !this.game.isLand(n)) return;
    seen[n] = this.stamp;
    if (this.queueLen < this.queue.length) this.queue[this.queueLen++] = n;
  }
}
