import { html, LitElement, svg, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { UserMeResponse } from "../../core/ApiSchemas";
import { markDeluxeSeen } from "../Api";
import { translateText } from "../Utils";
import { FIRST_LAUNCH_DONE_EVENT } from "./FirstLaunchLanguage";
import { conquerorFramed } from "./leaderboard/GoldFrame";
import { PIONEER_REWARD_DONE_EVENT } from "./PioneerReward";
import { HIGH_COMMANDER_SHAPES } from "./ui/HighCommanderBadge";

/**
 * The reward screen of the Deluxe edition (Pack Conquérant), shown once:
 * the API keeps the pack "not seen" (GET /users/@me `deluxe.seen`) until
 * Continue reaches it. It waits for the first-launch setup and the
 * Pionnier reward screen, so a new Deluxe player sees them in turn.
 */
@customElement("deluxe-reward")
export class DeluxeReward extends LitElement {
  @state() private pending = false;
  // Bumped when a screen it waits for closes, to check again.
  @state() private waitTick = 0;

  private onUserMeResponse = (event: Event) => {
    const detail = (event as CustomEvent<UserMeResponse | false>).detail;
    this.pending =
      detail !== false &&
      detail.deluxe !== null &&
      detail.deluxe !== undefined &&
      !detail.deluxe.seen;
  };

  private onOtherScreenDone = () => {
    this.waitTick++;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.visible()) return;
    if (e.key === "Enter" || e.key === "Escape") this.close();
  };

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener("userMeResponse", this.onUserMeResponse);
    window.addEventListener(FIRST_LAUNCH_DONE_EVENT, this.onOtherScreenDone);
    window.addEventListener(PIONEER_REWARD_DONE_EVENT, this.onOtherScreenDone);
    document.addEventListener("keydown", this.onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("userMeResponse", this.onUserMeResponse);
    window.removeEventListener(FIRST_LAUNCH_DONE_EVENT, this.onOtherScreenDone);
    window.removeEventListener(
      PIONEER_REWARD_DONE_EVENT,
      this.onOtherScreenDone,
    );
    document.removeEventListener("keydown", this.onKeyDown);
  }

  private visible(): boolean {
    if (!this.pending) return false;
    // The setup and the Pionnier screen come first.
    if (document.querySelector("first-launch-language") !== null) return false;
    return document.querySelector("pioneer-reward [role='dialog']") === null;
  }

  private close() {
    this.pending = false;
    void markDeluxeSeen();
  }

  private item(icon: TemplateResult, name: string, detail: string) {
    return html`<li
      class="flex items-center gap-3 rounded-lg border border-[#e8b84a]/25 bg-black/30 px-3 py-2.5 text-left"
    >
      <span class="flex size-10 shrink-0 items-center justify-center"
        >${icon}</span
      >
      <span class="min-w-0">
        <span class="block font-display font-semibold text-[#f5d27a]"
          >${name}</span
        >
        <span class="block text-xs text-white/60">${detail}</span>
      </span>
    </li>`;
  }

  render() {
    void this.waitTick;
    if (!this.visible()) return html``;
    const t = (key: string) => translateText(`deluxe_reward.${key}`);
    const patternIcon = svg`<svg viewBox="0 0 24 24" class="size-9" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="3" fill="#5e1120" stroke="#e8b84a" stroke-width="1.2"></rect>
      <path d="M6 7l4 4M14 7l4 4M6 15l4 4M14 15l4 4M10 7l-4 4M18 7l-4 4M10 15l-4 4M18 15l-4 4" stroke="#e8b84a" stroke-width="1.2" stroke-linecap="round"></path>
    </svg>`;
    const crownIcon = svg`<svg viewBox="0 0 24 24" class="size-9" aria-hidden="true">
      <path d="M3 17 4.5 7l4.5 4 3-6 3 6 4.5-4L21 17Z" fill="#e8b84a"></path>
      <rect x="3" y="18" width="18" height="2.5" rx="1" fill="#f2d27a"></rect>
    </svg>`;
    return html`
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="deluxe-reward-title"
        class="fixed inset-0 z-[10024] flex items-center justify-center overflow-y-auto bg-[#0b0507] p-4 text-white"
      >
        <div
          class="absolute inset-x-0 top-0 h-[50vh] bg-[radial-gradient(ellipse_at_50%_0%,rgb(122_24_40/0.45),transparent_70%)]"
          aria-hidden="true"
        ></div>
        <div
          class="relative flex w-full max-w-2xl flex-col items-center gap-6 py-6 text-center"
        >
          <svg
            viewBox="0 0 24 24"
            class="size-28 drop-shadow-[0_10px_30px_rgb(232_184_74/0.4)]"
            aria-hidden="true"
          >
            ${HIGH_COMMANDER_SHAPES}
          </svg>
          <div class="flex flex-col items-center gap-2">
            <h1
              id="deluxe-reward-title"
              class="font-display text-4xl font-bold text-balance"
            >
              ${t("title")}
            </h1>
            <p
              class="max-w-lg text-base leading-relaxed text-white/75 text-balance"
            >
              ${t("body")}
            </p>
          </div>

          <ul class="grid w-full gap-2 sm:grid-cols-2">
            ${this.item(
              svg`<svg viewBox="0 0 24 24" class="size-9" aria-hidden="true">${HIGH_COMMANDER_SHAPES}</svg>`,
              translateText("deluxe.badge"),
              t("item_badge"),
            )}
            ${this.item(
              html`<img
                src="/cosmetics/flags/conquerant.svg"
                alt=""
                class="h-7 w-10 rounded-sm object-cover"
                draggable="false"
              />`,
              t("item_emblem"),
              t("item_emblem_detail"),
            )}
            ${this.item(
              patternIcon,
              t("item_patterns"),
              t("item_patterns_detail"),
            )}
            ${this.item(
              conquerorFramed(html`<span class="text-xs font-bold">Aa</span>`),
              t("item_frame"),
              t("item_frame_detail"),
            )}
            ${this.item(
              crownIcon,
              t("item_subscription"),
              t("item_subscription_detail"),
            )}
          </ul>

          <p class="text-sm text-white/50 text-balance">${t("where")}</p>

          <button
            type="button"
            data-deluxe-continue
            @click=${() => this.close()}
            class="min-w-56 rounded-md bg-capital px-10 py-3 font-display text-base font-bold text-capital-ink transition-colors hover:bg-capital-light"
          >
            ${t("continue")}
          </button>
        </div>
      </div>
    `;
  }
}
