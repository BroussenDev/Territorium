import { LitElement, html } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import "./CosmeticBackground";
import "./NavAccountMenu";
import "./NavUtilityIcons";
import "./NewsBox";
import "./StreamingNow";
import "./TerritoriumEmblem";

@customElement("play-page")
export class PlayPage extends LitElement {
  createRenderRoot() {
    return this;
  }

  render() {
    return html`
      <div
        id="page-play"
        class="flex flex-col gap-2 w-full px-0 lg:px-4 min-h-0"
      >
        <token-login class="absolute"></token-login>
        <rewards-modal class="absolute"></rewards-modal>

        <!-- Mobile: Fixed top bar -->
        <div
          class="lg:hidden fixed left-0 right-0 top-[var(--top-ad-height,0px)] z-40 pt-[env(safe-area-inset-top)] bg-surface border-b border-white/10"
        >
          <div
            class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center h-14 px-2 gap-2"
          >
            <button
              id="hamburger-btn"
              class="col-start-1 justify-self-start h-10 shrink-0 aspect-[4/3] flex text-white/90 rounded-md items-center justify-center transition-colors"
              data-i18n-aria-label="main.menu"
              aria-expanded="false"
              aria-controls="sidebar-menu"
              aria-haspopup="dialog"
              data-i18n-title="main.menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="1.5"
                stroke="currentColor"
                class="size-8"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                />
              </svg>
            </button>

            <div
              class="col-start-2 flex items-center justify-start text-brand min-w-0"
            >
              <img
                src=${assetUrl("images/TerritoriumLogo.svg")}
                alt="Territorium"
                class="h-6 w-auto max-w-full object-contain object-left"
              />
            </div>

            <!-- Right slot: bell, help, settings and the profile control. The menu is
                 the account affordance on every platform now — on CrazyGames
                 its "Sign in" item hands off to their SDK prompt. -->
            <div
              class="col-start-3 justify-self-end shrink-0 flex items-center gap-0.5"
            >
              <nav-utility-icons size="mobile"></nav-utility-icons>
              <nav-account-menu variant="mobile"></nav-account-menu>
            </div>
          </div>
        </div>

        <!-- Top strip: news + identity on the left, Streaming Now on the right. The 2fr/1fr
             split only exists while the panel is live (.streaming-live via has-[]) —
             otherwise the left column takes the full row. -->
        <div
          class="w-full pb-4 lg:pb-0 flex flex-col gap-4 sm:-mx-4 sm:w-[calc(100%+2rem)] lg:mx-0 lg:w-full lg:grid lg:grid-cols-1 lg:has-[.streaming-live]:grid-cols-[2fr_1fr] lg:gap-4 lg:items-stretch"
        >
          <!-- Mobile: spacer for fixed top bar -->
          <div
            class="lg:hidden h-[calc(env(safe-area-inset-top)+56px)] -mb-4"
          ></div>

          <!-- Left column: the hero (emblem, tagline, identity row) over the
               news banner. The hero must not clip and must sit above the
               banner: the clan tag menu drops down out of it. -->
          <div class="flex flex-col gap-2 min-w-0">
            <section
              class="relative z-30 flex items-center gap-6 lg:gap-8 sm:rounded-2xl sm:border sm:border-emerald-400/15 sm:bg-[linear-gradient(115deg,#0f2a21_0%,var(--color-ink)_65%)] sm:px-6 sm:py-5 lg:px-8"
            >
              <!-- Tile mesh fading in from the right edge, echoing the backdrop. -->
              <div
                class="hidden sm:block territory-mesh absolute inset-y-0 right-0 w-2/3 rounded-r-2xl bg-emerald-500/10 [mask-image:linear-gradient(to_left,#000,transparent)] pointer-events-none"
                aria-hidden="true"
              ></div>
              <territorium-emblem
                class="hidden sm:block relative shrink-0 w-20 lg:w-28 drop-shadow-[0_8px_24px_rgb(16_185_129_/_0.25)]"
              ></territorium-emblem>
              <div class="relative flex-1 min-w-0 flex flex-col gap-4">
                <p
                  class="hidden sm:block font-display font-bold text-white text-2xl lg:text-[2.1rem] leading-tight tracking-wide text-balance"
                  data-i18n="main.tagline"
                ></p>

                <!-- Identity row: username over the currently selected cosmetic background. -->
                <div
                  class="relative bg-surface border-y border-white/10 overflow-visible flex items-center sm:min-h-[60px] sm:z-20 sm:border sm:border-emerald-400/20 sm:rounded-xl"
                >
                  <!-- Selected skin/pattern fills the bubble like the player's territory in game. -->
                  <cosmetic-background
                    class="absolute inset-0 z-0 overflow-hidden sm:rounded-xl pointer-events-none"
                  ></cosmetic-background>
                  <div
                    class="relative z-10 flex h-full w-full min-w-0 items-center bg-surface/80 p-1 sm:rounded-xl"
                  >
                    <username-input
                      class="flex-1 min-w-0 h-10 sm:h-[50px]"
                    ></username-input>
                  </div>
                </div>
              </div>
            </section>

            <news-box></news-box>
          </div>

          <!-- Right column: Streaming Now (desktop only), stretched to the left column's
               full height so the top strip has no dead space. -->
          <streaming-now
            class="hidden lg:flex lg:h-full lg:flex-col w-full min-w-0"
          ></streaming-now>
        </div>

        <game-mode-selector></game-mode-selector>
      </div>
    `;
  }
}
