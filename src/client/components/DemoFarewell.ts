import { html, LitElement, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { maps } from "../../core/game/Game";
import { SURVIVAL_WAVES } from "../../core/game/Survival";
import { DemoStats, demoStats, openWishlist } from "../Demo";
import { requestDesktopQuit } from "../DesktopShell";
import { translateText } from "../Utils";

/** The player's records in the demo: games, wins, Survival's best wave. */
export function demoRecord(stats: DemoStats): TemplateResult {
  const stat = (label: string, value: string) =>
    html`<div
      class="flex flex-col justify-between gap-1 rounded-xl bg-black/25 px-4 py-3"
    >
      <span class="text-xs text-white/55">${label}</span>
      <span class="font-display text-2xl font-bold text-white">${value}</span>
    </div>`;
  return html`<section data-demo-record class="flex flex-col gap-2">
    <h3 class="font-display text-sm font-bold text-white/70">
      ${translateText("demo.record_title")}
    </h3>
    <div class="grid grid-cols-3 gap-2">
      ${stat(translateText("demo.stat_games"), String(stats.games))}
      ${stat(translateText("demo.stat_wins"), String(stats.wins))}
      ${stat(
        translateText("demo.stat_wave"),
        stats.bestWave > 0 ? `${stats.bestWave}/${SURVIVAL_WAVES}` : "–",
      )}
    </div>
  </section>`;
}

/**
 * The end of the demo: when the player quits, what they did in it, what the
 * full game adds, and its wishlist button before the window closes.
 */
@customElement("demo-farewell")
export class DemoFarewell extends LitElement {
  @state() private stats: DemoStats = demoStats();

  createRenderRoot() {
    return this;
  }

  static open(): void {
    let el = document.querySelector("demo-farewell");
    if (el === null) {
      el = document.createElement("demo-farewell");
      document.body.appendChild(el);
    }
    (el as DemoFarewell).stats = demoStats();
  }

  private close = () => this.remove();

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close();
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKey);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKey);
  }

  render() {
    return html`<div
      class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) this.close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        class="flex w-full max-w-xl flex-col gap-5 rounded-2xl border border-white/10 bg-[linear-gradient(170deg,#0f2a22,#08140f)] p-7"
      >
        <div class="flex flex-col gap-2">
          <h2 class="font-display text-3xl font-bold text-white">
            ${translateText("demo.bye_title")}
          </h2>
          <p class="text-white/75">
            ${translateText("demo.bye_body", {
              count: Math.floor(maps.length / 10) * 10,
            })}
          </p>
        </div>
        ${this.stats.games > 0 ? demoRecord(this.stats) : null}
        <button
          type="button"
          data-demo-wishlist
          @click=${() => openWishlist("demo_quit")}
          class="flex items-center justify-center rounded-xl bg-[#1a9fff] px-5 py-4 font-display text-lg font-bold text-white transition-[filter] hover:brightness-110"
        >
          ${translateText("demo.wishlist")}
        </button>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            @click=${this.close}
            class="rounded-xl border border-white/15 px-4 py-3 font-display font-bold text-white/85 hover:bg-white/5"
          >
            ${translateText("demo.bye_stay")}
          </button>
          <button
            type="button"
            data-demo-quit
            @click=${() => requestDesktopQuit()}
            class="rounded-xl border border-white/15 px-4 py-3 font-display font-bold text-white/85 hover:bg-white/5"
          >
            ${translateText("main.quit")}
          </button>
        </div>
      </div>
    </div>`;
  }
}
