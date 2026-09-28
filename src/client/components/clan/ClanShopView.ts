import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { CosmeticPack } from "../../../core/CosmeticSchemas";
import { buyClanPack, type ClanInfo } from "../../ClanApi";
import {
  broadcastFreshUserMe,
  fetchCosmetics,
  packDescription,
  packDisplayName,
  resolveCosmetics,
  type ResolvedCosmetic,
} from "../../Cosmetics";
import { translateText } from "../../Utils";
import "../ConfirmDialog";
import { cosmeticDisplayName } from "../CosmeticPresentation";
import "../CosmeticPreview";
import "../CurrencyDisplay";
import {
  type ClanRole,
  formatClanDate,
  renderLoadingSpinner,
} from "./ClanShared";

/**
 * The clan's Shop tab: the clan packs (catalog packs marked clanOnly), which
 * the leader and officers buy with the clan's emeralds for every member.
 * Members wear the items for as long as they stay in the clan. Raises
 * `clan-pack-bought` with the clan's fresh info after a purchase.
 */
@customElement("clan-shop-view")
export class ClanShopView extends LitElement {
  createRenderRoot() {
    return this;
  }

  @property({ attribute: false }) clan: ClanInfo | null = null;
  @property({ attribute: false }) myRole: ClanRole | null = null;

  @state() private packs: ResolvedCosmetic[] | null = null;
  @state() private loadFailed = false;
  @state() private confirming: CosmeticPack | null = null;
  @state() private buying = false;
  @state() private message: { key: string; ok: boolean } | null = null;

  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  private async load() {
    this.loadFailed = false;
    const cosmetics = await fetchCosmetics();
    if (cosmetics === null) {
      this.loadFailed = true;
      return;
    }
    this.packs = resolveCosmetics(cosmetics, false, null).filter(
      (r) => r.type === "cosmeticPack" && (r.cosmetic as CosmeticPack).clanOnly,
    );
  }

  private get canBuy(): boolean {
    return this.myRole === "leader" || this.myRole === "officer";
  }

  private async buy(pack: CosmeticPack) {
    const clan = this.clan;
    if (!clan || this.buying) return;
    this.confirming = null;
    this.buying = true;
    const res = await buyClanPack(clan.tag, pack.name);
    this.buying = false;
    if ("error" in res) {
      this.message = { key: res.error, ok: false };
      return;
    }
    this.message = { key: "clan_modal.shop_bought", ok: true };
    this.dispatchEvent(
      new CustomEvent("clan-pack-bought", {
        detail: { clan: res },
        bubbles: true,
        composed: true,
      }),
    );
    // The buyer is a member too: their new items show in the locker.
    void broadcastFreshUserMe();
  }

  render() {
    if (this.loadFailed) {
      return html`<div
        class="bg-white/5 rounded-xl border border-white/10 p-8 text-center"
      >
        <p class="text-white/40 text-sm">
          ${translateText("clan_modal.shop_unavailable")}
        </p>
      </div>`;
    }
    if (this.packs === null) return renderLoadingSpinner();
    return html`<div class="space-y-3">
      <p class="text-white/60 text-sm">
        ${translateText("clan_modal.shop_intro")}
      </p>
      ${this.message
        ? html`<p
            class="text-sm ${this.message.ok
              ? "text-emerald-300"
              : "text-red-300"}"
            role="status"
          >
            ${translateText(this.message.key)}
          </p>`
        : nothing}
      ${this.packs.length === 0
        ? html`<div
            class="bg-white/5 rounded-xl border border-white/10 p-8 text-center"
          >
            <p class="text-white/40 text-sm">
              ${translateText("clan_modal.shop_empty")}
            </p>
          </div>`
        : this.packs.map((r) => this.renderPack(r))}
      ${this.confirming
        ? html`<confirm-dialog
            variant="warning"
            .heading=${packDisplayName(this.confirming)}
            .message=${translateText("clan_modal.shop_confirm", {
              price: this.confirming.clanPriceHard ?? 0,
            })}
            @confirm=${() => this.confirming && this.buy(this.confirming)}
            @cancel=${() => (this.confirming = null)}
          ></confirm-dialog>`
        : nothing}
    </div>`;
  }

  private renderPack(resolved: ResolvedCosmetic): TemplateResult {
    const pack = resolved.cosmetic as CosmeticPack;
    const price = pack.clanPriceHard ?? 0;
    const bought = this.clan?.packs?.find((p) => p.name === pack.name);
    return html`
      <div
        data-clan-pack=${pack.name}
        class="rounded-xl border p-4 space-y-3 ${bought
          ? "bg-emerald-500/10 border-emerald-400/30"
          : "bg-white/5 border-white/10"}"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 class="text-white font-bold">${packDisplayName(pack)}</h3>
            <p class="text-white/50 text-sm">${packDescription(pack)}</p>
          </div>
          <currency-display class="shrink-0" .hard=${String(price)}>
          </currency-display>
        </div>
        <div class="flex flex-wrap gap-3">
          ${(resolved.packItems ?? []).map(
            (item) =>
              html`<div class="w-28 text-center">
                <div
                  class="w-28 h-28 rounded-lg bg-black/30 border border-white/10 overflow-hidden"
                >
                  <cosmetic-preview .resolved=${item}></cosmetic-preview>
                </div>
                <p class="text-white/70 text-xs mt-1 truncate">
                  ${cosmeticDisplayName(item)}
                </p>
              </div>`,
          )}
        </div>
        ${bought ? this.renderBought(bought) : this.renderBuy(pack, price)}
      </div>
    `;
  }

  private renderBought(
    bought: NonNullable<ClanInfo["packs"]>[number],
  ): TemplateResult {
    return html`<div>
      <p class="text-emerald-300 text-sm font-bold">
        ✓ ${translateText("clan_modal.shop_owned")}
      </p>
      <p class="text-white/40 text-xs">
        ${translateText("clan_modal.shop_bought_by", {
          name:
            bought.boughtByUsername ??
            translateText("clan_modal.donations_deleted_player"),
          date: formatClanDate(bought.boughtAt),
        })}
      </p>
    </div>`;
  }

  private renderBuy(pack: CosmeticPack, price: number): TemplateResult {
    if (!this.canBuy) {
      return html`<p class="text-white/40 text-xs">
        ${translateText("clan_modal.shop_officers_only")}
      </p>`;
    }
    const treasury = Number(this.clan?.hardBalance ?? 0);
    const missing = Math.max(0, price - treasury);
    return html`<div class="flex flex-wrap items-center gap-3">
      <button
        type="button"
        ?disabled=${missing > 0 || this.buying}
        @click=${() => {
          this.message = null;
          this.confirming = pack;
        }}
        class="px-4 py-2 rounded-lg text-sm font-bold bg-brand/80 hover:bg-brand text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ${translateText("clan_modal.shop_unlock")}
      </button>
      ${missing > 0
        ? html`<span class="text-white/50 text-xs">
            ${translateText("clan_modal.shop_missing", { missing })}
          </span>`
        : nothing}
    </div>`;
  }
}
