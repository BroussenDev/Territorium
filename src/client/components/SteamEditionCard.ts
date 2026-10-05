import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { translateText } from "../Utils";
import { steamStoreUrl } from "./SteamWishlist";
import { steamMark } from "./SteamWishlistButton";

/** What the Steam app adds to the game (translation keys). */
export const STEAM_EDITION_PERKS = [
  "store.steam_edition.perk_ranked",
  "store.steam_edition.perk_versus",
  "store.steam_edition.perk_lobbies",
  "store.steam_edition.perk_achievements",
  "store.steam_edition.perk_cloud",
  "store.steam_edition.perk_friends",
] as const;

/**
 * A card among the subscription tiers: not a subscription but the game on
 * Steam, with what it adds over the browser. On the website it offers to
 * wishlist the game, like the game's other Steam invitations; in the Steam
 * app the player has bought it, and the card says so.
 */
@customElement("steam-edition-card")
export class SteamEditionCard extends LitElement {
  /** True in the Steam app: the player owns the game there. */
  @property({ type: Boolean }) owned = false;

  createRenderRoot() {
    return this;
  }

  render() {
    return html`<div
      data-steam-edition
      class="relative flex h-full flex-col overflow-hidden rounded-lg border border-[#66c0f4]/40 bg-[linear-gradient(180deg,#1b2838_0%,#141d29_100%)] shadow-[inset_0_3px_0_#66c0f4] transition-shadow duration-200 hover:shadow-[inset_0_3px_0_#66c0f4,0_18px_36px_-18px_#66c0f4]"
    >
      <div class="flex flex-col items-start gap-0.5 px-3 pt-3.5 leading-tight">
        <span class="font-display text-base font-bold text-white"
          >${translateText("store.steam_edition.title")}</span
        >
        <span class="text-xs font-semibold text-[#66c0f4]"
          >${translateText("store.steam_edition.tag")}</span
        >
      </div>
      <div
        class="m-3 mb-0 flex flex-1 flex-col gap-3 rounded-md bg-black/30 p-3 ring-1 ring-inset ring-white/[0.06]"
      >
        <div class="flex items-center justify-center gap-2.5 text-[#c7d5e0]">
          ${steamMark("size-8")}
          <img
            src=${assetUrl("images/TerritoriumLogo.svg")}
            alt="Territorium"
            class="h-4 w-auto opacity-90"
            draggable="false"
          />
        </div>
        <ul class="flex flex-col gap-1.5">
          ${STEAM_EDITION_PERKS.map(
            (key) =>
              html`<li
                class="flex items-start gap-1.5 text-xs font-semibold text-white/85"
              >
                <svg
                  viewBox="0 0 16 16"
                  class="mt-px size-3.5 shrink-0 text-[#66c0f4]"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 8.5l3.2 3L13 4.5"></path>
                </svg>
                <span>${translateText(key)}</span>
              </li>`,
          )}
        </ul>
      </div>
      ${this.owned ? this.renderOwned() : this.renderWishlist()}
    </div>`;
  }

  // Same box as the store's other "you have this" statuses.
  private renderOwned() {
    return html`<span
      data-steam-edition-owned
      class="m-3 flex min-h-11 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 py-1.5 text-center text-base font-bold text-emerald-300"
      >${translateText("store.steam_edition.owned")}</span
    >`;
  }

  private renderWishlist() {
    return html`<a
      data-steam-edition-wishlist
      href=${steamStoreUrl("store_subscriptions")}
      target="_blank"
      rel="noopener noreferrer"
      class="m-3 flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[linear-gradient(to_bottom,#8ec72e,#4c7a17)] px-2 py-1.5 text-center text-sm font-bold leading-tight text-white no-underline transition-[filter] hover:brightness-110"
    >
      ${steamMark("size-4")}
      <span>${translateText("steam_launch.wishlist")}</span>
    </a>`;
  }
}
