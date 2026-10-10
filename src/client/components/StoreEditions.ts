import { html, LitElement, nothing, svg, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { UserMeResponse } from "../../core/ApiSchemas";
import { isDesktopShell } from "../DesktopShell";
import { translateText } from "../Utils";
import { openInSteamOverlay } from "../Workshop";
import { STEAM_EDITION_PERKS } from "./SteamEditionCard";
import { steamStoreUrl } from "./SteamWishlist";
import { steamMark } from "./SteamWishlistButton";
import { HIGH_COMMANDER_SHAPES } from "./ui/HighCommanderBadge";

// The store's "Editions" tab: the game on Steam and its Deluxe edition (the
// "Pack Conquérant" DLC) side by side, row by row. The Deluxe adds cosmetics
// and a month of subscription, never anything that helps win a game.

export const DELUXE_DLC_APP_ID = 5394060;
const DELUXE_STORE_URL = `https://store.steampowered.com/app/${DELUXE_DLC_APP_ID}/`;

interface Row {
  label: string;
  detail?: string;
  icon?: TemplateResult;
  deluxeOnly: boolean;
}

@customElement("store-editions")
export class StoreEditions extends LitElement {
  @property({ attribute: false }) userMeResponse: UserMeResponse | false =
    false;

  createRenderRoot() {
    return this;
  }

  private rows(): Row[] {
    const t = (key: string) => translateText(key);
    return [
      { label: t("store.editions.row_game"), deluxeOnly: false },
      { label: t("store.editions.row_offline"), deluxeOnly: false },
      { label: t("store.editions.row_workshop"), deluxeOnly: false },
      ...STEAM_EDITION_PERKS.map((key) => ({
        label: t(key),
        deluxeOnly: false,
      })),
      {
        label: t("deluxe.badge"),
        detail: t("deluxe_reward.item_badge"),
        icon: html`<svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
          ${HIGH_COMMANDER_SHAPES}
        </svg>`,
        deluxeOnly: true,
      },
      {
        label: t("deluxe_reward.item_emblem"),
        detail: t("deluxe_reward.item_emblem_detail"),
        icon: html`<img
          src="/cosmetics/flags/conquerant.svg"
          alt=""
          class="h-5 w-7 rounded-sm object-cover"
          draggable="false"
        />`,
        deluxeOnly: true,
      },
      {
        label: t("deluxe_reward.item_patterns"),
        detail: t("deluxe_reward.item_patterns_detail"),
        icon: ICON_PATTERN,
        deluxeOnly: true,
      },
      {
        label: t("deluxe_reward.item_frame"),
        detail: t("deluxe_reward.item_frame_detail"),
        icon: ICON_FRAME,
        deluxeOnly: true,
      },
      {
        label: t("deluxe_reward.item_subscription"),
        detail: t("deluxe_reward.item_subscription_detail"),
        icon: ICON_CROWN,
        deluxeOnly: true,
      },
    ];
  }

  render() {
    const inApp = isDesktopShell();
    const ownsDeluxe =
      this.userMeResponse !== false && !!this.userMeResponse.deluxe;
    return html`<section
      data-store-editions
      class="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-8"
    >
      <header class="flex flex-col gap-1.5">
        <h2 class="font-display text-2xl font-bold text-white">
          ${translateText("store.editions.title")}
        </h2>
        <p class="max-w-2xl text-sm leading-relaxed text-white/65">
          ${translateText("store.editions.intro")}
        </p>
      </header>

      <div
        class="overflow-hidden rounded-lg border border-white/10 bg-[#0b1218]"
        role="table"
        aria-label=${translateText("store.editions.title")}
      >
        <div
          role="row"
          class="grid grid-cols-[minmax(0,1fr)_88px_88px] sm:grid-cols-[minmax(0,1fr)_150px_150px] items-end border-b border-white/10"
        >
          <span role="columnheader"
            ><span class="sr-only"
              >${translateText("store.editions.content")}</span
            ></span
          >
          ${this.columnHead(
            translateText("store.editions.standard"),
            translateText("store.editions.standard_tag"),
            "text-[#66c0f4]",
            "",
          )}
          ${this.columnHead(
            translateText("store.editions.deluxe"),
            translateText("store.editions.deluxe_tag"),
            "text-[#f5d27a]",
            "bg-[linear-gradient(180deg,rgb(122_24_40/0.45),transparent)]",
          )}
        </div>
        ${this.rows().map(
          (row, i) =>
            html`<div
              role="row"
              class="grid grid-cols-[minmax(0,1fr)_88px_88px] sm:grid-cols-[minmax(0,1fr)_150px_150px] items-center ${i %
                2 ===
              0
                ? "bg-white/[0.02]"
                : ""} ${row.deluxeOnly && !this.rows()[i - 1]?.deluxeOnly
                ? "border-t border-[#e8b84a]/25"
                : ""}"
            >
              <span
                role="cell"
                class="flex items-center gap-3 px-4 py-2.5 text-sm text-white/85"
              >
                ${row.icon
                  ? html`<span
                      class="flex size-7 shrink-0 items-center justify-center"
                      >${row.icon}</span
                    >`
                  : nothing}
                <span class="min-w-0">
                  <span class="block font-semibold">${row.label}</span>
                  ${row.detail
                    ? html`<span class="block text-xs text-white/50"
                        >${row.detail}</span
                      >`
                    : nothing}
                </span>
              </span>
              ${this.mark(!row.deluxeOnly, "text-[#66c0f4]")}
              ${this.mark(true, "text-[#f5d27a]", "bg-[rgb(122_24_40/0.12)]")}
            </div>`,
        )}
        <div
          role="row"
          class="grid grid-cols-[minmax(0,1fr)_88px_88px] sm:grid-cols-[minmax(0,1fr)_150px_150px] items-center gap-y-2 border-t border-white/10 py-3"
        >
          <span role="cell" class="px-4 text-xs text-white/50"
            >${translateText("store.editions.fair")}</span
          >
          <span role="cell" class="px-1.5 sm:px-3"
            >${inApp
              ? this.owned()
              : this.steamButton(
                  steamStoreUrl("store_editions"),
                  "bg-[linear-gradient(to_bottom,#8ec72e,#4c7a17)] text-white",
                )}</span
          >
          <span role="cell" class="px-1.5 sm:px-3"
            >${ownsDeluxe
              ? this.owned()
              : this.steamButton(
                  DELUXE_STORE_URL,
                  "bg-[linear-gradient(160deg,#e8b84a,#a4741d)] text-[#2a1405]",
                )}</span
          >
        </div>
      </div>
    </section>`;
  }

  private columnHead(
    name: string,
    tag: string,
    tone: string,
    background: string,
  ) {
    return html`<span
      role="columnheader"
      class="flex flex-col items-center gap-0.5 px-1 pb-3 pt-4 text-center ${background}"
    >
      <span class="font-display text-sm font-bold text-white sm:text-base"
        >${name}</span
      >
      <span class="text-[11px] font-semibold leading-tight ${tone}"
        >${tag}</span
      >
    </span>`;
  }

  private mark(included: boolean, tone: string, background = "") {
    return html`<span
      role="cell"
      class="flex h-full items-center justify-center py-2.5 ${background}"
    >
      ${included
        ? html`<svg
            viewBox="0 0 16 16"
            class="size-4 ${tone}"
            fill="none"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linecap="round"
            stroke-linejoin="round"
            role="img"
            aria-label=${translateText("store.editions.included")}
          >
            <path d="M3 8.5l3.2 3L13 4.5"></path>
          </svg>`
        : html`<span
            class="text-white/25"
            aria-label=${translateText("store.editions.not_included")}
            >—</span
          >`}
    </span>`;
  }

  private owned() {
    return html`<span
      class="flex min-h-10 items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2 text-center text-sm font-bold text-emerald-300"
      >${translateText("store.editions.owned")}</span
    >`;
  }

  // On Steam's page: in the Steam app, through its overlay.
  private steamButton(url: string, style: string) {
    return html`<a
      href=${url}
      target="_blank"
      rel="noopener noreferrer"
      class="flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-center text-xs font-bold leading-tight no-underline transition-[filter] hover:brightness-110 sm:text-sm ${style}"
      @click=${(e: Event) => {
        if (openInSteamOverlay(url)) e.preventDefault();
      }}
    >
      ${steamMark("size-4")}
      <span>${translateText("store.editions.see_on_steam")}</span>
    </a>`;
  }
}

const ICON_PATTERN = svg`<svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
  <rect x="2" y="2" width="20" height="20" rx="3" fill="#5e1120" stroke="#e8b84a" stroke-width="1.2"></rect>
  <path d="M6 7l4 4M14 7l4 4M6 15l4 4M14 15l4 4M10 7l-4 4M18 7l-4 4M10 15l-4 4M18 15l-4 4" stroke="#e8b84a" stroke-width="1.2" stroke-linecap="round"></path>
</svg>`;
const ICON_CROWN = svg`<svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
  <path d="M3 17 4.5 7l4.5 4 3-6 3 6 4.5-4L21 17Z" fill="#e8b84a"></path>
  <rect x="3" y="18" width="18" height="2.5" rx="1" fill="#f2d27a"></rect>
</svg>`;
const ICON_FRAME = svg`<svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
  <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="#e8b84a" stroke-width="2"></rect>
  <rect x="6.5" y="8.5" width="11" height="7" rx="1" fill="#5e1120"></rect>
</svg>`;
