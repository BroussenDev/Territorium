import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { UserMeResponse } from "../../core/ApiSchemas";
import { translateText } from "../Utils";

type Ban = NonNullable<NonNullable<UserMeResponse["ban"]>>;

/**
 * Shows a banned player *why* they're banned. The game server already refuses a
 * banned account's WebSocket ("Account Banned"); this surfaces the rich reason
 * the API returns on GET /users/@me (`ban`) — a localized category, the
 * moderator's player-facing reason, and when the ban lifts (or that it's
 * permanent).
 *
 * Reads the `userMeResponse` document event (dispatched after login / on load),
 * like <marketing-consent-toast>. It shows the notice once; if the player closes
 * it, it stays closed for the session (they still can't play — the server
 * enforces that — but they aren't trapped behind the dialog).
 */
@customElement("banned-modal")
export class BannedModal extends LitElement {
  @state() private ban: Ban | null = null;
  @state() private dismissed = false;

  private onUserMeResponse = (event: Event) => {
    const detail = (event as CustomEvent<UserMeResponse | false>).detail;
    // No ban (or @me failed) clears the notice — e.g. an unban that lands in
    // the same session — and re-arms it so a later re-ban shows again.
    if (detail === false || !detail.ban) {
      this.ban = null;
      this.dismissed = false;
      return;
    }
    this.ban = detail.ban;
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

  // Map the server category to its label, falling back to the generic ToS
  // wording for a value a newer server introduced that this client can't name.
  private categoryLabel(category: string): string {
    const key = `ban_notice.category.${category}`;
    const label = translateText(key);
    return label === key ? translateText("ban_notice.category.other") : label;
  }

  render() {
    const ban = this.ban;
    if (!ban || this.dismissed) return html``;
    const close = () => (this.dismissed = true);
    return html`
      <div
        class="fixed inset-0 z-[10020] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="ban-notice-title"
          class="relative flex w-full max-w-lg flex-col gap-4 overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(180deg,#11221c_0%,#0a1512_100%)] p-5 pt-6 text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.85)]"
        >
          <div class="absolute inset-x-0 top-0 h-[3px] bg-red-500"></div>
          <h2
            id="ban-notice-title"
            data-ban-title
            class="font-display text-xl font-bold leading-snug"
          >
            ${translateText("ban_notice.title")}
          </h2>
          <div
            class="flex items-start gap-3.5 rounded-md border border-red-500/25 border-l-4 border-l-red-500 bg-red-500/[0.07] p-4"
          >
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-red-400"
            >
              <!-- A barred circle: the account can't enter games. -->
              <svg
                viewBox="0 0 24 24"
                class="size-6"
                fill="none"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M5.7 5.7l12.6 12.6"></path>
              </svg>
            </div>
            <div class="min-w-0 flex-1">
              <p class="font-display text-lg font-bold leading-snug">
                ${this.categoryLabel(ban.category)}
              </p>
              ${ban.reason
                ? html`<p class="mt-1 text-sm leading-relaxed text-white/75">
                    ${translateText("ban_notice.reason", {
                      reason: ban.reason,
                    })}
                  </p>`
                : null}
            </div>
          </div>
          <p
            class="flex items-center gap-2.5 rounded-md border border-white/10 bg-black/25 px-4 py-3 text-sm font-medium text-white/90"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-5 shrink-0 text-capital-light"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="9"></circle>
              <path d="M12 7v5l3 2"></path>
            </svg>
            ${ban.expiresAt
              ? translateText("ban_notice.until", {
                  date: new Date(ban.expiresAt).toLocaleString(),
                })
              : translateText("ban_notice.permanent")}
          </p>
          <p class="text-sm leading-relaxed text-white/55">
            ${translateText("ban_notice.appeal")}
          </p>
          <button
            class="rounded-md border border-white/15 bg-white/[0.04] px-4 py-2.5 font-display text-sm font-semibold text-white/80 transition-colors hover:border-white/30 hover:text-white"
            @click=${close}
          >
            ${translateText("common.close")}
          </button>
        </div>
      </div>
    `;
  }
}
