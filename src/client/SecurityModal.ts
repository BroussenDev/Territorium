import { html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  finishStepUp,
  setStepUpHandler,
  startStepUp,
  steamStepUpUrl,
  StepUpAction,
} from "./Api";
import { revokeSessionsByLink, verifyTwoFactor } from "./Auth";
import "./components/baseComponents/Button";
import { BaseModal } from "./components/BaseModal";
import { modalHeader } from "./components/ui/ModalHeader";
import { showInGameAlert } from "./InGameModal";
import { steamSDK } from "./SteamSDK";
import { translateText } from "./Utils";

type StepUp = {
  action: StepUpAction;
  challenge: string;
  resolve: (token: string | null) => void;
};
type SecurityArgs = {
  challenge?: string;
  revokeToken?: string;
  stepUp?: StepUp;
};

// Opens the security modal: the email code of a two-step sign-in
// (`challenge`), the "it wasn't me" confirmation of a new-device email
// (`revokeToken`), or the email code confirming an important action
// (`stepUp`).
export function openSecurityModal(args: SecurityArgs): void {
  const modal = document.querySelector(
    "security-modal",
  ) as SecurityModal | null;
  modal?.openWith(args);
}

// A confirmation brought back from Steam on the website (Main.ts reads
// #step-up=<token>&step-up-action=<action>), used by the next try.
const SAVED_KEY = "territorium-step-up";

export function saveSteamStepUp(action: string, token: string): void {
  try {
    sessionStorage.setItem(
      SAVED_KEY,
      JSON.stringify({ action, token, at: Date.now() }),
    );
  } catch {
    // Without storage the player confirms again.
  }
}

function takeSavedStepUp(action: StepUpAction): string | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(SAVED_KEY) ?? "null");
    sessionStorage.removeItem(SAVED_KEY);
    if (
      saved?.action === action &&
      typeof saved.token === "string" &&
      Date.now() - saved.at < 9 * 60_000
    ) {
      return saved.token;
    }
  } catch {
    // Nothing saved.
  }
  return null;
}

// Confirms the player's identity before an important action: an email code
// when the account uses two-step sign-in, Steam Guard for a Steam account
// (a Steam ticket in the Steam app, a Steam sign-in on the website).
// Resolves to the token for the action, "" when the account needs none, or
// null when the player cancelled or left for Steam.
export async function confirmIdentity(
  action: StepUpAction,
): Promise<string | null> {
  const saved = takeSavedStepUp(action);
  if (saved) return saved;
  const start = await startStepUp(action);
  if (!start) {
    void showInGameAlert(translateText("security_modal.stepup_failed"));
    return null;
  }
  if (start.method === null) return "";
  if (start.method === "steam") {
    if (steamSDK.isOnSteam()) {
      const ticket = await steamSDK.getTicket();
      const result = ticket.ok
        ? await finishStepUp(action, { steamTicket: ticket.ticket })
        : null;
      if (result?.ok) return result.token;
      void showInGameAlert(translateText("security_modal.stepup_failed"));
      return null;
    }
    const proceed = await showInGameAlert(
      translateText("security_modal.stepup_steam_web"),
      {
        buttons: "confirmCancel",
        confirmText: translateText("common.confirm"),
      },
    );
    if (!proceed) return null;
    const url = await steamStepUpUrl(action);
    if (url) window.location.href = url;
    else void showInGameAlert(translateText("security_modal.stepup_failed"));
    return null;
  }
  const challenge = start.challenge;
  return new Promise((resolve) =>
    openSecurityModal({ stepUp: { action, challenge, resolve } }),
  );
}

setStepUpHandler(confirmIdentity);

@customElement("security-modal")
export class SecurityModal extends BaseModal {
  @state() private challenge: string | null = null;
  @state() private revokeToken: string | null = null;
  @state() private stepUp: StepUp | null = null;
  @state() private code = "";
  @state() private busy = false;
  @state() private error: string | null = null;

  protected modalConfig() {
    return { maxWidth: "520px" };
  }

  public openWith(args: SecurityArgs): void {
    this.stepUp?.resolve(null);
    this.challenge = args.challenge ?? null;
    this.revokeToken = args.revokeToken ?? null;
    this.stepUp = args.stepUp ?? null;
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
        this.stepUp
          ? "security_modal.stepup_title"
          : this.challenge
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
        ${this.challenge || this.stepUp
          ? this.renderCode()
          : this.renderRevoke()}
      </div>
    `;
  }

  private renderCode() {
    return html`
      <p class="text-white/80 text-sm leading-relaxed">
        ${translateText(
          this.stepUp
            ? "security_modal.stepup_desc"
            : "security_modal.code_desc",
        )}
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
    if (this.busy || this.code.length !== 6) return;
    if (this.stepUp) return this.submitStepUp(this.stepUp);
    if (!this.challenge) return;
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
    this.codeFailed(result.code, result.attemptsLeft);
  }

  private async submitStepUp(stepUp: StepUp): Promise<void> {
    this.busy = true;
    const result = await finishStepUp(stepUp.action, {
      challenge: stepUp.challenge,
      code: this.code,
    });
    this.busy = false;
    if (result.ok) {
      this.stepUp = null;
      stepUp.resolve(result.token);
      this.close();
      return;
    }
    this.codeFailed(result.code, result.attemptsLeft);
  }

  private codeFailed(code: string, attemptsLeft?: number): void {
    if (code === "wrong") {
      this.code = "";
      this.error = translateText("security_modal.code_wrong", {
        n: attemptsLeft ?? 0,
      });
      return;
    }
    if (code === "network") {
      this.error = translateText("security_modal.code_network");
      return;
    }
    const restart = this.stepUp
      ? "security_modal.stepup_failed"
      : code === "locked"
        ? "security_modal.code_locked"
        : "security_modal.code_expired";
    this.close();
    void showInGameAlert(translateText(restart));
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
    this.stepUp?.resolve(null);
    this.stepUp = null;
    this.challenge = null;
    this.revokeToken = null;
  }
}
