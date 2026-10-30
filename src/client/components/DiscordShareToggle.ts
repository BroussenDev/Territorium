import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { getDiscordShare, setDiscordShare } from "../DiscordShare";
import { translateText } from "../Utils";

// The account panel's "Announce my private games on Discord" switch, shown
// to signed-in players whose account has Discord linked. Off by default.
@customElement("discord-share-toggle")
export class DiscordShareToggle extends LitElement {
  @state() private enabled: boolean | null = null;
  @state() private saving = false;
  @state() private failed = false;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void getDiscordShare().then((enabled) => {
      this.enabled = enabled;
    });
  }

  private async toggle(input: HTMLInputElement) {
    if (this.enabled === null || this.saving) return;
    const next = !this.enabled;
    this.saving = true;
    this.failed = false;
    const ok = await setDiscordShare(next);
    this.saving = false;
    if (ok) this.enabled = next;
    else this.failed = true;
    input.checked = this.enabled;
  }

  render() {
    if (this.enabled === null) return html``;
    return html`
      <label
        class="flex items-start gap-3 w-full max-w-md cursor-pointer text-left"
      >
        <input
          id="discord-share-toggle"
          type="checkbox"
          class="mt-1 h-4 w-4 accent-emerald-500"
          .checked=${this.enabled}
          ?disabled=${this.saving}
          @change=${(e: Event) => this.toggle(e.target as HTMLInputElement)}
        />
        <span class="flex flex-col">
          <span class="text-white text-sm font-medium"
            >${translateText("account_modal.discord_share")}</span
          >
          <span class="text-white/60 text-xs"
            >${translateText("account_modal.discord_share_desc")}</span
          >
          ${this.failed
            ? html`<span class="text-red-400 text-xs"
                >${translateText("account_modal.discord_share_failed")}</span
              >`
            : ""}
        </span>
      </label>
    `;
  }
}
