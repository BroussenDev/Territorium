import { html, LitElement } from "lit";
import { customElement } from "lit/decorators.js";
import { assetUrl } from "../core/AssetUrls";
import { translateText } from "./Utils";

/**
 * The "What's new" window: once per update that has notes, at the first
 * visit after it. A first visit ever sets the mark without showing it: a
 * newcomer has nothing to compare with.
 *
 * Each release with notes bumps WHATS_NEW_ID and lists its items as
 * translation keys (whats_new.<id>.<n>), so every language reads them.
 */
export const WHATS_NEW_ID = "v0_1_173";
// An item may show a screenshot of the new feature: `image` is a path
// under resources/ (e.g. "images/whats-new/v0_1_170/end-screen.webp").
export const WHATS_NEW_ITEMS: { key: string; image?: string }[] = [
  { key: "discord" },
  { key: "discord_link" },
  { key: "discord_bugs" },
];
const SEEN_KEY = "territorium.whatsNewSeen";

/** Whether this visit shows the notes, and the mark to store. */
export function whatsNewDecision(seen: string | null): {
  show: boolean;
  mark: string;
} {
  return { show: seen !== null && seen !== WHATS_NEW_ID, mark: WHATS_NEW_ID };
}

export function showWhatsNewIfNeeded(): void {
  let seen: string | null;
  try {
    seen = localStorage.getItem(SEEN_KEY);
  } catch {
    return;
  }
  const { show, mark } = whatsNewDecision(seen);
  try {
    localStorage.setItem(SEEN_KEY, mark);
  } catch {
    return;
  }
  if (show) document.body.appendChild(document.createElement("whats-new"));
}

@customElement("whats-new")
export class WhatsNew extends LitElement {
  createRenderRoot() {
    return this;
  }

  private close() {
    this.remove();
  }

  render() {
    return html`<div
      class="fixed inset-0 z-[10042] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) this.close();
      }}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Escape") this.close();
      }}
    >
      <div
        data-whats-new
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        class="flex max-h-[85dvh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-emerald-400/40 bg-plate-800 p-6 text-white shadow-2xl"
      >
        <div class="flex items-center gap-3">
          <img
            src=${assetUrl("images/Megaphone.svg")}
            alt=""
            aria-hidden="true"
            class="size-7"
          />
          <h2 id="whats-new-title" class="m-0 text-xl font-bold">
            ${translateText("whats_new.title")}
          </h2>
        </div>
        <ul class="m-0 flex list-none flex-col gap-3 p-0">
          ${WHATS_NEW_ITEMS.map(
            ({ key: item, image }) =>
              html`<li
                class="rounded-xl border border-white/10 bg-black/25 p-3"
              >
                ${image
                  ? html`<img
                      src=${assetUrl(image)}
                      alt=""
                      loading="lazy"
                      class="mb-2 w-full rounded-lg border border-white/10"
                    />`
                  : null}
                <div class="font-bold text-emerald-200">
                  ${translateText(`whats_new.${WHATS_NEW_ID}.${item}_title`)}
                </div>
                <div class="mt-1 text-sm text-white/80">
                  ${translateText(`whats_new.${WHATS_NEW_ID}.${item}`)}
                </div>
              </li>`,
          )}
        </ul>
        <button
          type="button"
          class="rounded-xl bg-emerald-600 px-4 py-2.5 font-bold transition-colors hover:bg-emerald-500"
          @click=${() => this.close()}
        >
          ${translateText("whats_new.ok")}
        </button>
      </div>
    </div>`;
  }
}
