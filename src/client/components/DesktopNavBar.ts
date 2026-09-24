import { LitElement, SVGTemplateResult, html, svg } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
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

// Lucide-style 24x24 stroke icons.
const PAGES: NavPage[] = [
  {
    page: "page-play",
    i18n: "main.play",
    icon: svg`<polygon points="7 4 19 12 7 20 7 4" />`,
  },
  {
    page: "page-item-store",
    i18n: "main.store",
    noCrazyGames: true,
    icon: svg`<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" />`,
  },
  {
    page: "page-inventory",
    i18n: "main.inventory",
    icon: svg`<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" />`,
  },
  {
    page: "page-leaderboard",
    i18n: "main.leaderboard",
    icon: svg`<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />`,
  },
  {
    page: "page-clan",
    i18n: "main.clans",
    noCrazyGames: true,
    icon: svg`<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />`,
  },
];

const ITEM =
  "nav-menu-item relative flex items-center gap-2 rounded-xl px-2.5 xl:px-4 py-2 " +
  "text-[13px] font-semibold uppercase tracking-[0.04em] xl:tracking-[0.08em] text-white/60 " +
  "cursor-pointer transition-colors hover:text-white hover:bg-white/[0.05] " +
  "focus-visible:outline-2 focus-visible:outline-emerald-400 " +
  "[&.active]:text-emerald-300 [&.active]:bg-emerald-400/[0.12] " +
  "[&.active]:shadow-[inset_0_0_0_1px_rgba(52,211,153,0.35)]";

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
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          ${item.icon}
        </svg>
        <span data-i18n=${item.i18n}></span>
        ${isStore && this._notifications.showStoreDot()
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
            <div
              class="flex items-center gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1"
            >
              ${PAGES.map((item) => this._renderItem(item, currentPage))}
            </div>
          </div>
          <!-- Utility cluster: bell, help, settings and the profile control are
               account/notification/utility affordances rather than page links,
               so they sit together on the right, apart from the page tabs. -->
          <div class="flex items-center gap-1 shrink-0">
            <nav-utility-icons size="desktop"></nav-utility-icons>
            <nav-account-menu variant="desktop"></nav-account-menu>
          </div>
        </div>
        <div
          class="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-emerald-400/35 to-transparent"
        ></div>
      </nav>
    `;
  }
}
