import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { getUserMe } from "../Api";
import { linkDiscord } from "../Auth";
import { getDiscordShare, setDiscordShare } from "../DiscordShare";
import { showInGameAlert } from "../InGameModal";
import { translateText } from "../Utils";
import "./baseComponents/setting/SettingToggle";

type DiscordState =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "notLinked" }
  | { kind: "linked"; name: string; share: boolean };

// The settings' Discord tab: who the account is linked to, a way to link it,
// and "Announce my private games on Discord" (off by default) once linked.
@customElement("discord-share-toggle")
export class DiscordShareToggle extends LitElement {
  @state() private view: DiscordState = { kind: "loading" };
  @state() private saving = false;
  @state() private failed = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  private async load() {
    const me = await getUserMe();
    if (!me) {
      this.view = { kind: "signedOut" };
      return;
    }
    const discord = me.user?.discord;
    if (!discord) {
      this.view = { kind: "notLinked" };
      return;
    }
    const share = await getDiscordShare();
    this.view = {
      kind: "linked",
      name: discord.global_name ?? discord.username,
      share: share === true,
    };
  }

  private async toggle(e: Event) {
    const input = e.target as HTMLInputElement;
    if (this.view.kind !== "linked" || this.saving) return;
    const next = input.checked;
    this.saving = true;
    this.failed = false;
    const ok = await setDiscordShare(next);
    this.saving = false;
    if (ok) this.view = { ...this.view, share: next };
    else this.failed = true;
    input.checked = this.view.share;
  }

  private async link() {
    if (!(await linkDiscord())) {
      await showInGameAlert(translateText("account_modal.link_discord_failed"));
    }
  }

  private renderStatus() {
    switch (this.view.kind) {
      case "signedOut":
        return html`<p class="text-white/60 text-sm">
          ${translateText("user_setting.discord_signed_out")}
        </p>`;
      case "notLinked":
        return html`<button
          id="discord-link-button"
          class="self-start flex items-center gap-2 px-4 py-2 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-bold transition-colors"
          @click=${() => this.link()}
        >
          <img
            src=${assetUrl("images/DiscordLogo.svg")}
            alt=""
            aria-hidden="true"
            class="size-4"
          />
          ${translateText("account_modal.link_discord")}
        </button>`;
      case "linked":
        return html`<p class="text-sm text-white/80">
          ${translateText("user_setting.discord_linked_as", {
            name: this.view.name,
          })}
        </p>`;
      default:
        return html``;
    }
  }

  render() {
    if (this.view.kind === "loading") return html``;
    return html`
      <div
        class="flex flex-col gap-3 p-4 rounded-xl border border-[#5865F2]/40 bg-[#5865F2]/10"
      >
        <div class="flex items-center gap-3">
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#5865F2]"
          >
            <img
              src=${assetUrl("images/DiscordLogo.svg")}
              alt=""
              aria-hidden="true"
              class="size-6"
            />
          </div>
          <div class="flex flex-col">
            <span class="text-white font-bold text-base"
              >${translateText("user_setting.discord_title")}</span
            >
            <span class="text-white/60 text-sm leading-snug"
              >${translateText("user_setting.discord_intro")}</span
            >
          </div>
        </div>
        ${this.renderStatus()}
      </div>
      ${this.view.kind === "linked"
        ? html`<setting-toggle
              label="${translateText("account_modal.discord_share")}"
              description="${translateText("account_modal.discord_share_desc")}"
              id="discord-share-toggle"
              .checked=${this.view.share}
              ?disabled=${this.saving}
              @change=${(e: Event) => this.toggle(e)}
            ></setting-toggle>
            ${this.failed
              ? html`<p class="text-red-400 text-sm">
                  ${translateText("account_modal.discord_share_failed")}
                </p>`
              : ""}`
        : ""}
    `;
  }
}
