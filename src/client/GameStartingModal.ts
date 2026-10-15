import { LitElement, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import "./components/TerritoriumEmblem";
import { isDesktopShell } from "./DesktopShell";
import { OPENFRONT_NOTICE } from "./LegalNotice";
import { translateText } from "./Utils";

// Keys under game_starting_modal.tips in the language files.
export const LOADING_TIPS = [
  "attack_ratio",
  "coast",
  "city",
  "upgrade",
  "frames",
  "objectives",
  "trade",
  "factory",
  "defense",
  "sam",
  "emp",
  "radar",
  "mirv",
  "traitor",
  "alliance",
  "peace",
  "boat",
] as const;

// On the web, two more tips present the Steam app (our own promotion; there
// is no advertising).
export const STEAM_TIPS = ["steam_ranked", "steam_workshop"] as const;

/** The tips shown here and in the lobby: the Steam ones only on the web. */
export function loadingTips(): readonly string[] {
  return isDesktopShell() ? LOADING_TIPS : [...LOADING_TIPS, ...STEAM_TIPS];
}

// Long enough to read the longest tip twice, short enough that a slow load
// shows more than one.
const TIP_INTERVAL_MS = 8000;

@customElement("game-starting-modal")
export class GameStartingModal extends LitElement {
  @state()
  isVisible = false;

  @state()
  private tipIndex = 0;

  private tipTimer: ReturnType<typeof setInterval> | null = null;

  createRenderRoot() {
    return this;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopTips();
  }

  render() {
    const isVisible = this.isVisible;
    const tips = loadingTips();
    const tip = tips[this.tipIndex % tips.length];
    return html`
      <div
        class="fixed inset-0 z-[9998] flex flex-col items-center justify-center overflow-hidden bg-surface px-6 text-white transition-opacity duration-300 ${isVisible
          ? "opacity-100 visible"
          : "opacity-0 invisible"}"
        role="status"
        aria-live="polite"
      >
        <div
          class="territory-mesh absolute inset-0 bg-emerald-500/[0.07] [mask-image:radial-gradient(ellipse_at_50%_40%,#000_0%,transparent_70%)] pointer-events-none"
          aria-hidden="true"
        ></div>
        <div
          class="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_38%,rgba(16,185,129,0.16)_0%,transparent_50%)] pointer-events-none"
          aria-hidden="true"
        ></div>

        <div class="relative flex w-full max-w-lg flex-col items-center">
          ${isVisible
            ? // Re-created on every show so the emblem claims its tiles again.
              html`<territorium-emblem
                class="block w-24 sm:w-28 drop-shadow-[0_8px_24px_rgb(16_185_129_/_0.3)]"
              ></territorium-emblem>`
            : html`<div class="w-24 sm:w-28 aspect-square"></div>`}
          <p
            class="mt-7 font-display text-2xl sm:text-3xl font-bold tracking-wide text-center"
          >
            ${translateText("game_starting_modal.title")}
          </p>
          <div
            class="mt-5 h-1 w-48 overflow-hidden rounded-full bg-white/10"
            aria-hidden="true"
          >
            <div
              class="loading-sweep h-full w-1/3 rounded-full bg-emerald-400"
            ></div>
          </div>

          <div
            class="mt-12 w-full rounded-2xl border border-emerald-400/15 bg-[linear-gradient(115deg,#0f2a21_0%,var(--color-ink)_75%)] px-5 py-4 sm:px-6 sm:py-5"
          >
            <div class="flex items-center justify-between gap-4">
              <span
                class="flex items-center gap-2 text-sm font-semibold text-emerald-300"
              >
                <span
                  class="inline-block size-2.5 rounded-[3px] bg-emerald-400"
                  aria-hidden="true"
                ></span>
                ${translateText("game_starting_modal.tip_label")}
              </span>
              <button
                type="button"
                class="-mr-2 rounded-lg px-2 py-1 text-sm text-white/50 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-emerald-400"
                @click=${() => this.nextTip()}
              >
                ${translateText("game_starting_modal.next_tip")}
              </button>
            </div>
            ${tip
              ? html`<p
                  class="mt-2 min-h-[3lh] text-base leading-relaxed text-white/85 text-pretty"
                >
                  ${translateText(`game_starting_modal.tips.${tip}`)}
                </p>`
              : nothing}
          </div>
        </div>

        <!-- Kept visible (AGPL section 7(b) notice), but low-key. -->
        <div
          class="absolute inset-x-0 bottom-4 text-center text-[11px] leading-relaxed text-white/35"
        >
          <div>
            ${translateText("main.based_on_openfront")} · ${OPENFRONT_NOTICE}
          </div>
          <div>
            ${translateText("game_starting_modal.code_license")} ·
            <a
              href="https://github.com/BroussenDev/Territorium/blob/main/CREDITS.md"
              target="_blank"
              rel="noopener noreferrer"
              class="underline decoration-white/20 transition-colors hover:text-white/70"
              >${translateText("game_starting_modal.credits")}</a
            >
          </div>
        </div>
      </div>
    `;
  }

  show() {
    this.tipIndex = Math.floor(Math.random() * loadingTips().length);
    this.isVisible = true;
    this.startTips();
    this.requestUpdate();
  }

  hide() {
    this.isVisible = false;
    this.stopTips();
    this.requestUpdate();
  }

  private nextTip() {
    this.tipIndex = (this.tipIndex + 1) % loadingTips().length;
    // A manual skip restarts the clock so the new tip gets its full time.
    this.startTips();
  }

  private startTips() {
    this.stopTips();
    this.tipTimer = setInterval(() => {
      this.tipIndex = (this.tipIndex + 1) % loadingTips().length;
    }, TIP_INTERVAL_MS);
  }

  private stopTips() {
    if (this.tipTimer !== null) {
      clearInterval(this.tipTimer);
      this.tipTimer = null;
    }
  }
}
