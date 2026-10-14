import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { crazyGamesSDK } from "../CrazyGamesSDK";
import { isDesktopShell } from "../DesktopShell";
import { STEAM_LAUNCH_LOCKED } from "../SteamLaunch";
import { translateText } from "../Utils";
import { steamStoreUrl } from "./SteamWishlist";
import { steamMark } from "./SteamWishlistButton";

// How long a closed homepage card stays away. Stored in this browser only,
// as the player's own choice: nothing is sent anywhere.
const DISMISS_KEY = "steam-promo-dismissed-at";
const DISMISS_DAYS = 7;

/** What the Steam app has that the browser does not, in display order. */
export const STEAM_FEATURES = [
  "ranked",
  "versus",
  "public",
  "workshop",
  "offline",
  "cloud",
] as const;

/** Whether a card closed at `dismissedAt` (ms) is still away at `now`. */
export function promoDismissed(dismissedAt: number | null, now: number) {
  if (dismissedAt === null || !Number.isFinite(dismissedAt)) return false;
  return now - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function readDismissedAt(): number | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

/**
 * Territorium's own promotion of its Steam app, in place of advertising: the
 * website carries no ad network, tracker or third-party tag, and this is
 * plain markup linking to the store page (the click is counted by Steam on
 * its own site, through the UTM campaign). Never inside the Steam app, where
 * the player already has it, nor on CrazyGames.
 *
 * - "banner": the homepage card, which the player can close for a week.
 * - "compact": a single line, for the end of a game.
 */
@customElement("steam-promo")
export class SteamPromo extends LitElement {
  @property({ type: String }) variant: "banner" | "compact" = "banner";
  /** UTM campaign naming the placement, e.g. "homepage" or "winmodal". */
  @property({ type: String }) campaign = "";

  @state() private dismissed = promoDismissed(readDismissedAt(), Date.now());

  createRenderRoot() {
    return this;
  }

  private dismiss = () => {
    this.dismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Private window: closed for this visit only.
    }
  };

  render() {
    if (isDesktopShell() || crazyGamesSDK.isOnCrazyGames()) return nothing;
    return this.variant === "compact"
      ? this.renderCompact()
      : this.renderBanner();
  }

  private wishlistButton(size: "md" | "sm") {
    const pad = size === "md" ? "px-4 py-2.5 text-sm" : "px-3 py-1.5 text-xs";
    return html`<a
      href=${steamStoreUrl(this.campaign)}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[linear-gradient(90deg,#06bfff,#2d73ff)] ${pad} font-semibold text-white shadow-lg shadow-sky-900/30 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
    >
      ${steamMark(size === "md" ? "size-5" : "size-4")}
      ${translateText("steam_launch.wishlist")}
    </a>`;
  }

  private renderBanner() {
    if (this.dismissed) return nothing;
    return html`<section
      class="relative overflow-hidden rounded-xl border border-emerald-400/20 bg-[radial-gradient(ellipse_at_top_left,rgba(16,185,129,0.18),transparent_60%),linear-gradient(135deg,#0c1d18,#0a1512_55%,#101a24)] p-4 sm:p-5"
      aria-labelledby="steam-promo-title"
    >
      <button
        type="button"
        class="absolute right-2 top-2 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        aria-label=${translateText("steam_promo.dismiss")}
        title=${translateText("steam_promo.dismiss")}
        @click=${this.dismiss}
      >
        <svg viewBox="0 0 24 24" class="size-4" aria-hidden="true">
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
      <div
        class="flex flex-col gap-4 md:flex-row md:items-center md:gap-6 pr-6"
      >
        <img
          src=${assetUrl("images/TerritoriumLogo.svg")}
          alt=""
          class="hidden h-12 w-auto shrink-0 object-contain md:block"
          draggable="false"
        />
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <h2
              id="steam-promo-title"
              class="font-display text-lg font-bold text-white"
            >
              ${translateText("steam_promo.title")}
            </h2>
            ${STEAM_LAUNCH_LOCKED
              ? html`<span
                  class="rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-0.5 text-[11px] font-semibold text-amber-200"
                  >${translateText("steam_launch.coming")}</span
                >`
              : nothing}
          </div>
          <p class="mt-1 text-sm text-white/65">
            ${translateText("steam_promo.subtitle")}
          </p>
          <ul class="mt-3 flex flex-wrap gap-1.5" role="list">
            ${STEAM_FEATURES.map(
              (feature) =>
                html`<li
                  class="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-white/80"
                >
                  ${translateText(`steam_promo.feature_${feature}`)}
                </li>`,
            )}
          </ul>
        </div>
        <div class="flex flex-col items-start gap-2 md:items-end">
          ${this.wishlistButton("md")}
          <a
            href="#modal=store&tab=editions"
            class="text-xs text-emerald-300/90 underline decoration-emerald-300/30 transition-colors hover:text-emerald-200"
            >${translateText("steam_promo.editions")}</a
          >
        </div>
      </div>
    </section>`;
  }

  private renderCompact() {
    return html`<div
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-400/20 bg-sky-400/[0.06] px-3 py-2.5"
    >
      <span class="flex min-w-0 items-center gap-2 text-sm text-white/80">
        ${steamMark("size-4 text-sky-300")}
        ${translateText("steam_promo.compact")}
      </span>
      ${this.wishlistButton("sm")}
    </div>`;
  }
}
