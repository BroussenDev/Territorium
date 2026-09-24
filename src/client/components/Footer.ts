import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { composeVersionDisplay, desktopVersion } from "../DesktopShell";
import { currentGameVersion } from "../GameVersion";

@customElement("page-footer")
export class Footer extends LitElement {
  // Per instance, not at module scope: currentGameVersion reads
  // BOOTSTRAP_CONFIG, which the server injects into the page and which is not
  // guaranteed to exist at the moment this module is first imported.
  private readonly gameVersion = currentGameVersion();

  // Starts as the game version alone and gains the shell version once the
  // bridge answers, so the line is never blank while that call is in flight.
  @state() private versionLabel = this.gameVersion;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    // desktopVersion() resolves null off the desktop shell and on its own
    // timeout, so this can only ever leave the label as-is or extend it.
    void desktopVersion().then((shellVersion) => {
      this.versionLabel = composeVersionDisplay(this.gameVersion, shellVersion);
    });
  }

  render() {
    return html`
      <!-- One row at lg: repo and build on the left, legal in the middle,
           language on the right. Stacked and centred below that. -->
      <footer
        class="[.in-game_&]:hidden bg-zinc-900/90 backdrop-blur-md flex flex-col items-center justify-center gap-2 pt-3 pb-3 text-white/50 w-full border-t border-white/10 shrink-0 relative z-50 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:gap-6 lg:px-8"
      >
        <div
          class="flex items-center justify-center gap-3 lg:justify-self-start"
        >
          <a
            href="https://github.com/BroussenDev/Territorium"
            target="_blank"
            rel="noopener noreferrer"
            class="opacity-60 hover:opacity-100 transition-opacity"
          >
            <img
              src=${assetUrl("icons/github-mark-white.svg")}
              data-i18n-alt="main.github"
              class="h-5 w-5 object-contain pointer-events-none"
              draggable="false"
            />
          </a>
          <!-- The nav bar shows the game version alone so it reads the same
               across web and Steam; the full string, shell version included,
               lives down here where a player can quote it in a bug report. -->
          <div class="footer-version text-xs text-center">
            ${this.versionLabel}
          </div>
        </div>

        <div class="flex flex-col items-center gap-1 px-4">
          <div class="text-xs flex items-center justify-center gap-4">
            <a
              href="/terms-of-service.html"
              data-i18n="main.terms_of_service"
              target="_blank"
              class="hover:text-white transition-colors"
            ></a>
            <a
              href="/privacy-policy.html"
              data-i18n="main.privacy_policy"
              target="_blank"
              class="hover:text-white transition-colors"
            ></a>
          </div>
          <!-- Kept visible (AGPL section 7(b) notice), but low-key. -->
          <span
            data-i18n="main.copyright"
            class="text-[10px] text-white/30 text-center"
          ></span>
        </div>

        <!-- Single instance: translateText() resolves the active language via
             document.querySelector("lang-selector"), so a second one would
             shadow it. -->
        <lang-selector
          class="absolute right-4 top-3 lg:static lg:justify-self-end"
        ></lang-selector>
      </footer>
    `;
  }
}
