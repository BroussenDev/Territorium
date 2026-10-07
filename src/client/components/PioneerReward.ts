import { html, LitElement, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { UserMeResponse } from "../../core/ApiSchemas";
import { markPioneerSeen } from "../Api";
import { translateText } from "../Utils";
import { FIRST_LAUNCH_DONE_EVENT } from "./FirstLaunchLanguage";
import { PIONEER_SHAPES, pioneerBadge } from "./ui/PioneerBadge";

/**
 * The reward screen for the "Pionnier" badge, shown once: the API keeps the
 * badge "not seen" (GET /users/@me `pioneer.seen`) until Continue reaches it.
 * It waits for the Steam app's first-launch setup to close, so a new player
 * goes language, sound, keys, then this.
 */
@customElement("pioneer-reward")
export class PioneerReward extends LitElement {
  @state() private pending = false;
  @state() private setupOpen = false;

  private onUserMeResponse = (event: Event) => {
    const detail = (event as CustomEvent<UserMeResponse | false>).detail;
    this.pending =
      detail !== false &&
      detail.pioneer !== null &&
      detail.pioneer !== undefined &&
      !detail.pioneer.seen;
    this.setupOpen = document.querySelector("first-launch-language") !== null;
  };

  private onSetupDone = () => {
    this.setupOpen = false;
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
    window.addEventListener(FIRST_LAUNCH_DONE_EVENT, this.onSetupDone);
    document.addEventListener("keydown", this.onKeyDown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("userMeResponse", this.onUserMeResponse);
    window.removeEventListener(FIRST_LAUNCH_DONE_EVENT, this.onSetupDone);
    document.removeEventListener("keydown", this.onKeyDown);
  }

  private visible(): boolean {
    return this.pending && !this.setupOpen;
  }

  private close() {
    this.pending = false;
    void markPioneerSeen();
  }

  render() {
    if (!this.visible()) return html``;
    return html`
      <style>
        @keyframes pioneer-rise {
          from {
            opacity: 0;
            transform: translateY(18px) scale(0.86);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        @keyframes pioneer-glow {
          0%,
          100% {
            opacity: 0.55;
            transform: scale(1);
          }
          50% {
            opacity: 0.85;
            transform: scale(1.06);
          }
        }
        @keyframes pioneer-fade {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: none;
          }
        }
        pioneer-reward .pr-badge {
          animation: pioneer-rise 900ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        pioneer-reward .pr-glow {
          animation: pioneer-glow 3.2s ease-in-out 900ms infinite;
        }
        pioneer-reward .pr-text {
          animation: pioneer-fade 700ms ease 500ms both;
        }
        @media (prefers-reduced-motion: reduce) {
          pioneer-reward .pr-badge,
          pioneer-reward .pr-glow,
          pioneer-reward .pr-text {
            animation: none;
          }
        }
      </style>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pioneer-reward-title"
        class="fixed inset-0 z-[10025] flex items-center justify-center overflow-hidden bg-[#050b09] p-4 text-white"
      >
        <div
          class="territory-mesh absolute inset-0 bg-emerald-500/[0.05] [mask-image:radial-gradient(ellipse_at_50%_40%,#000,transparent_70%)]"
          aria-hidden="true"
        ></div>

        <div
          class="relative flex w-full max-w-xl flex-col items-center gap-7 text-center"
        >
          <div class="relative flex size-56 items-center justify-center">
            <div
              class="pr-glow absolute inset-0 rounded-full bg-[radial-gradient(circle,rgb(232_184_74/0.45),transparent_68%)]"
              aria-hidden="true"
            ></div>
            <svg
              viewBox="0 0 24 24"
              class="pr-badge relative size-40 drop-shadow-[0_10px_30px_rgb(232_184_74/0.35)]"
              aria-hidden="true"
            >
              ${svg`${PIONEER_SHAPES}`}
            </svg>
          </div>

          <div class="pr-text flex flex-col items-center gap-4">
            <h1
              id="pioneer-reward-title"
              class="font-display text-4xl font-bold text-balance"
            >
              ${translateText("pioneer_reward.title")}
            </h1>
            <p
              class="max-w-md text-base leading-relaxed text-white/75 text-balance"
            >
              ${translateText("pioneer_reward.body")}
            </p>

            <div
              class="flex items-center gap-3 rounded-lg border border-[#e8b84a]/40 bg-[#e8b84a]/[0.08] px-4 py-3 text-left"
            >
              ${pioneerBadge("w-9 h-9", null)}
              <div>
                <p class="font-display text-lg font-bold text-[#f5d27a]">
                  ${translateText("pioneer.badge")}
                </p>
                <p class="text-sm text-white/60">
                  ${translateText("pioneer.badge_desc")}
                </p>
              </div>
            </div>

            <p class="text-sm text-white/50 text-balance">
              ${translateText("pioneer_reward.where")}
            </p>

            <button
              type="button"
              data-pioneer-continue
              @click=${() => this.close()}
              class="mt-2 min-w-56 rounded-md bg-capital px-10 py-3 font-display text-base font-bold text-capital-ink transition-colors hover:bg-capital-light"
            >
              ${translateText("pioneer_reward.continue")}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}
