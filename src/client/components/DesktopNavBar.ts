import { LitElement, SVGTemplateResult, html } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { isDemo } from "../Demo";
import { uiIconPaths } from "../ui/UiIcons";
import "./NavAccountMenu";
import { NavNotificationsController } from "./NavNotificationsController";
import "./NavUtilityIcons";

interface NavPage {
  page: string;
  i18n: string;
  icon: SVGTemplateResult;
  // Hidden on CrazyGames, where the store and clans aren't available.
  noCrazyGames?: boolean;
}

// Shared menu icon language (ui/UiIcons.ts).
const PAGES: NavPage[] = [
  {
    page: "page-play",
    i18n: "main.play",
    icon: uiIconPaths("play"),
  },
  {
    page: "page-game-modes",
    i18n: "main.modes",
    icon: uiIconPaths("modes"),
  },
  {
    page: "page-item-store",
    i18n: "main.store",
    noCrazyGames: true,
    icon: uiIconPaths("store"),
  },
  {
    page: "page-inventory",
    i18n: "main.inventory",
    icon: uiIconPaths("inventory"),
  },
  {
    page: "page-leaderboard",
    i18n: "main.leaderboard",
    icon: uiIconPaths("leaderboard"),
  },
  {
    page: "page-tournaments",
    i18n: "tournaments.title",
    noCrazyGames: true,
    icon: uiIconPaths("tournaments"),
  },
  {
    page: "page-clan",
    i18n: "main.clans",
    noCrazyGames: true,
    icon: uiIconPaths("clans"),
  },
];

// Flat tabs: the active one is marked by the claim strip (styles.css) along
// the bar's bottom edge, like a border of freshly taken tiles.
const ITEM =
  "nav-tab nav-menu-item relative flex h-16 items-center gap-2 px-2 xl:px-4 whitespace-nowrap " +
  "font-display text-[15px] font-semibold text-white/55 " +
  "cursor-pointer transition-colors hover:text-white " +
  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-capital " +
  "[&.active]:text-white [&.active_svg]:text-brand-bright";

@customElement("desktop-nav-bar")
export class DesktopNavBar extends LitElement {
  private _notifications = new NavNotificationsController(this);

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("showPage", this._onShowPage);

    const current = window.currentPageId;
    if (current) {
      // Wait for render
      this.updateComplete.then(() => {
        this._updateActiveState(current);
      });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("showPage", this._onShowPage);
  }

  private _onShowPage = (e: Event) => {
    const pageId = (e as CustomEvent).detail;
    this._updateActiveState(pageId);
  };

  private _updateActiveState(pageId: string) {
    this.querySelectorAll(".nav-menu-item").forEach((el) => {
      if ((el as HTMLElement).dataset.page === pageId) {
        el.classList.add("active");
      } else {
        el.classList.remove("active");
      }
    });
  }

  private _renderItem(item: NavPage, currentPage: string) {
    const isStore = item.page === "page-item-store";
    const showDot =
      (isStore && this._notifications.showStoreDot()) ||
      (item.page === "page-inventory" &&
        this._notifications.showInventoryDot());
    // The label lives in its own span: data-i18n replaces the element's
    // text, which would wipe the icon if it sat on the button.
    return html`
      <button
        class="${ITEM} ${item.noCrazyGames
          ? "no-crazygames"
          : ""} ${currentPage === item.page ? "active" : ""}"
        data-page=${item.page}
        @click=${isStore ? this._notifications.onStoreClick : null}
      >
        <svg
          class="hidden xl:block w-4 h-4 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          ${item.icon}
        </svg>
        <span data-i18n=${item.i18n}></span>
        ${showDot
          ? html`
              <span
                class="absolute top-1 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping"
              ></span>
              <span
                class="absolute top-1 right-1.5 w-2 h-2 bg-red-500 rounded-full"
              ></span>
            `
          : ""}
      </button>
    `;
  }

  render() {
    window.currentPageId ??= "page-play";
    const currentPage = window.currentPageId;

    return html`
      <nav
        class="hidden lg:block w-full shrink-0 z-50 relative bg-ink/90 backdrop-blur-md"
      >
        <div
          class="mx-auto flex h-16 max-w-[1280px] items-center gap-3 xl:gap-6 px-4 xl:px-6"
        >
          <button
            class="nav-menu-item flex items-center gap-3 shrink-0 cursor-pointer"
            data-page="page-play"
            aria-label="Territorium"
          >
            <img
              class="block h-6 xl:h-7 aspect-[403/64]"
              src=${assetUrl("images/TerritoriumLogo.svg")}
              alt="Territorium"
            />
            <span
              id="game-version"
              class="l-header__highlightText empty:hidden rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[11px] leading-none"
            ></span>
          </button>
          <div class="flex flex-1 justify-center">
            <div class="flex items-center">
              ${(isDemo()
                ? PAGES.filter((p) => p.page === "page-play")
                : PAGES
              ).map((item) => this._renderItem(item, currentPage))}
            </div>
          </div>
          <!-- Utility cluster: bell, help, settings and the profile control are
               account/notification/utility affordances rather than page links,
               so they sit together on the right, apart from the page tabs. -->
          <div class="flex items-center gap-1 shrink-0">
            <nav-utility-icons size="desktop"></nav-utility-icons>
            ${isDemo()
              ? html`<span
                  class="rounded-md bg-capital px-2.5 py-1 font-display text-xs font-bold tracking-[0.12em] text-ink"
                  data-i18n="demo.badge"
                ></span>`
              : html`<nav-account-menu variant="desktop"></nav-account-menu>`}
          </div>
        </div>
        <div
          class="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent"
        ></div>
      </nav>
    `;
  }
}
