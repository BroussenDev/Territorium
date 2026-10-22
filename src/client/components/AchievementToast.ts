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
  stroke="#c7d5e0"
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
    // Drawn like Steam's own notification: the overlay can't show it here.
    return html`<div
      role="status"
      aria-live="polite"
      style="font-family:'Motiva Sans','Segoe UI',Arial,sans-serif"
      class="pointer-events-none fixed bottom-24 right-4 z-[100000] flex w-[324px] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-[4px] border border-white/[0.06] bg-[linear-gradient(180deg,#2a2e36,#1c1f25)] p-2.5 shadow-[0_6px_24px_rgba(0,0,0,0.7)] transition-[opacity,transform] duration-300 ease-out ${this
        .leaving
        ? "translate-y-3 opacity-0"
        : "translate-y-0 opacity-100"}"
    >
      <div class="size-16 shrink-0 overflow-hidden rounded-[3px] bg-[#16181d]">
        ${t.icon
          ? html`<img src=${t.icon} alt="" class="size-16" />`
          : html`<div class="flex size-16 items-center justify-center">
              ${trophy}
            </div>`}
      </div>
      <div class="min-w-0 leading-tight">
        <div class="text-[12px] text-[#9da5b0]">
          ${translateText("achievements.unlocked")}
        </div>
        <div class="mt-0.5 truncate text-[15px] font-semibold text-white">
          ${t.name}
        </div>
        ${t.description
          ? html`<div class="mt-0.5 line-clamp-2 text-[12px] text-[#8f98a0]">
              ${t.description}
            </div>`
          : nothing}
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
