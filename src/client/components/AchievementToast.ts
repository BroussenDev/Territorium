import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { AchievementUnlock } from "../SteamAchievements";
import { translateText } from "../Utils";

// Steam achievement notifications, drawn by the game: on Windows the Steam
// overlay can't draw over the webview (WebView2 renders in its own
// processes), so its own notification plays a sound and shows nothing. Name
// and description come from Steam, in the player's Steam language.

const SHOW_MS = 6000;
const ICON_SIZE = 64;

/** The achievement's icon (64x64 RGBA from Steam) as an image URL. */
export function iconUrl(rgbaBase64: string | null | undefined): string | null {
  if (!rgbaBase64) return null;
  try {
    const bytes = Uint8ClampedArray.from(atob(rgbaBase64), (c) =>
      c.charCodeAt(0),
    );
    if (bytes.length !== ICON_SIZE * ICON_SIZE * 4) return null;
    const canvas = document.createElement("canvas");
    canvas.width = ICON_SIZE;
    canvas.height = ICON_SIZE;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    ctx.putImageData(new ImageData(bytes, ICON_SIZE, ICON_SIZE), 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

interface Toast {
  name: string;
  description: string | null;
  icon: string | null;
}

const trophy = html`<svg
  viewBox="0 0 24 24"
  class="size-9"
  aria-hidden="true"
  fill="none"
  stroke="#f2d27a"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4z" />
  <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
</svg>`;

@customElement("achievement-toast")
export class AchievementToast extends LitElement {
  @state() private current: Toast | null = null;
  @state() private leaving = false;
  private queue: Toast[] = [];

  createRenderRoot() {
    return this;
  }

  private waiting = false;

  push(toast: Toast) {
    this.queue.push(toast);
    if (this.current === null && !this.waiting) this.next();
  }

  private next() {
    // Unlocked during the Steam app's launch screens (an account
    // achievement): shown once they are gone, not hidden behind them.
    if (document.getElementById("territorium-splash") !== null) {
      this.current = null;
      this.waiting = true;
      setTimeout(() => {
        this.waiting = false;
        this.next();
      }, 500);
      return;
    }
    const toast = this.queue.shift() ?? null;
    this.current = toast;
    this.leaving = false;
    if (toast === null) return;
    setTimeout(() => (this.leaving = true), SHOW_MS - 400);
    setTimeout(() => this.next(), SHOW_MS);
  }

  render() {
    const t = this.current;
    if (t === null) return nothing;
    // Territorium's own notification (Steam's overlay can't draw over the
    // webview): a gold-framed emblem that slides in, a light sweep across
    // the card, and a bar running down the time it stays.
    return html`<style>
        @keyframes ach-in {
          from {
            transform: translateX(120%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes ach-sweep {
          from {
            transform: translateX(-120%) skewX(-20deg);
          }
          to {
            transform: translateX(320%) skewX(-20deg);
          }
        }
        @keyframes ach-emblem {
          0% {
            transform: scale(0.4) rotate(-12deg);
            opacity: 0;
          }
          60% {
            transform: scale(1.12) rotate(3deg);
            opacity: 1;
          }
          100% {
            transform: scale(1) rotate(0);
          }
        }
        @keyframes ach-time {
          from {
            transform: scaleX(1);
          }
          to {
            transform: scaleX(0);
          }
        }
        .ach-card {
          animation: ach-in 420ms cubic-bezier(0.2, 0.9, 0.25, 1.15) both;
        }
        .ach-sweep {
          animation: ach-sweep 1.1s 350ms ease-out both;
        }
        .ach-emblem {
          animation: ach-emblem 600ms 200ms cubic-bezier(0.2, 0.9, 0.25, 1.2)
            both;
        }
        .ach-time {
          animation: ach-time ${SHOW_MS}ms linear both;
          transform-origin: left;
        }
        @media (prefers-reduced-motion: reduce) {
          .ach-card,
          .ach-sweep,
          .ach-emblem {
            animation: none;
          }
        }
      </style>
      <div
        role="status"
        aria-live="polite"
        class="pointer-events-none fixed bottom-24 right-5 z-[100000] w-[360px] max-w-[calc(100vw-2.5rem)] transition-opacity duration-300 ${this
          .leaving
          ? "opacity-0"
          : "opacity-100"}"
      >
        <div
          class="ach-card relative overflow-hidden rounded-xl border border-[#e8b84a]/60 bg-[linear-gradient(150deg,#123a2c_0%,#0b1f18_55%,#08130f_100%)] shadow-[0_12px_32px_rgba(0,0,0,0.65),0_0_24px_rgba(232,184,74,0.18)]"
        >
          <div
            class="ach-sweep pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(255,236,170,0.22),transparent)]"
          ></div>
          <div class="relative flex items-center gap-3.5 p-3.5">
            <div
              class="ach-emblem relative flex size-[60px] shrink-0 items-center justify-center rounded-lg bg-[radial-gradient(circle_at_50%_35%,#2c5a45,#0d2219)] shadow-[inset_0_0_0_2px_#e8b84a,0_0_18px_rgba(232,184,74,0.45)]"
            >
              ${t.icon
                ? html`<img
                    src=${t.icon}
                    alt=""
                    class="size-[52px] rounded-md"
                  />`
                : trophy}
            </div>
            <div class="min-w-0">
              <div class="text-[12px] font-semibold text-[#f2d27a]">
                ${translateText("achievements.unlocked")}
              </div>
              <div
                class="mt-0.5 truncate font-display text-[17px] font-bold text-white"
              >
                ${t.name}
              </div>
              ${t.description
                ? html`<div class="mt-0.5 line-clamp-2 text-xs text-white/70">
                    ${t.description}
                  </div>`
                : nothing}
            </div>
          </div>
          <div class="h-[3px] w-full bg-black/40">
            <div
              class="ach-time h-full bg-[linear-gradient(90deg,#34d399,#e8b84a)]"
            ></div>
          </div>
        </div>
      </div>`;
  }
}

/** Shows an unlocked achievement in the corner, one after another. */
export function showAchievementToast(unlock: AchievementUnlock): void {
  let el = document.querySelector("achievement-toast") as AchievementToast;
  if (el === null) {
    el = document.createElement("achievement-toast") as AchievementToast;
    document.body.appendChild(el);
  }
  el.push({
    name: unlock.name ?? translateText("achievements.unlocked"),
    description: unlock.name ? (unlock.description ?? null) : null,
    icon: iconUrl(unlock.icon),
  });
}
