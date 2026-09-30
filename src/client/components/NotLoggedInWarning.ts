import { LitElement, html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { UserMeResponse } from "../../core/ApiSchemas";
import { responseHasLinkedIdentity } from "../AccountIdentity";
import { translateText } from "../Utils";

@customElement("not-logged-in-warning")
export class NotLoggedInWarning extends LitElement {
  // Three states, not two. `null` is "auth has not settled yet": Main only
  // broadcasts userMeResponse once userAuth() (a Steam ticket exchange on
  // desktop) has resolved, and this element is on the page from mount. Until
  // that first broadcast nothing is known, so nothing is shown. Starting at
  // `false` instead rendered the "Not logged in" button to every logged-in
  // player for the whole pending window -- most visibly on the post-purchase
  // reload, right after they had spent money (OPE-338).
  @state() private linked: boolean | null = null;

  private _onUserMe = (event: CustomEvent<UserMeResponse | false>) => {
    this.linked = responseHasLinkedIdentity(event.detail);
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(
      "userMeResponse",
      this._onUserMe as EventListener,
    );
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(
      "userMeResponse",
      this._onUserMe as EventListener,
    );
  }

  render() {
    // Pending and linked both render nothing; only a SETTLED no-session
    // result warns.
    if (this.linked !== false) return html``;

    return html`<div class="no-crazygames flex items-center">
      <button
        class="flex items-center gap-2 px-3 py-2 font-display text-sm font-semibold transition-colors duration-150 rounded-md bg-white/[0.04] text-white/85 border border-white/15 cursor-pointer hover:border-capital/60 hover:text-white"
        @click=${() => {
          window.showPage?.("page-account");
        }}
      >
        <span class="size-2 shrink-0 rounded-[1px] bg-capital"></span>
        <span data-i18n="common.not_logged_in"
          >${translateText("common.not_logged_in")}</span
        >
      </button>
    </div>`;
  }
}
