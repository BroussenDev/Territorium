import { html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators.js";
import { getCachedCosmetics, type InsufficientCurrency } from "../Cosmetics";
import { translateText } from "../Utils";
import "./ConfirmDialog";

/**
 * Shown when the player can't afford a cosmetic. Set `.info` to display it and
 * clear it on `@close`. Emeralds get a top-up button when the catalog sells
 * currency packs; medals are dismiss-only.
 */
@customElement("insufficient-currency-dialog")
export class InsufficientCurrencyDialog extends LitElement {
  @property({ attribute: false }) info: InsufficientCurrency | null = null;

  createRenderRoot() {
    return this;
  }

  private close() {
    this.dispatchEvent(new CustomEvent("close"));
  }

  render() {
    const info = this.info;
    if (!info) return nothing;
    // No currency pack for sale: the store's packs tab is hidden, nothing to
    // send the player to.
    const canTopUp =
      info.canTopUp &&
      Object.keys(getCachedCosmetics()?.currencyPacks ?? {}).length > 0;
    return html`<confirm-dialog
      .heading=${translateText("store.insufficient_currency_title", {
        currency: info.currency,
      })}
      .message=${translateText("store.insufficient_currency_body", {
        amount: info.shortfall,
        currency: info.currency,
        item: info.item,
      })}
      variant="warning"
      .wide=${true}
      .showClose=${true}
      .buttons=${canTopUp ? "confirmOnly" : "none"}
      .confirmText=${canTopUp
        ? translateText("store.purchase_currency", { currency: info.currency })
        : ""}
      @cancel=${() => this.close()}
      @confirm=${() => {
        this.close();
        // Home path (not just hash) so it also works from in-game (win modal).
        window.location.href = "/#modal=store&tab=packs";
      }}
    ></confirm-dialog>`;
  }
}
