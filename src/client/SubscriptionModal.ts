import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { UserMeResponse } from "../core/ApiSchemas";
import { Cosmetics } from "../core/CosmeticSchemas";
import { renderFreePlayPerks } from "./components/FreePlayPerks";
import "./components/SubscriptionPanel";
import { fetchCosmetics, openGameHistory } from "./Cosmetics";
import { ProfileMenuModal } from "./ProfileMenuModal";
import { uiIcon } from "./ui/UiIcons";
import { translateText } from "./Utils";

/**
 * Standalone subscription management, opened from the nav profile menu
 * (`#modal=subscription`). The menu only offers it to subscribers, but the
 * modal is reachable by URL, so it also handles the no-subscription case by
 * pointing at the store's subscriptions tab.
 */
@customElement("subscription-modal")
export class SubscriptionModal extends ProfileMenuModal {
  protected routerName = "subscription";
  protected titleKey = "subscription_modal.title";

  @state() private cosmetics: Cosmetics | null = null;

  protected renderSignedIn(userMe: UserMeResponse): TemplateResult {
    const sub = userMe.player.subscription;
    if (!sub) {
      return html`
        <div class="p-6">
          <div
            class="bg-white/5 rounded-xl border border-white/10 p-8 text-center flex flex-col items-center gap-4"
          >
            <p class="text-white/60 text-sm">
              ${translateText("subscription_modal.none")}
            </p>
            <div class="w-full text-left rounded-lg bg-white/5 px-4 py-3">
              ${renderFreePlayPerks("free_play.free_heading")}
            </div>
            <o-button
              variant="primary"
              size="md"
              translationKey="subscription_modal.browse"
              @click=${() => {
                this.close();
                window.location.hash = "modal=store&tab=subscriptions";
              }}
            ></o-button>
          </div>
        </div>
      `;
    }
    return html`
      <div class="custom-scrollbar mr-1">
        <div class="p-6">
          <subscription-panel
            .sub=${sub}
            .cosmetic=${this.cosmetics?.subscriptions?.[sub.tier] ?? null}
            @request-close=${() => this.close()}
          ></subscription-panel>
          ${(this.cosmetics?.subscriptions?.[sub.tier]?.historyDays ?? 0) > 0
            ? html`<button
                type="button"
                class="mt-4 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white/85 hover:bg-white/10"
                @click=${() => {
                  this.close();
                  openGameHistory();
                }}
              >
                ${uiIcon("history", "size-5")}
                ${translateText("cosmetics.view_game_history")}
              </button>`
            : nothing}
        </div>
      </div>
    `;
  }

  protected onOpenExtra(): void {
    void fetchCosmetics().then((cosmetics) => {
      this.cosmetics = cosmetics;
    });
  }
}
