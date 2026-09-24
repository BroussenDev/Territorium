import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  RankedStatus,
  RankedTier,
  RankedTiers,
  UserMeResponse,
} from "../../core/ApiSchemas";
import { responseHasLinkedIdentity } from "../AccountIdentity";
import { fetchRankedStatus, getUserMe } from "../Api";
import { translateText } from "../Utils";
import { BaseModal } from "./BaseModal";
import { TIER_MIN_ELO, tierEmblem, tierLabel } from "./ranked/RankedTier";
import { modalHeader } from "./ui/ModalHeader";

// Medals each tier earns when a season closes. Mirrors the API's
// SEASON_MEDALS.
const SEASON_MEDALS: Record<RankedTier, number> = {
  bronze: 100,
  silver: 200,
  gold: 400,
  platinum: 700,
  diamond: 1000,
  master: 1500,
  legend: 2500,
};

const PLACEMENT_GAMES = 5;

// The "Ranked" hub: the season, where the player stands in it, the tiers
// and the button that joins the free-for-all queue.
@customElement("ranked-modal")
export class RankedModal extends BaseModal {
  protected routerName = "ranked";

  @state() private userMe: UserMeResponse | false | null = null;
  @state() private status: RankedStatus | null = null;
  @state() private loadFailed = false;

  constructor() {
    super();
    this.id = "page-ranked";
  }

  createRenderRoot() {
    return this;
  }

  private signedIn(): boolean {
    return this.userMe !== null && responseHasLinkedIdentity(this.userMe);
  }

  protected override async onOpen(): Promise<void> {
    this.loadFailed = false;
    this.userMe = null;
    this.userMe = await getUserMe();
    if (!this.signedIn()) return;
    const status = await fetchRankedStatus();
    this.status = status === false ? null : status;
    this.loadFailed = status === false;
  }

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("mode_selector.ranked_title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody() {
    return html`
      <div class="custom-scrollbar p-4 sm:p-6 flex flex-col gap-5">
        ${this.renderStanding()}
        <div class="grid gap-5 md:grid-cols-[1fr_16rem]">
          ${this.renderRules()} ${this.renderTiers()}
        </div>
      </div>
    `;
  }

  private renderSeason() {
    const season = this.status?.season;
    if (!season) return "";
    const ends = new Date(season.endsAt).toLocaleDateString(undefined, {
      day: "numeric",
      month: "long",
    });
    return html`<p class="text-sm text-white/60">
      ${translateText("ranked.season_ends", {
        season: season.number,
        date: ends,
      })}
    </p>`;
  }

  private renderStanding() {
    if (this.userMe === null) {
      return this.renderLoadingSpinner();
    }
    if (!this.signedIn()) {
      return html`
        <section
          class="rounded-2xl bg-white/5 border border-white/10 p-5 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left"
        >
          <p class="flex-1 text-white/80">
            ${translateText("ranked.login_required")}
          </p>
          <button
            class="px-6 py-3 rounded-xl bg-brand hover:bg-brand-light text-white font-bold transition-colors"
            @click=${() => {
              this.close();
              window.showPage?.("page-account");
            }}
          >
            ${translateText("ranked.log_in")}
          </button>
        </section>
      `;
    }
    const s = this.status;
    return html`
      <section
        class="rounded-2xl bg-white/5 border border-white/10 p-5 flex flex-col sm:flex-row items-center gap-5"
      >
        <div class="flex items-center gap-4 flex-1 min-w-0">
          ${s?.tier ? tierEmblem(s.tier, 64) : this.placementEmblem()}
          <div class="flex flex-col gap-1 min-w-0">
            ${this.renderSeason()}
            ${s === null
              ? html`<p class="text-white/60">
                  ${this.loadFailed
                    ? translateText("map_component.error")
                    : translateText("common.loading")}
                </p>`
              : s.tier
                ? html`<p class="text-2xl font-bold text-white">
                      ${tierLabel(s.tier)}
                    </p>
                    <p class="text-sm text-white/70">
                      ${translateText("ranked.standing", {
                        elo: s.elo,
                        rank: s.rank ?? "-",
                      })}
                    </p>`
                : html`<p class="text-xl font-bold text-white">
                      ${translateText("ranked.placement_progress", {
                        done: PLACEMENT_GAMES - s.placementLeft,
                        total: PLACEMENT_GAMES,
                      })}
                    </p>
                    <p class="text-sm text-white/70">
                      ${translateText("ranked.placement_hint")}
                    </p>`}
            ${s && s.games > 0
              ? html`<p class="text-xs text-white/50">
                  ${translateText("ranked.record", {
                    games: s.games,
                    wins: s.wins,
                  })}
                </p>`
              : ""}
          </div>
        </div>
        <div class="flex flex-col gap-2 w-full sm:w-auto">
          <button
            class="px-8 py-4 rounded-xl bg-brand hover:bg-brand-light active:scale-[0.98] text-white text-lg font-bold transition-all"
            @click=${() =>
              document.dispatchEvent(
                new CustomEvent("open-matchmaking", {
                  detail: { mode: "ffa" },
                }),
              )}
          >
            ${translateText("ranked.play")}
          </button>
          <button
            class="px-4 py-2 rounded-xl text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            @click=${() => {
              this.close();
              window.location.hash = "modal=leaderboard&tab=ranked";
            }}
          >
            ${translateText("ranked.see_leaderboard")}
          </button>
        </div>
      </section>
    `;
  }

  // Until the placement games are played the tier stays hidden.
  private placementEmblem() {
    return html`<div
      class="w-16 h-16 shrink-0 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center text-2xl font-bold text-white/50"
    >
      ?
    </div>`;
  }

  private renderRules() {
    const rules = [
      "ranked.rule_format",
      "ranked.rule_players",
      "ranked.rule_cosmetics",
      "ranked.rule_elo",
      "ranked.rule_placement",
      "ranked.rule_season",
    ];
    return html`
      <section class="rounded-2xl bg-black/20 border border-white/5 p-5">
        <h3 class="text-white font-bold mb-3">
          ${translateText("ranked.rules_title")}
        </h3>
        <ul class="flex flex-col gap-2 text-sm text-white/70 list-disc pl-5">
          ${rules.map((key) => html`<li>${translateText(key)}</li>`)}
        </ul>
      </section>
    `;
  }

  private renderTiers() {
    const current = this.status?.tier ?? null;
    return html`
      <section class="rounded-2xl bg-black/20 border border-white/5 p-4">
        <h3 class="text-white font-bold mb-3">
          ${translateText("ranked.tiers_title")}
        </h3>
        <ol class="flex flex-col-reverse gap-1">
          ${RankedTiers.map(
            (tier) => html`
              <li
                class="flex items-center gap-3 rounded-lg px-2 py-1.5 ${tier ===
                current
                  ? "bg-white/10"
                  : ""}"
              >
                ${tierEmblem(tier, 28)}
                <span class="flex-1 text-sm font-bold text-white"
                  >${tierLabel(tier)}</span
                >
                <span class="text-xs text-white/50 text-right">
                  ${tier === "legend"
                    ? translateText("ranked.legend_rule")
                    : `${TIER_MIN_ELO[tier]}+`}
                  <br />
                  ${translateText("ranked.tier_medals", {
                    medals: SEASON_MEDALS[tier],
                  })}
                </span>
              </li>
            `,
          )}
        </ol>
      </section>
    `;
  }
}
