import type { Pack } from "../core/CosmeticSchemas";
import { currentLanguage } from "./Utils";

// What a real-money purchase is charged in, and how its price reads. Shared by
// the custom-amount card and the money-priced emerald packs.

export type CheckoutCurrency = "eur" | "usd";

// Languages of euro-area countries: they pay in euros, everyone else in
// dollars.
const EURO_LANGUAGES = new Set([
  "ca",
  "de",
  "de-CH",
  "el",
  "eo",
  "es",
  "et",
  "fi",
  "fr",
  "gl",
  "it",
  "nl",
  "pt-PT",
  "sk",
  "sl",
]);

export function checkoutCurrency(lang: string): CheckoutCurrency {
  return EURO_LANGUAGES.has(lang) ? "eur" : "usd";
}

/** "5,00 €" in French, "$5.00" in English. */
export function formatCheckoutPrice(
  cents: number,
  currency: CheckoutCurrency,
  lang: string,
): string {
  try {
    return new Intl.NumberFormat(lang, {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}

/** A money-priced pack's price in the player's currency, or null for a
 * pack bought with medals. The same number of cents in € and $. */
export function packMoneyPrice(pack: Pack): string | null {
  if (!pack.priceCents) return null;
  const lang = currentLanguage();
  return formatCheckoutPrice(pack.priceCents, checkoutCurrency(lang), lang);
}
