import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  type CheckoutCurrency,
  checkoutCurrency,
  formatCheckoutPrice,
} from "../CheckoutPrice";
import { showInGameAlert } from "../InGameModal";
import { purchaseOutcomeMessage, startPurchase } from "../Payments";
import { currentLanguage, translateText } from "../Utils";
import "./PlutoniumIcon";
import "./PurchaseButton";

// Fixed rate: 20 emeralds = 1.00 € or $1.00 (5 cents each). Bounds and rate
// are enforced server-side; here they are display-only, since checkout
// redirects to the payment page, which shows the amount actually charged.
const MIN_PLUTONIUM = 20;
const MAX_PLUTONIUM = 5000;
const CENTS_PER_PLUTONIUM = 5;

export { checkoutCurrency, formatCheckoutPrice };

@customElement("custom-currency-card")
export class CustomCurrencyCard extends LitElement {
  /** Always a clamped integer in [MIN_PLUTONIUM, MAX_PLUTONIUM]. */
  @state() private amount = 100;
  /** Express request for immediate delivery, waiving the withdrawal right. */
  @state() private waived = false;

  createRenderRoot() {
    return this;
  }

  private clamp(value: number): number {
    if (!Number.isFinite(value)) return MIN_PLUTONIUM;
    return Math.min(MAX_PLUTONIUM, Math.max(MIN_PLUTONIUM, Math.floor(value)));
  }

  private get currency(): CheckoutCurrency {
    return checkoutCurrency(currentLanguage());
  }

  private onSlider(e: Event) {
    this.amount = this.clamp(Number((e.target as HTMLInputElement).value));
  }

  private onInputChange(e: Event) {
    this.amount = this.clamp(Number((e.target as HTMLInputElement).value));
  }

  private buy = async () => {
    // French consumer law: digital content is only delivered at once, without
    // a 14-day withdrawal period, if the buyer expressly asks for it.
    if (!this.waived) {
      await showInGameAlert(translateText("store.withdrawal_waiver_needed"));
      return;
    }
    // Rail-agnostic: startPurchase picks the web rail (Mollie) or Steam and
    // performs the handoff itself, so there is no URL to navigate to here.
    const outcome = await startPurchase({
      kind: "custom_currency",
      hardAmount: this.amount,
      currency: this.currency,
      withdrawalWaiver: true,
    });
    const message = purchaseOutcomeMessage(
      outcome,
      "store.custom_currency_purchase_success",
    );
    if (message !== null) await showInGameAlert(message);
  };

  render() {
    const price = formatCheckoutPrice(
      this.amount * CENTS_PER_PLUTONIUM,
      this.currency,
      currentLanguage(),
    );
    // Mirrors cosmetic-card: the name leads, the artwork box is square, and
    // the width comes from the host so the card shrinks with the grid on
    // phones instead of overflowing it.
    return html`
      <article
        data-custom-currency-card
        data-cosmetic-shell
        data-cosmetic-rarity="common"
        style="background:linear-gradient(to top, rgba(80,80,80,0.55) 0%, rgba(15,15,20,0.85) 100%);border-color:rgba(255,255,255,0.15)"
        class="relative flex h-full w-full flex-col items-center overflow-visible rounded-xl border border-white/20 transition-all duration-200 ease-out hover:-translate-y-1 hover:z-10 hover:shadow-[0_0_10px_rgba(255,255,255,0.5)]"
      >
        <span
          data-custom-currency-name
          class="w-full whitespace-normal break-words px-3 pt-3 text-center text-sm font-bold leading-tight text-white"
          >${translateText("store.custom_amount")}</span
        >

        <div
          data-cosmetic-main
          class="group relative flex w-full flex-col items-center gap-2 rounded-xl px-3 pb-3 pt-2"
        >
          <div
            data-custom-currency-preview
            class="relative flex w-full aspect-square flex-col items-center justify-center gap-1 overflow-hidden rounded-lg bg-white/5 p-2"
          >
            <plutonium-icon class="block shrink-0" .size=${64}></plutonium-icon>
            <label for="custom-plutonium-amount" class="sr-only"
              >${translateText("store.plutonium_amount")}</label
            >
            <input
              id="custom-plutonium-amount"
              type="number"
              class="custom-plutonium-input w-full min-w-0 max-w-24 text-center bg-black/30 border border-green-500/30 rounded px-1 py-0.5 text-lg font-black leading-none text-green-400 outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/40"
              aria-label=${translateText("store.plutonium_amount")}
              min=${MIN_PLUTONIUM}
              max=${MAX_PLUTONIUM}
              step="1"
              .value=${String(this.amount)}
              @change=${this.onInputChange}
            />
            <span
              class="text-[10px] font-bold leading-none text-white/50 uppercase"
              >${translateText("cosmetics.hard")}</span
            >
            <span
              data-custom-currency-price
              class="pt-0.5 text-sm font-bold leading-none text-emerald-300"
              >${price}</span
            >
          </div>

          <input
            type="range"
            class="w-full accent-green-500 cursor-pointer"
            aria-label=${translateText("store.plutonium_amount")}
            min=${MIN_PLUTONIUM}
            max=${MAX_PLUTONIUM}
            step="1"
            .value=${String(this.amount)}
            @input=${this.onSlider}
          />
        </div>

        <label
          data-withdrawal-waiver
          class="flex w-full cursor-pointer items-start gap-1.5 px-3 text-left text-[10px] leading-snug text-white/70"
        >
          <input
            type="checkbox"
            class="mt-0.5 shrink-0 accent-green-500"
            .checked=${this.waived}
            @change=${(e: Event) =>
              (this.waived = (e.target as HTMLInputElement).checked)}
          />
          <span
            >${translateText("store.withdrawal_waiver")}
            <a
              href="/terms-of-service.html#cgv"
              target="_blank"
              rel="noopener"
              class="underline hover:text-white"
              >${translateText("store.sale_terms")}</a
            ></span
          >
        </label>

        <div
          data-cosmetic-action
          class="mt-auto w-full px-3 pb-3 pt-2 transition-opacity ${this.waived
            ? ""
            : "opacity-50"}"
        >
          <purchase-button
            class="block w-full"
            .dollarPrice=${price}
            .dollarLabelKey=${"store.pay"}
            .onPurchaseDollar=${this.buy}
          ></purchase-button>
        </div>
      </article>
    `;
  }
}
