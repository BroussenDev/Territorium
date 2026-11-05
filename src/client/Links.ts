import { html, LitElement, svg, type SVGTemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import { currentLanguage, translateText } from "./Utils";

/**
 * The official Territorium sites: the "Links" window of the main menu footer
 * and the "Suggest an idea" shortcut. The pages that exist in French and
 * English (ideas board, leaderboards) pick their path from the game language.
 */

const SUPPORT = "https://support.territorium.gg";
const SITE = "https://territorium.gg";

const isFrench = (lang: string): boolean => lang.toLowerCase().startsWith("fr");

/** The ideas board, in the player's language (/idees in French, /ideas otherwise). */
export function ideasUrl(lang: string = currentLanguage()): string {
  return `${SUPPORT}${isFrench(lang) ? "/idees" : "/ideas"}`;
}

/**
 * Opens a page in the player's own browser. The desktop shell hands a new
 * window to the system browser, like every other external link of the game.
 */
export function openExternalLink(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** The "Suggest an idea" entries (main menu, in-game menu) call this. */
export function openIdeas(): void {
  openExternalLink(ideasUrl());
}

export type LinkId =
  | "help"
  | "ideas"
  | "wiki"
  | "status"
  | "developers"
  | "press"
  | "leaderboards"
  | "discord";

export interface SiteLink {
  id: LinkId;
  url: string;
}

/** Every site, in the order the window lists them. */
export function siteLinks(lang: string = currentLanguage()): SiteLink[] {
  const fr = isFrench(lang);
  return [
    { id: "help", url: SUPPORT },
    { id: "ideas", url: ideasUrl(lang) },
    { id: "wiki", url: "https://wiki.territorium.gg" },
    { id: "status", url: "https://status.territorium.gg" },
    { id: "developers", url: "https://developers.territorium.gg" },
    { id: "press", url: "https://presse.territorium.gg" },
    {
      id: "leaderboards",
      url: `${SITE}${fr ? "/classements" : "/leaderboards"}`,
    },
    { id: "discord", url: "https://discord.gg/SEnDhvxVtv" },
  ];
}

/** Drawn on a 24px grid with the emerald outline and a gold accent. */
const ICONS: Record<LinkId, SVGTemplateResult> = {
  help: svg`<circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="3.5" class="text-capital" />
    <path d="M5.6 5.6 9.5 9.5M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />`,
  ideas: svg`<path d="M9 18h6M10 21h4" />
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z" />
    <path d="M12 7v3l1.5 1" class="text-capital" />`,
  wiki: svg`<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5z" />
    <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" />
    <path d="M6.5 8h2.5M6.5 11h2.5M15 8h2.5" class="text-capital" />`,
  status: svg`<rect x="3" y="4" width="18" height="7" rx="2" />
    <rect x="3" y="13" width="18" height="7" rx="2" />
    <path d="M7 7.5h.01M7 16.5h.01" class="text-capital" />
    <path d="M12 16.5h5" />`,
  developers: svg`<path d="M8.5 7 3.5 12l5 5M15.5 7l5 5-5 5" />
    <path d="m13.5 5-3 14" class="text-capital" />`,
  press: svg`<path d="M5 4h12v16H7a2 2 0 0 1-2-2z" />
    <path d="M17 9h2v9a2 2 0 0 1-2 2" />
    <path d="M8 8h6M8 12h6M8 16h3" class="text-capital" />`,
  leaderboards: svg`<path d="M7 4h10v6a5 5 0 0 1-10 0z" />
    <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
    <path d="M12 15v3M8.5 20h7" class="text-capital" />`,
  discord: svg`<path d="M5 5h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    <path d="M9 11h.01M15 11h.01" class="text-capital" />`,
};

export function renderLinkIcon(
  id: LinkId,
  classes = "size-6",
): SVGTemplateResult {
  return svg`<svg
    viewBox="0 0 24 24"
    class=${classes}
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >${ICONS[id]}</svg>`;
}

/** Opens the window; one at a time. */
export function openLinks(): void {
  if (document.querySelector("links-modal") !== null) return;
  document.body.appendChild(document.createElement("links-modal"));
}

@customElement("links-modal")
export class LinksModal extends LitElement {
  private returnFocus: HTMLElement | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    const active = document.activeElement;
    this.returnFocus = active instanceof HTMLElement ? active : null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.returnFocus?.focus();
  }

  firstUpdated() {
    this.querySelector<HTMLElement>("[data-links-modal]")?.focus();
  }

  private close() {
    this.remove();
  }

  private onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") this.close();
  }

  render() {
    return html`<div
      class="fixed inset-0 z-[10042] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) this.close();
      }}
      @keydown=${(e: KeyboardEvent) => this.onKeydown(e)}
    >
      <div
        data-links-modal
        role="dialog"
        aria-modal="true"
        aria-labelledby="links-title"
        tabindex="-1"
        class="flex max-h-[90dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-emerald-400/40 bg-plate-800 p-5 text-white shadow-2xl outline-none sm:p-6"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="links-title" class="m-0 text-xl font-bold">
              ${translateText("links.title")}
            </h2>
            <p class="m-0 mt-1 text-sm text-white/60">
              ${translateText("links.intro")}
            </p>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-full p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            aria-label=${translateText("links.close")}
            @click=${() => this.close()}
          >
            <svg
              viewBox="0 0 24 24"
              class="size-5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <ul class="m-0 flex list-none flex-col gap-2 p-0">
          ${siteLinks().map(
            (link) =>
              html`<li>
                <a
                  href=${link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-link=${link.id}
                  class="flex items-center gap-3 rounded-xl border border-white/10 bg-black/25 p-3 text-white no-underline transition-colors hover:border-emerald-400/50 hover:bg-white/5"
                  @click=${(e: Event) => {
                    e.preventDefault();
                    openExternalLink(link.url);
                  }}
                >
                  <span
                    class="flex size-11 shrink-0 items-center justify-center rounded-lg border border-emerald-400/30 bg-[radial-gradient(circle_at_50%_40%,rgba(52,211,153,0.16),transparent_70%)] text-emerald-300"
                  >
                    ${renderLinkIcon(link.id)}
                  </span>
                  <span class="min-w-0">
                    <span class="block font-bold text-emerald-200"
                      >${translateText(`links.${link.id}_title`)}</span
                    >
                    <span class="block text-sm text-white/70"
                      >${translateText(`links.${link.id}_desc`)}</span
                    >
                  </span>
                </a>
              </li>`,
          )}
        </ul>
      </div>
    </div>`;
  }
}
