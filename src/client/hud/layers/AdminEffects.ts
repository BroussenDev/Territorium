import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { Cell, MessageType } from "../../../core/game/Game";
import {
  DisplayMessageUpdate,
  GameUpdateType,
} from "../../../core/game/GameUpdates";
import { Controller } from "../../Controller";
import { MapRenderer } from "../../render/gl";
import { TransformHandler } from "../../TransformHandler";
import { translateText } from "../../Utils";
import { GameView } from "../../view";

const ANNOUNCE_MS = 7_000;
const CONFETTI_MS = 3_200;
// Ten ticks a second: an upside-down name for 30 seconds.
export const FLIP_TICKS = 300;
const COLORS = [
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#60a5fa",
  "#c084fc",
  "#f9fafb",
];

interface Burst {
  id: number;
  x: number;
  y: number;
  pieces: {
    dx: number;
    dy: number;
    rot: number;
    color: string;
    delay: number;
  }[];
}

/**
 * What an admin's tools show to everyone in the game (AdminActionExecution):
 * their announcement in large across the top, a burst of confetti over a
 * player's name, and that player's name upside down for 30 seconds.
 */
@customElement("admin-effects")
export class AdminEffects extends LitElement implements Controller {
  public game!: GameView;
  public view!: MapRenderer;
  public transformHandler!: TransformHandler;

  @state() private announcement: string | null = null;
  @state() private bursts: Burst[] = [];
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private flipUntil = 0;
  private nextBurst = 0;

  createRenderRoot() {
    return this;
  }

  init() {
    this.announcement = null;
    this.bursts = [];
    this.flipUntil = 0;
  }

  tick() {
    const events = this.game.updatesSinceLastTick()?.[
      GameUpdateType.DisplayEvent
    ] as DisplayMessageUpdate[] | undefined;
    for (const e of events ?? []) {
      if (e.messageType === MessageType.ADMIN_ANNOUNCE) {
        this.announce(String(e.params?.text ?? ""));
      } else if (e.messageType === MessageType.ADMIN_EFFECT) {
        const target = Number(e.params?.target ?? 0);
        if (e.message === "admin_effect.confetti") this.confetti(target);
        if (e.message === "admin_effect.flip_name") {
          this.view.setFlipOwner(target);
          this.flipUntil = this.game.ticks() + FLIP_TICKS;
        }
      }
    }
    if (this.flipUntil !== 0 && this.game.ticks() >= this.flipUntil) {
      this.view.setFlipOwner(0);
      this.flipUntil = 0;
    }
  }

  private announce(text: string) {
    if (text === "") return;
    this.announcement = text;
    if (this.announceTimer !== null) clearTimeout(this.announceTimer);
    this.announceTimer = setTimeout(
      () => (this.announcement = null),
      ANNOUNCE_MS,
    );
  }

  private confetti(smallID: number) {
    const player = this.game.playerBySmallID(smallID);
    if (!player.isPlayer()) return;
    const at = player.nameLocation();
    if (at === undefined) return;
    const screen = this.transformHandler.worldToScreenCoordinates(
      new Cell(at.x, at.y),
    );
    const id = this.nextBurst++;
    const pieces = Array.from({ length: 70 }, (_, i) => {
      const angle = (i / 70) * Math.PI * 2 + Math.random() * 0.4;
      const reach = 60 + Math.random() * 140;
      return {
        dx: Math.cos(angle) * reach,
        dy: Math.sin(angle) * reach - 40 + Math.random() * 160,
        rot: Math.random() * 720 - 360,
        color: COLORS[i % COLORS.length],
        delay: Math.random() * 180,
      };
    });
    this.bursts = [...this.bursts, { id, x: screen.x, y: screen.y, pieces }];
    setTimeout(
      () => (this.bursts = this.bursts.filter((b) => b.id !== id)),
      CONFETTI_MS,
    );
  }

  render() {
    return html`
      <style>
        @keyframes admin-confetti {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translate(var(--dx), var(--dy)) rotate(var(--rot));
            opacity: 0;
          }
        }
        @keyframes admin-announce {
          0% {
            transform: translate(-50%, -16px);
            opacity: 0;
          }
          8%,
          90% {
            transform: translate(-50%, 0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -8px);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .admin-confetti-piece {
            animation-duration: 0.01s !important;
          }
        }
      </style>
      ${this.announcement !== null
        ? html`<div
            class="pointer-events-none fixed left-1/2 top-24 z-[1200] w-[min(44rem,calc(100vw-2rem))] rounded-2xl border border-amber-300/60 bg-[#0e171b]/95 px-6 py-4 text-center shadow-2xl"
            style="animation: admin-announce ${ANNOUNCE_MS}ms ease-out forwards"
            role="status"
          >
            <div class="text-xs font-bold tracking-wide text-amber-200">
              ${translateText("admin_effects.announce_title")}
            </div>
            <div class="mt-1 text-2xl font-bold text-white break-words">
              ${this.announcement}
            </div>
          </div>`
        : nothing}
      ${this.bursts.map(
        (b) =>
          html`<div
            class="pointer-events-none fixed z-[1100]"
            style="left:${b.x}px; top:${b.y}px"
            aria-hidden="true"
          >
            ${b.pieces.map(
              (p) =>
                html`<span
                  class="admin-confetti-piece absolute block h-2.5 w-1.5 rounded-[1px]"
                  style="background:${p.color}; --dx:${p.dx}px; --dy:${p.dy}px; --rot:${p.rot}deg; animation: admin-confetti ${CONFETTI_MS -
                  400}ms cubic-bezier(.2,.7,.4,1) ${p.delay}ms forwards"
                ></span>`,
            )}
          </div>`,
      )}
    `;
  }
}
