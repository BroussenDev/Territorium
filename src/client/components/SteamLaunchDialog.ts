import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { translateText } from "../Utils";
import { steamStoreUrl } from "./SteamWishlist";
import { steamMark } from "./SteamWishlistButton";

export type SteamLockedFeature = "ranked" | "versus" | "public_lobby";

const FEATURES: readonly SteamLockedFeature[] = [
  "ranked",
  "versus",
  "public_lobby",
];

const FEATURE_NAME_KEYS: Record<SteamLockedFeature, string> = {
  ranked: "mode_selector.ranked_title",
  versus: "game_modes.versus_title",
  public_lobby: "steam_launch.public_lobbies",
};

/** A padlock, drawn on the Territorium tile grid. */
export function lockIcon(sizeClass: string) {
  return html`<svg
    viewBox="0 0 24 24"
    class="${sizeClass} shrink-0"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5"></path>
    <rect x="4.5" y="10.5" width="15" height="10.5" rx="1.5"></rect>
    <rect
      x="10.5"
      y="14"
      width="3"
      height="3.5"
      rx=".5"
      fill="currentColor"
      stroke="none"
    ></rect>
  </svg>`;
}

/**
 * Tells a player that the feature they tried opens with the Steam release,
 * and sends them to Territorium's store page to wishlist it. Dispatches
 * `close` when dismissed.
 */
@customElement("steam-launch-dialog")
export class SteamLaunchDialog extends LitElement {
  @property() feature: SteamLockedFeature = "ranked";

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("keydown", this.onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.onKeyDown);
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.close();
  };

  private close() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  render() {
    return html`
      <div
        class="fixed inset-0 z-[10020] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.close();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="steam-launch-title"
          class="relative w-full max-w-lg overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(180deg,#11221c_0%,#0a1512_100%)] text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.85)]"
        >
          <div class="absolute inset-x-0 top-0 z-10 h-[3px] bg-capital"></div>
          <button
            @click=${() => this.close()}
            aria-label=${translateText("common.close")}
            class="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18"></path>
            </svg>
          </button>

          <!-- Banner: the game's mark beside Steam's, over the tile mesh. -->
          <div
            class="relative flex items-center justify-center gap-5 overflow-hidden border-b border-white/10 px-12 bg-[radial-gradient(ellipse_at_50%_0%,rgb(16_185_129/0.22),transparent_70%)] pt-8 pb-6"
          >
            <div
              class="territory-mesh absolute inset-0 bg-emerald-500/[0.06] [mask-image:radial-gradient(ellipse_at_50%_30%,#000,transparent_75%)]"
              aria-hidden="true"
            ></div>
            <img
              src=${assetUrl("images/TerritoriumLogo.svg")}
              alt="Territorium"
              class="relative h-9 w-auto"
              draggable="false"
            />
            <span class="relative h-8 w-px bg-white/20"></span>
            <span class="relative text-white/90">${steamMark("size-9")}</span>
          </div>

          <div class="flex flex-col gap-4 p-5">
            <div>
              <h2
                id="steam-launch-title"
                class="font-display text-xl font-bold leading-snug text-balance"
              >
                ${translateText(`steam_launch.title_${this.feature}`)}
              </h2>
              <p class="mt-1.5 text-sm leading-relaxed text-white/75">
                ${translateText("steam_launch.body")}
              </p>
            </div>

            <ul class="grid grid-cols-3 gap-2">
              ${FEATURES.map((feature) => {
                const current = feature === this.feature;
                return html`<li
                  data-steam-feature=${feature}
                  class="flex flex-col items-center gap-1.5 rounded-md border px-2 py-2.5 text-center ${current
                    ? "border-capital/60 bg-capital/10 text-capital-light"
                    : "border-white/10 bg-black/25 text-white/60"}"
                >
                  ${lockIcon("size-5")}
                  <span class="font-display text-sm font-semibold leading-tight"
                    >${translateText(FEATURE_NAME_KEYS[feature])}</span
                  >
                </li>`;
              })}
            </ul>

            <div class="flex flex-col gap-2.5 sm:flex-row">
              <a
                data-steam-wishlist
                href=${steamStoreUrl(`locked_${this.feature}`)}
                target="_blank"
                rel="noopener noreferrer"
                class="flex flex-[2] items-center justify-center gap-2 rounded-md bg-capital px-4 py-2.5 font-display text-sm font-bold text-capital-ink no-underline transition-colors hover:bg-capital-light"
                @click=${() => this.close()}
              >
                ${steamMark("size-4")} ${translateText("steam_launch.wishlist")}
              </a>
              <button
                class="flex-1 rounded-md border border-white/15 bg-white/[0.04] px-4 py-2.5 font-display text-sm font-semibold text-white/80 transition-colors hover:border-white/30 hover:text-white"
                @click=${() => this.close()}
              >
                ${translateText("steam_launch.later")}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
