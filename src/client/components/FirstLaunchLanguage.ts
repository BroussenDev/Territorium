import { LitElement, html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { translateText } from "../Utils";

export interface FirstLaunchLanguageEntry {
  code: string;
  native: string;
  en: string;
  svg: string;
}

/**
 * The Steam app's first screen after the studio splash: the game starts in
 * English and the player picks the language to play in. Picking a tile
 * switches the game to it at once (this screen included, through LangSelector),
 * so the player reads the result before confirming. Shown once: LangSelector
 * opens it only while no language has been saved.
 */
@customElement("first-launch-language")
export class FirstLaunchLanguage extends LitElement {
  @property({ attribute: false }) languages: FirstLaunchLanguageEntry[] = [];
  // The language the player most likely reads (their Steam language, else
  // their system's), offered first; null when that is English.
  @property({ attribute: false }) suggested: string | null = null;
  @state() private selected = "en";

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
    if (e.key === "Enter") this.confirm();
  };

  private pick(code: string) {
    this.selected = code;
    window.dispatchEvent(
      new CustomEvent("language-selected", { detail: { lang: code } }),
    );
  }

  private confirm() {
    // Saves the choice even when it is the English the game started in.
    window.dispatchEvent(
      new CustomEvent("language-selected", { detail: { lang: this.selected } }),
    );
    this.dispatchEvent(new CustomEvent("close"));
  }

  private ordered(): FirstLaunchLanguageEntry[] {
    const first = [this.suggested, "en"].filter(
      (code, i, all): code is string =>
        code !== null && all.indexOf(code) === i,
    );
    const head = first
      .map((code) => this.languages.find((l) => l.code === code))
      .filter((l): l is FirstLaunchLanguageEntry => l !== undefined);
    const rest = this.languages
      .filter((l) => !first.includes(l.code))
      .sort((a, b) => a.en.localeCompare(b.en));
    return [...head, ...rest];
  }

  render() {
    return html`
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-launch-title"
        class="fixed inset-0 z-[10030] flex items-center justify-center overflow-hidden bg-[#050b09] p-4 text-white"
      >
        <div
          class="territory-mesh absolute inset-0 bg-emerald-500/[0.05] [mask-image:radial-gradient(ellipse_at_50%_20%,#000,transparent_70%)]"
          aria-hidden="true"
        ></div>
        <div
          class="absolute inset-x-0 top-0 h-[45vh] bg-[radial-gradient(ellipse_at_50%_0%,rgb(16_185_129/0.18),transparent_70%)]"
          aria-hidden="true"
        ></div>

        <div class="relative flex w-full max-w-5xl flex-col items-center gap-6">
          <img
            src=${assetUrl("images/TerritoriumLogo.svg")}
            alt="Territorium"
            class="h-10 w-auto"
            draggable="false"
          />
          <div class="text-center">
            <h1
              id="first-launch-title"
              class="font-display text-3xl font-bold text-balance"
            >
              ${translateText("first_launch.title")}
            </h1>
            <p class="mt-2 text-sm text-white/60 text-balance">
              ${translateText("first_launch.subtitle")}
            </p>
          </div>

          <ul
            class="grid max-h-[54vh] w-full grid-cols-2 gap-2 overflow-y-auto p-1 sm:grid-cols-3 lg:grid-cols-5"
          >
            ${this.ordered().map((lang) => {
              const selected = lang.code === this.selected;
              return html`<li>
                <button
                  type="button"
                  data-lang=${lang.code}
                  aria-pressed=${selected}
                  @click=${() => this.pick(lang.code)}
                  class="flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 ${selected
                    ? "border-emerald-400/70 bg-emerald-500/15"
                    : "border-white/10 bg-black/30 hover:border-white/25 hover:bg-white/[0.04]"}"
                >
                  <img
                    src=${assetUrl(`flags/${lang.svg}.svg`)}
                    alt=""
                    class="h-6 w-8 shrink-0 rounded-sm object-cover"
                    draggable="false"
                  />
                  <span class="flex min-w-0 flex-col">
                    <span class="truncate font-display font-semibold"
                      >${lang.native}</span
                    >
                    <span class="truncate text-xs text-white/50"
                      >${lang.code === this.suggested
                        ? translateText("first_launch.suggested")
                        : lang.en}</span
                    >
                  </span>
                </button>
              </li>`;
            })}
          </ul>

          <button
            type="button"
            data-first-launch-continue
            @click=${() => this.confirm()}
            class="min-w-56 rounded-md bg-capital px-10 py-3 font-display text-base font-bold text-capital-ink transition-colors hover:bg-capital-light"
          >
            ${translateText("first_launch.continue")}
          </button>
        </div>
      </div>
    `;
  }
}
