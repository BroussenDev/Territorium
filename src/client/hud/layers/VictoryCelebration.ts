import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  findEffect,
  isVictoryEffect,
  VictoryEffectAttributes,
} from "../../../core/CosmeticSchemas";
import { PlayerType } from "../../../core/game/Game";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { Winner } from "../../../core/Schemas";
import {
  loadFlagImage,
  prefersReducedMotion,
  VictoryAnimation,
} from "../../components/VictoryAnimation";
import { Controller } from "../../Controller";
import { fetchCosmetics } from "../../Cosmetics";
import { GameView } from "../../view";
import { PlayerView } from "../../view/PlayerView";

// How long the celebration keeps emitting, then how long it takes to die down.
const EMIT_MS = 6500;
const FADE_MS = 1500;

/**
 * Whose victory effect plays: the winning player, or for a team win the
 * local player when they are on it, else the winning teammate holding the
 * most land. Only players whose victory effect this client shows count
 * (PlayerView.cosmetics already honors the cosmetics visibility settings).
 */
export function celebratedPlayer(
  game: GameView,
  winner: Winner,
): PlayerView | null {
  if (winner === undefined) return null;
  const hasVictory = (p: PlayerView | null | undefined): p is PlayerView =>
    !!p && p.cosmetics.effects?.victory !== undefined;
  if (winner[0] === "player") {
    const player = game.playerByClientID(winner[1]);
    return hasVictory(player) ? player : null;
  }
  if (winner[0] !== "team") return null;
  const me = game.myPlayer();
  if (hasVictory(me) && me.team() === winner[1]) return me;
  const teammates = game
    .players()
    .filter(
      (p) =>
        p.type() === PlayerType.Human &&
        p.team() === winner[1] &&
        hasVictory(p),
    )
    .sort((a, b) => b.numTilesOwned() - a.numTilesOwned());
  return teammates[0] ?? null;
}

/**
 * Plays the winner's victory effect (a store cosmetic: fireworks, confetti,
 * a giant flag) over the whole screen when the game ends, just under the
 * end-of-game window. Purely visual and click-through.
 */
@customElement("victory-celebration")
export class VictoryCelebration extends LitElement implements Controller {
  public game: GameView;

  @state() private playing = false;
  private done = false;
  private frame = 0;

  createRenderRoot() {
    return this;
  }

  init() {}

  tick() {
    if (this.done || !this.game) return;
    const wins = this.game.updatesSinceLastTick()?.[GameUpdateType.Win] ?? [];
    for (const win of wins) {
      if (win.winner === undefined) continue;
      this.done = true;
      const player = celebratedPlayer(this.game, win.winner);
      if (player) void this.celebrate(player);
      return;
    }
  }

  getTickIntervalMs() {
    return 200;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this.frame);
  }

  private async celebrate(player: PlayerView) {
    if (prefersReducedMotion()) return;
    const name = player.cosmetics.effects?.victory?.name;
    if (!name) return;
    const effect = findEffect(await fetchCosmetics(), "victory", name);
    if (!effect || !isVictoryEffect(effect)) return;
    const flag =
      effect.attributes.type === "giantFlag" && player.cosmetics.flag
        ? await loadFlagImage(player.cosmetics.flag)
        : null;
    this.play(effect.attributes, flag);
  }

  private play(
    attributes: VictoryEffectAttributes,
    flag: HTMLCanvasElement | null,
  ) {
    this.playing = true;
    void this.updateComplete.then(() => {
      const canvas = this.querySelector("canvas");
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        this.playing = false;
        return;
      }
      const animation = new VictoryAnimation(attributes, flag);
      const start = performance.now();
      let last = start;
      const loop = (now: number) => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        // Capped: a full-screen canvas at 3x costs more than it shows.
        const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
        if (canvas.width !== Math.round(w * ratio)) {
          canvas.width = Math.round(w * ratio);
        }
        if (canvas.height !== Math.round(h * ratio)) {
          canvas.height = Math.round(h * ratio);
        }
        const elapsed = now - start;
        animation.emitting = elapsed < EMIT_MS;
        animation.step((now - last) / 1000, w, h);
        last = now;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        canvas.style.opacity = String(
          Math.max(0, Math.min(1, 1 - (elapsed - EMIT_MS) / FADE_MS)),
        );
        animation.draw(ctx, w, h);
        if (elapsed < EMIT_MS + FADE_MS) {
          this.frame = requestAnimationFrame(loop);
        } else {
          this.playing = false;
        }
      };
      this.frame = requestAnimationFrame(loop);
    });
  }

  render() {
    if (!this.playing) return nothing;
    return html`<canvas
      data-victory-celebration
      aria-hidden="true"
      class="pointer-events-none fixed inset-0 z-[10005] h-full w-full"
    ></canvas>`;
  }
}
