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
import {
  isNewSeason,
  newSeasonTag,
  TIER_MIN_ELO,
  tierColors,
  tierEmblem,
  tierLabel,
} from "./ranked/RankedTier";
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

// The tiers a rating climbs through, lowest first, and how much of the
// open-ended bronze and master tiers the progress track shows.
const LADDER_TIERS = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "master",
] as const;
const TRACK_STEP = 150;

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
    // Seasons end at midnight, so show the last day that still counts.
    const ends = new Date(Date.parse(season.endsAt) - 1).toLocaleDateString(
      undefined,
      {
        day: "numeric",
        month: "long",
      },
    );
    return html`<p
      class="flex flex-wrap items-center gap-2 text-sm text-white/60"
    >
      ${translateText("ranked.season_ends", {
        season: season.number,
        date: ends,
      })}
      ${isNewSeason(season) ? newSeasonTag() : ""}
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
    const accent = s?.tier ? tierColors(s.tier) : null;
    return html`
      <section
        class="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-5 sm:p-6 flex flex-col gap-5"
        style=${accent
          ? `background-image: radial-gradient(110% 140% at 0% 0%, ${accent.fill}55, transparent 65%)`
          : ""}
      >
        <div class="flex flex-col sm:flex-row sm:items-center gap-5">
          <div class="flex items-center gap-4 flex-1 min-w-0">
            ${s?.tier ? tierEmblem(s.tier, 84) : this.placementEmblem()}
            <div class="flex flex-col gap-1 min-w-0">
              ${this.renderSeason()}
              ${s === null
                ? html`<p class="text-white/60">
                    ${this.loadFailed
                      ? translateText("map_component.error")
                      : translateText("common.loading")}
                  </p>`
                : html`<div class="flex items-baseline gap-2">
                      <span
                        class="font-display text-5xl font-bold leading-none tabular-nums"
                        style="color: ${accent?.edge ?? "#ffffff"}"
                        >${s.elo}</span
                      >
                      <span class="text-sm font-bold text-white/60"
                        >${translateText("ranked.elo")}</span
                      >
                    </div>
                    <p class="text-lg font-bold text-white">
                      ${s.tier
                        ? tierLabel(s.tier)
                        : translateText("ranked.placement_progress", {
                            done: PLACEMENT_GAMES - s.placementLeft,
                            total: PLACEMENT_GAMES,
                          })}
                      ${s.rank !== null
                        ? html`<span class="ml-2 text-sm text-white/60"
                            >${translateText("ranked.rank", {
                              rank: s.rank,
                            })}</span
                          >`
                        : ""}
                    </p>`}
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
        </div>
        ${s ? this.renderProgress(s) : ""} ${s ? this.renderHistory(s) : ""}
      </section>
    `;
  }

  // Where the rating sits on the tier ladder and how far the next tier is.
  // During placement the tier stays hidden, so this shows the placement
  // games played instead.
  private renderProgress(s: RankedStatus) {
    if (!s.tier) {
      const done = PLACEMENT_GAMES - s.placementLeft;
      return html`<div class="flex flex-col gap-2">
        <div class="flex gap-1.5">
          ${Array.from(
            { length: PLACEMENT_GAMES },
            (_, i) =>
              html`<span
                class="h-2 flex-1 rounded-full ${i < done
                  ? "bg-white"
                  : "bg-white/10"}"
              ></span>`,
          )}
        </div>
        <p class="text-xs text-white/60">
          ${translateText("ranked.placement_hint")}
        </p>
      </div>`;
    }
    // The ladder tiers are 150 Elo apart, so equal segments keep the scale.
    const low = TIER_MIN_ELO.silver - TRACK_STEP;
    const high = TIER_MIN_ELO.master + TRACK_STEP;
    const at = Math.min(1, Math.max(0, (s.elo - low) / (high - low)));
    const next = LADDER_TIERS.find((tier) => TIER_MIN_ELO[tier] > s.elo);
    const hint = next
      ? translateText("ranked.to_next_tier", {
          points: TIER_MIN_ELO[next] - s.elo,
          tier: tierLabel(next),
        })
      : translateText(
          s.tier === "legend" ? "ranked.is_legend" : "ranked.to_legend",
        );
    return html`<div class="flex flex-col gap-2">
      <div class="relative py-1">
        <div class="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
          ${LADDER_TIERS.map((tier) => {
            const reached = s.elo >= TIER_MIN_ELO[tier];
            return html`<span
              class="flex-1"
              style="background: ${tierColors(tier).fill}; opacity: ${reached
                ? 1
                : 0.25}"
              title=${`${tierLabel(tier)} ${TIER_MIN_ELO[tier]}+`}
            ></span>`;
          })}
        </div>
        <span
          class="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-black shadow-[0_0_10px_rgba(255,255,255,0.6)]"
          style="left: ${at * 100}%"
          aria-hidden="true"
        ></span>
      </div>
      <div
        class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs"
      >
        <span class="font-semibold text-white/85">${hint}</span>
        <span class="flex gap-3 text-white/55">
          <span>${translateText("ranked.peak", { elo: s.peak })}</span>
          <span
            >${translateText("ranked.record", {
              games: s.games,
              wins: s.wins,
            })}</span
          >
        </span>
      </div>
    </div>`;
  }

  // The season's last games, newest first, with the Elo each one won or lost.
  private renderHistory(s: RankedStatus) {
    const games = s.history ?? [];
    return html`<div class="flex flex-col gap-2">
      <h3 class="text-sm font-bold text-white/70">
        ${translateText("ranked.recent_title")}
      </h3>
      ${games.length === 0
        ? html`<p class="text-sm text-white/50">
            ${translateText("ranked.recent_empty")}
          </p>`
        : html`<ol class="flex flex-wrap gap-1.5">
            ${games.map((game) => {
              const won = game.delta >= 0;
              return html`<li
                class="flex min-w-[3.25rem] flex-col items-center rounded-lg border px-2 py-1 ${won
                  ? "border-emerald-400/40 bg-emerald-500/15"
                  : "border-red-400/40 bg-red-500/15"}"
                title=${translateText("ranked.recent_game", {
                  place: game.place,
                  players: game.players,
                })}
              >
                <span
                  class="text-sm font-bold tabular-nums ${won
                    ? "text-emerald-300"
                    : "text-red-300"}"
                  >${won ? "+" : "−"}${Math.abs(game.delta)}</span
                >
                <span class="text-[10px] tabular-nums text-white/55"
                  >#${game.place}/${game.players}</span
                >
              </li>`;
            })}
          </ol>`}
    </div>`;
  }

  // Until the placement games are played the tier stays hidden.
  private placementEmblem() {
    return html`<div
      class="w-[84px] h-[84px] shrink-0 rounded-full border-2 border-dashed border-white/30 flex items-center justify-center text-3xl font-bold text-white/50"
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
