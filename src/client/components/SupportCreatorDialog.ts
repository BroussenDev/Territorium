import { html, LitElement, render as litRender } from "lit";
import { customElement, property } from "lit/decorators.js";
import { UserMeResponse } from "../../core/ApiSchemas";
import { translateText } from "../Utils";
import "./CreatorCodePanel";
import type { CreatorChangedDetail } from "./CreatorCodePanel";

/**
 * The store's "Support a creator" dialog: the account's creator-code panel,
 * reachable from the store header next to the balances. Rendered into a body
 * portal (like pack-contents-dialog) so it sits above the store modal. Set
 * `.creator`; dispatches `close`, and re-raises the panel's `creator-changed`
 * from this host element.
 */
@customElement("support-creator-dialog")
export class SupportCreatorDialog extends LitElement {
  @property({ attribute: false })
  creator: UserMeResponse["player"]["creator"] = undefined;

  private portal: HTMLDivElement | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.portal = document.createElement("div");
    document.body.appendChild(this.portal);
    window.addEventListener("keydown", this.onKeyDown);
  }

  disconnectedCallback() {
    window.removeEventListener("keydown", this.onKeyDown);
    if (this.portal) {
      litRender(html``, this.portal);
      this.portal.remove();
      this.portal = null;
    }
    super.disconnectedCallback();
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") this.close();
  };

  private close() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  private relayChange = (event: Event) => {
    event.stopPropagation();
    this.dispatchEvent(
      new CustomEvent<CreatorChangedDetail>("creator-changed", {
        detail: (event as CustomEvent<CreatorChangedDetail>).detail,
      }),
    );
  };

  render() {
    if (this.portal) litRender(this.renderOverlay(), this.portal);
    return html``;
  }

  private renderOverlay() {
    return html`<div
      class="fixed inset-0 z-[10020] flex items-center justify-center bg-black/80"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) this.close();
      }}
      @creator-changed=${this.relayChange}
    >
      <div
        data-support-creator
        role="dialog"
        aria-label=${translateText("store.support_creator")}
        class="relative mx-4 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
      >
        <button
          type="button"
          aria-label=${translateText("common.close")}
          @click=${() => this.close()}
          class="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-xl leading-none text-white/50 transition-all hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
        <h2 class="mb-1 pr-8 text-lg font-bold text-white">
          ${translateText("store.support_creator")}
        </h2>
        <p class="mb-4 text-sm text-white/60">
          ${translateText("store.support_creator_desc")}
        </p>
        <creator-code-panel .creator=${this.creator}></creator-code-panel>
      </div>
    </div>`;
  }
}
