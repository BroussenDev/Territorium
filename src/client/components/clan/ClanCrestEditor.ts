import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
  type ClanCrest,
  CREST_COLOR_NAMES,
  CREST_COLORS,
  CREST_SHAPES,
  CREST_SYMBOLS,
  type CrestColor,
  crestOf,
  formatCrest,
} from "../../../core/ClanCrest";
import { translateText } from "../../Utils";
import "./ClanCrestBadge";

/**
 * The leader's crest picker in Manage: a live preview beside pickers for the
 * shape, the field and charge colors, and the symbol. Emits `crest-change`
 * with the stored string on every pick; saving is left to the settings form.
 */
@customElement("clan-crest-editor")
export class ClanCrestEditor extends LitElement {
  createRenderRoot() {
    return this;
  }

  @property() tag = "";
  @property() value: string | null = null;

  private get crest(): ClanCrest {
    return crestOf(this.value, this.tag);
  }

  private pick(change: Partial<ClanCrest>) {
    const next = { ...this.crest, ...change };
    // A charge the color of its field would vanish: swap the two instead.
    if (next.field === next.charge) {
      if (change.field) next.charge = this.crest.field;
      else next.field = this.crest.charge;
    }
    this.value = formatCrest(next);
    this.dispatchEvent(
      new CustomEvent("crest-change", {
        detail: { crest: this.value },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private label(key: string): TemplateResult {
    return html`<div
      class="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2"
    >
      ${translateText(key)}
    </div>`;
  }

  private option(
    selected: boolean,
    title: string,
    content: TemplateResult,
    onPick: () => void,
  ): TemplateResult {
    return html`<button
      type="button"
      title=${title}
      aria-label=${title}
      aria-pressed=${selected}
      @click=${onPick}
      class="flex items-center justify-center w-11 h-11 rounded-lg border transition-colors ${selected
        ? "border-amber-300 bg-white/15"
        : "border-white/10 bg-black/20 hover:bg-white/10"}"
    >
      ${content}
    </button>`;
  }

  private swatches(which: "field" | "charge"): TemplateResult {
    const crest = this.crest;
    return html`<div class="flex flex-wrap gap-1.5">
      ${CREST_COLOR_NAMES.map((color: CrestColor) => {
        const selected = crest[which] === color;
        const name = translateText(`clan_modal.crest_color_${color}`);
        return html`<button
          type="button"
          title=${name}
          aria-label=${name}
          aria-pressed=${selected}
          data-crest-color=${`${which}:${color}`}
          @click=${() => this.pick({ [which]: color })}
          class="w-7 h-7 rounded-full border-2 transition-transform ${selected
            ? "border-amber-300 scale-110"
            : "border-white/20 hover:scale-105"}"
          style="background:${CREST_COLORS[color]}"
        ></button>`;
      })}
    </div>`;
  }

  render() {
    const crest = this.crest;
    return html`
      <div>
        <label
          class="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2"
          >${translateText("clan_modal.crest")}</label
        >
        <div
          class="flex flex-col sm:flex-row gap-5 p-4 rounded-xl bg-black/20 border border-white/10"
        >
          <div class="flex flex-col items-center gap-2 sm:w-32 shrink-0">
            <clan-crest
              .parts=${crest}
              .tag=${this.tag}
              .size=${104}
            ></clan-crest>
            <span class="text-white/40 text-[11px] text-center"
              >${translateText("clan_modal.crest_hint")}</span
            >
          </div>
          <div class="flex-1 min-w-0 space-y-4">
            <div>
              ${this.label("clan_modal.crest_shape")}
              <div class="flex flex-wrap gap-1.5">
                ${CREST_SHAPES.map((shape) =>
                  this.option(
                    crest.shape === shape,
                    translateText(`clan_modal.crest_shape_${shape}`),
                    html`<clan-crest
                      .parts=${{ ...crest, shape }}
                      .tag=${this.tag}
                      .size=${28}
                    ></clan-crest>`,
                    () => this.pick({ shape }),
                  ),
                )}
              </div>
            </div>
            <div>
              ${this.label("clan_modal.crest_field")} ${this.swatches("field")}
            </div>
            <div>
              ${this.label("clan_modal.crest_charge")}
              ${this.swatches("charge")}
            </div>
            <div>
              ${this.label("clan_modal.crest_symbol")}
              <div class="flex flex-wrap gap-1.5">
                ${CREST_SYMBOLS.map((symbol) =>
                  this.option(
                    crest.symbol === symbol,
                    translateText(`clan_modal.crest_symbol_${symbol}`),
                    html`<clan-crest
                      .parts=${{ ...crest, symbol }}
                      .tag=${this.tag}
                      .size=${28}
                    ></clan-crest>`,
                    () => this.pick({ symbol }),
                  ),
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
