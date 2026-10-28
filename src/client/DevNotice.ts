import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../core/AssetUrls";
import { openBugReport } from "./BugReport";
import { isDesktopShell } from "./DesktopShell";
import { translateText } from "./Utils";

const SEEN_KEY = "territorium.devNoticeSeen";

/**
 * Whether the "game in development" notice greets this visit: on the
 * website only (the Steam app has its own early-access page), once per
 * browser session so coming back from a game doesn't show it again.
 */
export function shouldShowDevNotice(
  desktop: boolean,
  storage: Pick<Storage, "getItem"> | null,
): boolean {
  if (desktop) return false;
  try {
    return storage?.getItem(SEEN_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Shows the notice when this visit should get it. */
export function showDevNoticeIfNeeded(): void {
  let storage: Storage | null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  if (!shouldShowDevNotice(isDesktopShell(), storage)) return;
  try {
    storage?.setItem(SEEN_KEY, "1");
  } catch {
    // Blocked storage: shown again next time, which is harmless.
  }
  document.body.appendChild(document.createElement("dev-notice"));
}

@customElement("dev-notice")
export class DevNotice extends LitElement {
  @state() private open = true;

  createRenderRoot() {
    return this;
  }

  private close() {
    this.open = false;
    this.remove();
  }

  render() {
    if (!this.open) return null;
    return html`<div
      class="fixed inset-0 z-[10040] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) this.close();
      }}
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Escape") this.close();
      }}
    >
      <div
        data-dev-notice
        role="dialog"
        aria-modal="true"
        aria-labelledby="dev-notice-title"
        class="flex w-full max-w-md flex-col gap-3 rounded-2xl border border-amber-300/40 bg-plate-800 p-6 text-white shadow-2xl"
      >
        <div class="flex items-center gap-3">
          <img
            src=${assetUrl("images/BuildIconWhite.svg")}
            alt=""
            aria-hidden="true"
            class="size-7"
          />
          <h2
            id="dev-notice-title"
            class="m-0 text-xl font-bold text-amber-100"
          >
            ${translateText("dev_notice.title")}
          </h2>
        </div>
        <p class="m-0 text-white/85">${translateText("dev_notice.body")}</p>
        <p class="m-0 text-sm text-white/65">
          ${translateText("dev_notice.feedback")}
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            class="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold transition-colors hover:bg-emerald-500"
            @click=${() => this.close()}
            autofocus
          >
            ${translateText("dev_notice.ok")}
          </button>
          <button
            type="button"
            class="rounded-xl border border-white/20 px-4 py-2.5 font-bold hover:bg-white/10"
            @click=${() => {
              this.close();
              openBugReport(null);
            }}
          >
            ${translateText("bug_report.open")}
          </button>
        </div>
      </div>
    </div>`;
  }
}
