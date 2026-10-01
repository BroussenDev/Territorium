import { html, LitElement, render as litRender, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../Utils";

/**
 * A reusable inline confirmation / acknowledgement dialog.
 *
 * Usage:
 * ```html
 * <confirm-dialog
 *   .message=${"Are you sure?"}
 *   variant="danger"
 *   @confirm=${() => doThing()}
 *   @cancel=${() => {}}
 * ></confirm-dialog>
 * ```
 *
 * For ban-style flows, add a textarea:
 * ```html
 * <confirm-dialog
 *   .message=${"Ban this player?"}
 *   variant="warning"
 *   textareaPlaceholder="Reason (optional)"
 *   @confirm=${(e) => ban(e.detail.text)}
 *   @cancel=${() => {}}
 * ></confirm-dialog>
 * ```
 */
@customElement("confirm-dialog")
export class ConfirmDialog extends LitElement {
  @property() heading = "";
  @property() message = "";
  @property() variant: "danger" | "warning" = "danger";
  @property() textareaPlaceholder = "";
  @property() confirmText = "";
  @property() cancelText = "";
  @property({ type: Boolean }) disabled = false;
  @property({ type: Boolean }) showClose = false;
  @property({ type: Boolean }) wide = false;
  @property() buttons: "confirmCancel" | "confirmOnly" | "none" =
    "confirmCancel";

  @state() private text = "";

  private portal: HTMLDivElement | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.portal = document.createElement("div");
    document.body.appendChild(this.portal);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.portal) {
      litRender(html``, this.portal);
      this.portal.remove();
      this.portal = null;
    }
  }

  render() {
    if (this.portal) {
      litRender(this.renderOverlay(), this.portal);
    }
    return html``;
  }

  private renderOverlay() {
    const isDanger = this.variant === "danger";
    // Danger is red; a warning or notice takes the capital's gold.
    const edge = isDanger ? "bg-red-500" : "bg-capital";
    const iconTile = isDanger
      ? "bg-red-500/15 text-red-400"
      : "bg-capital/15 text-capital-light";
    const btnClass = isDanger
      ? "bg-red-600 text-white hover:bg-red-500"
      : "bg-capital text-capital-ink hover:bg-capital-light";

    return html`
      <div
        class="fixed inset-0 z-[10020] flex items-center justify-center bg-black/75 backdrop-blur-[2px]"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.handleCancel();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          class="relative mx-4 w-full ${this.wide
            ? "max-w-md"
            : "max-w-sm"} overflow-hidden rounded-lg border border-white/10 bg-[linear-gradient(180deg,#11221c_0%,#0a1512_100%)] p-5 pt-6 text-white shadow-[0_24px_60px_-20px_rgb(0_0_0/0.85)]"
        >
          <div class="absolute inset-x-0 top-0 h-[3px] ${edge}"></div>
          ${this.showClose
            ? html`<button
                @click=${() => this.handleCancel()}
                aria-label=${translateText("common.close")}
                class="absolute top-3 right-3 flex size-8 items-center justify-center rounded-md text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  class="size-4"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6 6 18"></path>
                </svg>
              </button>`
            : ""}
          <div
            class="flex gap-3.5 ${this.heading
              ? "items-start"
              : "items-center"}"
          >
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-md ${iconTile}"
            >
              ${dialogIcon(isDanger)}
            </div>
            <div class="min-w-0 flex-1 ${this.showClose ? "pr-7" : ""}">
              ${this.heading
                ? html`<h2
                    class="mb-1 font-display text-lg font-bold leading-snug text-white"
                  >
                    ${this.heading}
                  </h2>`
                : ""}
              <p
                class="text-sm leading-relaxed ${this.heading
                  ? "text-white/75"
                  : "font-medium text-white/90"}"
              >
                ${this.message}
              </p>
            </div>
          </div>
          ${this.textareaPlaceholder
            ? html`<textarea
                .value=${this.text}
                @input=${(e: Event) =>
                  (this.text = (e.target as HTMLTextAreaElement).value)}
                maxlength="200"
                rows="2"
                placeholder="${this.textareaPlaceholder}"
                class="mt-4 w-full resize-none rounded-md border border-white/12 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-capital/50"
              ></textarea>`
            : ""}
          ${this.buttons === "none"
            ? ""
            : html`<div class="mt-5 flex gap-2.5">
                ${this.buttons === "confirmCancel"
                  ? html`<button
                      @click=${() => this.handleCancel()}
                      ?disabled=${this.disabled}
                      class="flex-1 rounded-md border border-white/15 bg-white/[0.04] px-4 py-2.5 font-display text-sm font-semibold text-white/80 transition-colors hover:border-white/30 hover:text-white disabled:pointer-events-none disabled:opacity-50"
                    >
                      ${this.cancelText || translateText("common.cancel")}
                    </button>`
                  : ""}
                <button
                  @click=${() => this.handleConfirm()}
                  ?disabled=${this.disabled}
                  class="flex-1 rounded-md border-0 px-4 py-2.5 font-display text-sm font-bold ${btnClass} transition-colors disabled:pointer-events-none disabled:opacity-50"
                >
                  ${this.confirmText || translateText("common.confirm")}
                </button>
              </div>`}
        </div>
      </div>
    `;
  }

  private handleConfirm() {
    this.dispatchEvent(
      new CustomEvent("confirm", { detail: { text: this.text } }),
    );
    this.text = "";
  }

  private handleCancel() {
    this.dispatchEvent(new CustomEvent("cancel"));
    this.text = "";
  }
}

// Danger: an octagon, like a stop sign. Warning and notices: a triangle.
function dialogIcon(danger: boolean) {
  return html`<svg
    viewBox="0 0 24 24"
    class="size-6"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
    stroke-linecap="round"
    aria-hidden="true"
  >
    ${danger
      ? svg`<path d="M8.3 2.5h7.4l5.8 5.8v7.4l-5.8 5.8H8.3l-5.8-5.8V8.3Z"></path>`
      : svg`<path d="M12 3 22 20.5H2Z"></path>`}
    <path d=${danger ? "M12 7.5v5.5" : "M12 9.5v4.5"}></path>
    <circle
      cx="12"
      cy=${danger ? "16.6" : "17.2"}
      r="1.1"
      fill="currentColor"
      stroke="none"
    ></circle>
  </svg>`;
}
