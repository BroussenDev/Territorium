import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { invalidateUserMe } from "../../Api";
import { createClan } from "../../ClanApi";
import { translateText } from "../../Utils";

const INPUT_CLASS =
  "w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-all font-medium hover:bg-white/10 text-sm";
const LABEL_CLASS =
  "block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-2";

/**
 * Form that founds a clan. Fires `clan-created` with the new ClanInfo on
 * success and `create-cancelled` when the player backs out.
 */
@customElement("clan-create-view")
export class ClanCreateView extends LitElement {
  @state() private tag = "";
  @state() private name = "";
  @state() private description = "";
  @state() private isOpen = true;
  @state() private saving = false;
  @state() private errorKey = "";

  createRenderRoot() {
    return this;
  }

  private get canSubmit(): boolean {
    return (
      /^[A-Z0-9]{2,5}$/.test(this.tag) &&
      this.name.trim().length >= 3 &&
      !this.saving
    );
  }

  private async submit() {
    if (!this.canSubmit) return;
    this.saving = true;
    this.errorKey = "";
    const result = await createClan({
      tag: this.tag,
      name: this.name.trim(),
      description: this.description.trim(),
      isOpen: this.isOpen,
    });
    this.saving = false;
    if ("error" in result) {
      this.errorKey = result.error;
      return;
    }
    invalidateUserMe();
    this.dispatchEvent(
      new CustomEvent("clan-created", {
        detail: { clan: result },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return html`
      <div class="bg-white/5 rounded-2xl border border-white/10 p-6 space-y-5">
        <div>
          <h3 class="text-sm font-bold text-white/60 uppercase tracking-wider">
            ${translateText("clan_modal.create_clan")}
          </h3>
          <p class="text-white/40 text-xs mt-1">
            ${translateText("clan_modal.create_clan_desc")}
          </p>
        </div>
        <div class="grid grid-cols-[7rem_1fr] gap-3">
          <div>
            <label class=${LABEL_CLASS} for="clan-create-tag"
              >${translateText("clan_modal.create_tag_label")}</label
            >
            <input
              id="clan-create-tag"
              type="text"
              .value=${this.tag}
              @input=${(e: Event) => {
                const input = e.target as HTMLInputElement;
                this.tag = input.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 5);
                input.value = this.tag;
              }}
              maxlength="5"
              placeholder="TRM"
              class="${INPUT_CLASS} font-mono uppercase tracking-widest"
            />
          </div>
          <div>
            <label class=${LABEL_CLASS} for="clan-create-name"
              >${translateText("clan_modal.clan_name")}</label
            >
            <input
              id="clan-create-name"
              type="text"
              .value=${this.name}
              @input=${(e: Event) =>
                (this.name = (e.target as HTMLInputElement).value)}
              maxlength="35"
              class=${INPUT_CLASS}
            />
          </div>
        </div>
        <p class="text-white/40 text-xs -mt-2">
          ${translateText("clan_modal.create_tag_hint")}
        </p>
        <div>
          <label class=${LABEL_CLASS} for="clan-create-description"
            >${translateText("clan_modal.description")}</label
          >
          <textarea
            id="clan-create-description"
            .value=${this.description}
            @input=${(e: Event) =>
              (this.description = (e.target as HTMLTextAreaElement).value)}
            maxlength="200"
            rows="3"
            class="${INPUT_CLASS} resize-none"
          ></textarea>
        </div>
        <div class="flex items-center justify-between">
          <div>
            <div class="text-white text-sm font-bold">
              ${translateText("clan_modal.open_clan")}
            </div>
            <div class="text-white/40 text-xs">
              ${translateText("clan_modal.open_clan_desc")}
            </div>
          </div>
          <button
            role="switch"
            aria-checked="${this.isOpen}"
            aria-label="${translateText("clan_modal.open_clan")}"
            @click=${() => (this.isOpen = !this.isOpen)}
            class="relative w-12 h-7 rounded-full transition-all ${this.isOpen
              ? "bg-brand"
              : "bg-white/20"}"
          >
            <div
              class="absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${this
                .isOpen
                ? "left-6"
                : "left-1"}"
            ></div>
          </button>
        </div>
        ${this.errorKey
          ? html`<p class="text-red-400 text-sm" role="alert">
              ${translateText(this.errorKey)}
            </p>`
          : ""}
        <div class="flex gap-3">
          <button
            @click=${() =>
              this.dispatchEvent(
                new CustomEvent("create-cancelled", {
                  bubbles: true,
                  composed: true,
                }),
              )}
            class="px-6 py-3 text-sm font-bold text-white/60 uppercase tracking-wider bg-white/5 hover:bg-white/10 rounded-xl transition-all"
          >
            ${translateText("clan_modal.cancel_request")}
          </button>
          <button
            @click=${() => this.submit()}
            ?disabled=${!this.canSubmit}
            class="flex-1 px-6 py-3 text-sm font-bold text-white uppercase tracking-wider bg-brand hover:bg-brand-light active:bg-brand/80 rounded-xl transition-all disabled:opacity-50"
          >
            ${this.saving
              ? translateText("clan_modal.saving")
              : translateText("clan_modal.create_submit")}
          </button>
        </div>
      </div>
    `;
  }
}
