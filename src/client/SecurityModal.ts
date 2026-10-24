import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { revokeSessionsByLink, verifyTwoFactor } from "./Auth";
import "./components/baseComponents/Button";
import { BaseModal } from "./components/BaseModal";
import { modalHeader } from "./components/ui/ModalHeader";
import { showInGameAlert } from "./InGameModal";
import { translateText } from "./Utils";

type SecurityArgs = { challenge?: string; revokeToken?: string };

// Opens the security modal: the email code of a two-step sign-in
// (`challenge`), or the "it wasn't me" confirmation of a new-device email
// (`revokeToken`).
export function openSecurityModal(args: SecurityArgs): void {
  const modal = document.querySelector(
    "security-modal",
  ) as SecurityModal | null;
  modal?.openWith(args);
}

@customElement("security-modal")
export class SecurityModal extends BaseModal {
  @state() private challenge: string | null = null;
  @state() private revokeToken: string | null = null;
  @state() private code = "";
  @state() private busy = false;
  @state() private error: string | null = null;

  protected modalConfig() {
    return { maxWidth: "520px" };
  }

  public openWith(args: SecurityArgs): void {
    this.challenge = args.challenge ?? null;
    this.revokeToken = args.revokeToken ?? null;
    this.code = "";
    this.error = null;
    this.busy = false;
    this.open();
  }

  protected onOpen(): void {
    void this.updateComplete.then(() =>
      (
        this.querySelector("#security-code") as HTMLInputElement | null
      )?.focus(),
    );
  }

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText(
        this.challenge
          ? "security_modal.code_title"
          : "security_modal.revoke_title",
      ),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody() {
    return html`
      <div class="flex-1 flex flex-col gap-5 p-6">
        ${this.challenge ? this.renderCode() : this.renderRevoke()}
      </div>
    `;
  }

  private renderCode() {
    return html`
      <p class="text-white/80 text-sm leading-relaxed">
        ${translateText("security_modal.code_desc")}
      </p>
      <form
        class="flex flex-col gap-3"
        @submit=${(e: Event) => {
          e.preventDefault();
          void this.submitCode();
        }}
      >
        <label class="text-white/60 text-xs font-semibold" for="security-code">
          ${translateText("security_modal.code_label")}
        </label>
        <input
          id="security-code"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          dir="ltr"
          .value=${this.code}
          @input=${(e: Event) => {
            const input = e.target as HTMLInputElement;
            this.code = input.value.replace(/\D/g, "").slice(0, 6);
            input.value = this.code;
            this.error = null;
          }}
          class="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-center text-3xl font-bold tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50"
        />
        ${this.error
          ? html`<p class="text-red-300 text-sm" role="alert">${this.error}</p>`
          : nothing}
        <o-button
          translationKey="security_modal.code_confirm"
          .disable=${this.busy || this.code.length !== 6}
          @click=${() => void this.submitCode()}
        ></o-button>
      </form>
    `;
  }

  private renderRevoke() {
    return html`
      <p class="text-white/80 text-sm leading-relaxed">
        ${translateText("security_modal.revoke_desc")}
      </p>
      <div class="flex gap-3 justify-end">
        <o-button
          variant="secondary"
          size="sm"
          translationKey="common.cancel"
          @click=${() => this.close()}
        ></o-button>
        <o-button
          variant="danger"
          size="sm"
          translationKey="security_modal.revoke_confirm"
          .disable=${this.busy}
          @click=${() => void this.revoke()}
        ></o-button>
      </div>
    `;
  }

  private async submitCode(): Promise<void> {
    if (!this.challenge || this.busy || this.code.length !== 6) return;
    this.busy = true;
    const result = await verifyTwoFactor(this.challenge, this.code);
    this.busy = false;
    if (result.status === "ok") {
      this.close();
      // The session cookie is set: load the page it was opened for.
      if (result.back && new URL(result.back).origin === location.origin) {
        history.replaceState(null, "", result.back);
      }
      location.reload();
      return;
    }
    if (result.code === "wrong") {
      this.code = "";
      this.error = translateText("security_modal.code_wrong", {
        n: result.attemptsLeft ?? 0,
      });
      return;
    }
    if (result.code === "network") {
      this.error = translateText("security_modal.code_network");
      return;
    }
    this.close();
    void showInGameAlert(
      translateText(
        result.code === "locked"
          ? "security_modal.code_locked"
          : "security_modal.code_expired",
      ),
    );
  }

  private async revoke(): Promise<void> {
    if (!this.revokeToken || this.busy) return;
    this.busy = true;
    const ok = await revokeSessionsByLink(this.revokeToken);
    this.busy = false;
    this.close();
    await showInGameAlert(
      translateText(
        ok ? "security_modal.revoke_done" : "security_modal.revoke_invalid",
      ),
    );
    if (ok) location.reload();
  }

  protected onClose(): void {
    this.challenge = null;
    this.revokeToken = null;
  }
}
