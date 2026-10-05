import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { UserMeResponse } from "../../core/ApiSchemas";
import { acknowledgeWarning } from "../Api";
import { translateText } from "../Utils";

type Warning = NonNullable<UserMeResponse["warnings"]>[number];

/**
 * Shows a player the official warnings the moderation team gave them, one at
 * a time, until they confirm with "I understand". The API keeps each warning
 * pending (GET /users/@me `warnings`) until that confirmation reaches it, so
 * a notice closed by a lost request comes back at the next visit.
 *
 * Blocking on purpose: no backdrop click or Escape closes it.
 */
@customElement("warning-modal")
export class WarningModal extends LitElement {
  @state() private warnings: Warning[] = [];
  @state() private sending = false;

  private onUserMeResponse = (event: Event) => {
    const detail = (event as CustomEvent<UserMeResponse | false>).detail;
    this.warnings = detail === false ? [] : (detail.warnings ?? []);
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("userMeResponse", this.onUserMeResponse);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("userMeResponse", this.onUserMeResponse);
  }

  private async understood(warning: Warning) {
    if (this.sending) return;
    this.sending = true;
    await acknowledgeWarning(warning.id);
    this.sending = false;
    this.warnings = this.warnings.filter((w) => w.id !== warning.id);
  }

  render() {
    const warning = this.warnings[0];
    if (!warning) return html``;
    return html`
      <div
        class="fixed inset-0 z-[10010] flex items-center justify-center bg-black/80 p-4 backdrop-blur-[2px]"
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="warning-notice-title"
          aria-describedby="warning-notice-body"
          class="relative flex w-full max-w-lg flex-col gap-4 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(180deg,#11221c_0%,#0a1512_100%)] p-5 pt-6 text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.85)]"
        >
          <div class="absolute inset-x-0 top-0 h-[3px] bg-amber-400"></div>
          <div class="flex items-center gap-3.5">
            <div
              class="flex size-11 shrink-0 items-center justify-center rounded-md bg-amber-400/15 text-amber-300"
            >
              <!-- A shield with an exclamation mark: the moderation team's warning. -->
              <svg
                viewBox="0 0 24 24"
                class="size-6"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="M12 3l7.5 3v5.2c0 4.6-3.1 8.4-7.5 9.8-4.4-1.4-7.5-5.2-7.5-9.8V6z"
                ></path>
                <path d="M12 8v4.6"></path>
                <circle
                  cx="12"
                  cy="16.2"
                  r="0.6"
                  fill="currentColor"
                  stroke="none"
                ></circle>
              </svg>
            </div>
            <h2
              id="warning-notice-title"
              class="font-display text-xl font-bold leading-snug"
            >
              ${translateText("warning_notice.title")}
            </h2>
          </div>
          <div id="warning-notice-body" class="flex flex-col gap-3">
            <p class="text-sm leading-relaxed text-white/85">
              ${translateText("warning_notice.body")}
            </p>
            <p
              class="rounded-md border border-amber-400/25 border-l-4 border-l-amber-400 bg-amber-400/[0.07] px-4 py-3 text-sm leading-relaxed text-white/90"
            >
              ${translateText("warning_notice.reason", {
                reason: warning.reason,
              })}
            </p>
            <p class="text-sm font-semibold leading-relaxed text-amber-200">
              ${translateText("warning_notice.consequence")}
            </p>
          </div>
          <button
            class="rounded-md bg-amber-400 px-4 py-2.5 font-display text-sm font-bold text-black transition-colors hover:bg-amber-300 disabled:opacity-60"
            ?disabled=${this.sending}
            @click=${() => this.understood(warning)}
          >
            ${translateText("warning_notice.understood")}
          </button>
        </div>
      </div>
    `;
  }
}
