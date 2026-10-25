import { html, LitElement, nothing, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { openContest } from "./ContestModal";
import { navigateTo } from "./PageTransition";
import { homeHref, translateText } from "./Utils";

/** What the game server says when TGS cancels a ranked game. */
export interface TgsCancel {
  code: "TGS-104" | "TGS-105" | "TGS-106";
  cheaters: { clientID: string; username: string }[];
  compensation: number;
  penalty: number;
  banDays: number;
}

/** The JSON detail of a cancelled ranked game, or null when malformed. */
export function parseTgsCancel(message: string | undefined): TgsCancel | null {
  try {
    const value = JSON.parse(message ?? "") as Partial<TgsCancel>;
    if (
      typeof value.code !== "string" ||
      !Array.isArray(value.cheaters) ||
      typeof value.compensation !== "number"
    ) {
      return null;
    }
    return value as TgsCancel;
  } catch {
    return null;
  }
}

/**
 * Shows the "game cancelled by TGS" screen of a ranked game (the game
 * server's TgsRanked.ts), then goes back home. Cheaters read their
 * sanction; everyone else reads that their rating did not move and what
 * they get for the lost game.
 */
export function showTgsCancel(
  detail: TgsCancel,
  myClientID: string | undefined,
  gameId?: string,
): void {
  const modal = document.querySelector(
    "tgs-cancel-modal",
  ) as TgsCancelModal | null;
  if (modal === null) {
    navigateTo(homeHref());
    return;
  }
  modal.show(detail, myClientID, gameId);
}

@customElement("tgs-cancel-modal")
export class TgsCancelModal extends LitElement {
  @state() private detail: TgsCancel | null = null;
  @state() private me: string | undefined;
  private gameId: string | undefined;

  createRenderRoot() {
    return this;
  }

  public show(
    detail: TgsCancel,
    me: string | undefined,
    gameId?: string,
  ): void {
    this.detail = detail;
    this.me = me;
    this.gameId = gameId;
    void this.updateComplete.then(() =>
      (this.querySelector("#tgs-cancel-back") as HTMLElement | null)?.focus(),
    );
  }

  private back(): void {
    this.detail = null;
    navigateTo(homeHref());
  }

  render() {
    const d = this.detail;
    if (d === null) return nothing;
    const cheater = d.cheaters.some((c) => c.clientID === this.me);
    const names = d.cheaters.map((c) => c.username).join(", ");
    const reason = translateText(`tgs_cancel.reason_${d.code.slice(4)}`);
    return html`
      <div
        class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tgs-cancel-title"
      >
        <div
          class="w-full max-w-lg rounded-2xl border ${cheater
            ? "border-red-500/50"
            : "border-emerald-400/40"} bg-[#0e171b] shadow-2xl overflow-hidden"
        >
          <div
            class="flex items-center gap-4 px-6 py-5 ${cheater
              ? "bg-red-500/15"
              : "bg-emerald-500/10"}"
          >
            ${shield(cheater)}
            <div>
              <div class="text-xs font-semibold tracking-wide text-white/60">
                Territorium Game Shield · ${d.code}
              </div>
              <h2 id="tgs-cancel-title" class="text-xl font-bold text-white">
                ${translateText(
                  cheater ? "tgs_cancel.title_sanctioned" : "tgs_cancel.title",
                )}
              </h2>
            </div>
          </div>
          <div
            class="px-6 py-5 flex flex-col gap-3 text-white/85 text-sm leading-relaxed"
          >
            ${cheater
              ? html`
                  <p>${translateText("tgs_cancel.cheater_body", { reason })}</p>
                  <ul class="flex flex-col gap-2">
                    ${line(
                      translateText("tgs_cancel.cheater_elo", { n: d.penalty }),
                      "red",
                    )}
                    ${line(
                      translateText("tgs_cancel.cheater_ban", { n: d.banDays }),
                      "red",
                    )}
                  </ul>
                  <p class="text-white/60">
                    ${translateText("tgs_cancel.cheater_review")}
                  </p>
                  <button
                    class="self-start text-sm text-white/70 underline underline-offset-2 hover:text-white"
                    @click=${() => openContest("tgs_cancel", this.gameId)}
                  >
                    ${translateText("contest.button")}
                  </button>
                `
              : html`
                  <p>
                    ${translateText("tgs_cancel.victim_body", {
                      names,
                      reason,
                    })}
                  </p>
                  <ul class="flex flex-col gap-2">
                    ${line(translateText("tgs_cancel.victim_elo"), "green")}
                    ${d.compensation > 0
                      ? line(
                          translateText("tgs_cancel.victim_compensation", {
                            n: d.compensation,
                          }),
                          "green",
                        )
                      : nothing}
                    ${line(
                      translateText("tgs_cancel.victim_sanction"),
                      "green",
                    )}
                  </ul>
                `}
          </div>
          <div class="px-6 pb-6">
            <button
              id="tgs-cancel-back"
              class="w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-brand/60"
              @click=${() => this.back()}
            >
              ${translateText("tgs_cancel.back")}
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

function line(text: string, tone: "red" | "green") {
  return html`<li class="flex items-start gap-2">
    <span
      class="mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone === "red"
        ? "bg-red-400"
        : "bg-emerald-400"}"
    ></span>
    <span>${text}</span>
  </li>`;
}

// TGS's shield: a check for the players it protected, a cross for a
// sanctioned one.
function shield(sanctioned: boolean) {
  const color = sanctioned ? "#f87171" : "#34d399";
  return html`<svg
    width="48"
    height="48"
    viewBox="0 0 48 48"
    aria-hidden="true"
  >
    <path
      d="M24 4 40 10v12c0 10.5-6.8 18.6-16 22-9.2-3.4-16-11.5-16-22V10z"
      fill="${color}22"
      stroke="${color}"
      stroke-width="2.5"
      stroke-linejoin="round"
    />
    ${sanctioned
      ? svg`<path
          d="M18 18l12 12M30 18 18 30"
          stroke="${color}"
          stroke-width="3"
          stroke-linecap="round"
        />`
      : svg`<path
          d="m17 24 5 5 9-10"
          fill="none"
          stroke="${color}"
          stroke-width="3"
          stroke-linecap="round"
          stroke-linejoin="round"
        />`}
  </svg>`;
}
