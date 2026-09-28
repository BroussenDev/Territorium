import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  ClanLeaderboardEntry,
  ClanLeaderboardResponse,
} from "../../../core/ClanApiSchemas";
import { fetchClanLeaderboard } from "../../ClanApi";
import { translateText } from "../../Utils";
import "../clan/ClanCrestBadge";

// What the modal header shows above the board: the season when the API
// sends one, the date window otherwise.
export interface ClanBoardRange {
  start: string;
  end: string;
  season?: number;
}

export type ClanSortColumn =
  | "rank"
  | "games"
  | "winScore"
  | "lossScore"
  | "wars"
  | "ratio";
export type ClanSortOrder = "asc" | "desc";

@customElement("leaderboard-clan-table")
export class LeaderboardClanTable extends LitElement {
  @state() private clanData: ClanLeaderboardResponse | null = null;
  @state() private isLoading = false;
  @state() private error: string | null = null;
  @state() private sortBy: ClanSortColumn = "rank";
  @state() private sortOrder: ClanSortOrder = "asc";

  private hasLoaded = false;

  createRenderRoot() {
    return this;
  }

  public async ensureLoaded() {
    if (this.hasLoaded || this.isLoading) return;
    await this.loadClanLeaderboard();
  }

  // Without a season: the one last shown, the current one at first.
  public async loadClanLeaderboard(season = this.clanData?.season?.number) {
    this.isLoading = true;
    this.error = null;

    try {
      const data = await fetchClanLeaderboard(season);
      if (!data) throw new Error("Failed to load clan leaderboard");

      this.clanData = data;
      this.hasLoaded = true;
      this.dispatchEvent(
        new CustomEvent<ClanBoardRange>("date-range-change", {
          detail: {
            start: data.start,
            end: data.end,
            season: data.season?.number,
          },
          bubbles: true,
          composed: true,
        }),
      );
    } catch (error) {
      console.error("loadClanLeaderboard: request failed", error);
      this.error = translateText("leaderboard_modal.error");
    } finally {
      this.isLoading = false;
    }
  }

  private handleSort(column: ClanSortColumn) {
    if (this.sortBy === column) {
      this.sortOrder = this.sortOrder === "asc" ? "desc" : "asc";
    } else {
      this.sortBy = column;
      this.sortOrder = column === "rank" ? "asc" : "desc";
    }
  }

  private getSortedClans(clans: ClanLeaderboardEntry[]) {
    if (this.sortBy === "rank") {
      const base = [...clans];
      return this.sortOrder === "asc" ? base : base.reverse();
    }

    const sorted = [...clans];
    sorted.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (this.sortBy) {
        case "games":
          aVal = a.games;
          bVal = b.games;
          break;
        case "winScore":
          aVal = a.weightedWins;
          bVal = b.weightedWins;
          break;
        case "lossScore":
          aVal = a.weightedLosses;
          bVal = b.weightedLosses;
          break;
        case "wars":
          aVal = (a.warWins ?? 0) - (a.warLosses ?? 0);
          bVal = (b.warWins ?? 0) - (b.warLosses ?? 0);
          break;
        case "ratio":
          aVal = a.weightedWLRatio;
          bVal = b.weightedWLRatio;
          break;
        default:
          return 0;
      }
      return this.sortOrder === "asc" ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }

  private renderLoading() {
    return html`
      <div
        class="flex flex-col items-center justify-center p-12 text-white h-full"
      >
        <div
          class="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-6"
        ></div>
        <p
          class="text-emerald-200/80 text-sm font-bold tracking-widest uppercase"
        >
          ${translateText("common.loading")}
        </p>
      </div>
    `;
  }

  private renderError() {
    return html`
      <div
        class="flex flex-col items-center justify-center p-12 text-white h-full"
      >
        <div
          class="bg-red-500/10 p-6 rounded-full mb-6 border border-red-500/20 shadow-lg shadow-red-500/10"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-12 w-12 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <p class="mb-8 text-center text-red-100/80 font-medium">
          ${this.error ?? translateText("leaderboard_modal.error")}
        </p>
        <button
          class="px-8 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-sm font-bold uppercase transition-all active:scale-95"
          @click=${() => this.loadClanLeaderboard()}
        >
          ${translateText("leaderboard_modal.try_again")}
        </button>
      </div>
    `;
  }

  private renderNoData() {
    return html`
      <div
        class="flex flex-col items-center justify-center p-12 text-white/40 h-full"
      >
        <div class="bg-white/5 p-6 rounded-full mb-6 border border-white/5">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-16 w-16 text-white/20"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <h3 class="text-xl font-bold text-white/60 mb-2">
          ${translateText("leaderboard_modal.no_data_yet")}
        </h3>
        <p class="text-white/30 text-sm">
          ${translateText("leaderboard_modal.no_stats")}
        </p>
      </div>
    `;
  }

  // Steps between seasons, from the first to the one being played.
  private renderSeasonBar() {
    const season = this.clanData?.season;
    const current = this.clanData?.currentSeason;
    if (!season || !current) return "";
    const ended = season.number < current;
    const step =
      "w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-white/70 disabled:opacity-30 disabled:hover:bg-white/5";
    const champion = ended ? this.clanData?.clans[0] : undefined;
    return html`
      <div
        class="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/5 bg-black/30"
      >
        <button
          type="button"
          class=${step}
          data-season-step="prev"
          aria-label=${translateText("leaderboard_modal.clan_season_prev")}
          ?disabled=${season.number <= 1}
          @click=${() => this.loadClanLeaderboard(season.number - 1)}
        >
          ‹
        </button>
        <div class="min-w-0">
          <div class="text-white font-bold text-sm">
            ${translateText("leaderboard_modal.clan_season", {
              season: season.number,
            })}
          </div>
          <div class="text-white/40 text-[11px]">
            ${translateText(
              ended
                ? "leaderboard_modal.clan_season_ended"
                : "leaderboard_modal.clan_season_ends",
              { date: new Date(season.endsAt).toLocaleDateString() },
            )}
          </div>
        </div>
        <button
          type="button"
          class=${step}
          data-season-step="next"
          aria-label=${translateText("leaderboard_modal.clan_season_next")}
          ?disabled=${season.number >= current}
          @click=${() => this.loadClanLeaderboard(season.number + 1)}
        >
          ›
        </button>
        ${champion
          ? html`<div
              data-season-champion=${champion.clanTag}
              class="ml-auto flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-400/30 text-amber-200 text-xs font-bold"
            >
              <clan-crest
                .crest=${champion.crest}
                .tag=${champion.clanTag}
                .size=${22}
              ></clan-crest>
              ${translateText("leaderboard_modal.clan_season_champion", {
                clan: champion.name ?? champion.clanTag,
              })}
            </div>`
          : html`<span class="ml-auto text-white/30 text-[11px]"
              >${translateText("leaderboard_modal.clan_season_rules")}</span
            >`}
      </div>
    `;
  }

  render() {
    if (this.isLoading) return this.renderLoading();
    if (this.error) return this.renderError();
    if (!this.clanData || this.clanData.clans.length === 0)
      return html`<div class="h-full flex flex-col">
        ${this.renderSeasonBar()}
        <div class="flex-1 min-h-0">${this.renderNoData()}</div>
      </div>`;

    const { clans } = this.clanData;
    const sorted = this.getSortedClans(clans);
    const maxGames = Math.max(...clans.map((c) => c.games), 1);
    const showWars = clans.some((c) => c.warWins !== undefined);

    return html`
      <div class="h-full flex flex-col">
        ${this.renderSeasonBar()}
        <div class="flex-1 min-h-0 border border-white/5 bg-black/20">
          <div
            class="h-full overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-white/20"
          >
            <table class="w-full text-sm border-collapse table-fixed">
              <colgroup>
                <col style="width: 4rem" />
                <col style="width: 12rem" />
                <col style="width: 7rem" />
                <col style="width: 6rem" />
                <col style="width: 6rem" />
                ${showWars ? html`<col style="width: 6rem" />` : ""}
                <col style="width: 6rem" />
              </colgroup>
              <thead class="sticky top-0 z-10">
                <tr
                  class="text-white/40 text-[10px] uppercase tracking-wider border-b border-white/5 bg-[#1e2433]"
                >
                  <th class="py-4 px-4 text-center font-bold">
                    ${translateText("leaderboard_modal.rank")}
                  </th>
                  <th class="py-4 px-4 text-left font-bold">
                    ${translateText("leaderboard_modal.clan")}
                  </th>
                  <th
                    class="py-4 px-4 text-right font-bold cursor-pointer hover:text-white/60 transition-colors"
                  >
                    <button
                      class="whitespace-nowrap uppercase"
                      @click=${() => this.handleSort("games")}
                      aria-sort=${this.sortBy === "games"
                        ? this.sortOrder === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"}
                    >
                      ${translateText("leaderboard_modal.games")}
                      ${this.sortBy === "games"
                        ? this.sortOrder === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </button>
                  </th>
                  <th
                    class="py-4 px-4 text-right font-bold cursor-pointer hover:text-white/60 transition-colors"
                    title=${translateText(
                      "leaderboard_modal.win_score_tooltip",
                    )}
                  >
                    <button
                      class="whitespace-nowrap uppercase"
                      @click=${() => this.handleSort("winScore")}
                      aria-sort=${this.sortBy === "winScore"
                        ? this.sortOrder === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"}
                    >
                      ${translateText("leaderboard_modal.win_score")}
                      ${this.sortBy === "winScore"
                        ? this.sortOrder === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </button>
                  </th>
                  <th
                    class="py-4 px-4 text-right font-bold cursor-pointer hover:text-white/60 transition-colors"
                    title=${translateText(
                      "leaderboard_modal.loss_score_tooltip",
                    )}
                  >
                    <button
                      class="whitespace-nowrap uppercase"
                      @click=${() => this.handleSort("lossScore")}
                      aria-sort=${this.sortBy === "lossScore"
                        ? this.sortOrder === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"}
                    >
                      ${translateText("leaderboard_modal.loss_score")}
                      ${this.sortBy === "lossScore"
                        ? this.sortOrder === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </button>
                  </th>
                  ${showWars
                    ? html`<th
                        class="py-4 px-4 text-right font-bold cursor-pointer hover:text-white/60 transition-colors"
                        title=${translateText(
                          "leaderboard_modal.clan_wars_tooltip",
                        )}
                      >
                        <button
                          class="whitespace-nowrap uppercase"
                          @click=${() => this.handleSort("wars")}
                          aria-sort=${this.sortBy === "wars"
                            ? this.sortOrder === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"}
                        >
                          ${translateText("leaderboard_modal.clan_wars")}
                          ${this.sortBy === "wars"
                            ? this.sortOrder === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </button>
                      </th>`
                    : ""}
                  <th
                    class="py-4 px-4 text-right font-bold pr-6 cursor-pointer hover:text-white/60 transition-colors"
                  >
                    <button
                      class="whitespace-nowrap uppercase"
                      @click=${() => this.handleSort("ratio")}
                      aria-sort=${this.sortBy === "ratio"
                        ? this.sortOrder === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"}
                    >
                      ${translateText("leaderboard_modal.win_loss_ratio")}
                      ${this.sortBy === "ratio"
                        ? this.sortOrder === "asc"
                          ? "↑"
                          : "↓"
                        : "↕"}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                ${sorted.map((clan, index) => {
                  const displayRank = index + 1;
                  const rankColor =
                    displayRank === 1
                      ? "text-yellow-400 bg-yellow-400/10 ring-1 ring-yellow-400/20"
                      : displayRank === 2
                        ? "text-slate-300 bg-slate-400/10 ring-1 ring-slate-400/20"
                        : displayRank === 3
                          ? "text-amber-600 bg-amber-600/10 ring-1 ring-amber-600/20"
                          : "text-white/40 bg-white/5";
                  const rankIcon =
                    displayRank === 1
                      ? "👑"
                      : displayRank === 2
                        ? "🥈"
                        : displayRank === 3
                          ? "🥉"
                          : String(displayRank);

                  return html`
                    <tr
                      class="border-b border-white/5 hover:bg-white/[0.07] transition-colors group"
                    >
                      <td class="py-3 px-4 text-center">
                        <div
                          class="w-10 h-10 mx-auto flex items-center justify-center rounded-lg font-bold font-mono text-lg ${rankColor}"
                        >
                          ${rankIcon}
                        </div>
                      </td>
                      <td class="py-3 px-4">
                        <div class="flex items-center gap-2.5 min-w-0">
                          <clan-crest
                            .crest=${clan.crest}
                            .tag=${clan.clanTag}
                            .size=${30}
                          ></clan-crest>
                          <div class="min-w-0">
                            ${clan.name
                              ? html`<div
                                  class="text-white font-bold truncate"
                                  title=${clan.name}
                                >
                                  ${clan.name}
                                </div>`
                              : ""}
                            <div
                              class="text-emerald-300 font-bold text-xs truncate"
                            >
                              [${clan.clanTag}]
                            </div>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 px-4 text-right">
                        <div class="flex flex-col items-end gap-1">
                          <span class="text-white font-mono font-medium"
                            >${clan.games.toLocaleString()}</span
                          >
                          <div
                            class="w-24 h-1 bg-white/10 rounded-full overflow-hidden"
                          >
                            <div
                              class="h-full bg-emerald-500/50 rounded-full"
                              style="width: ${(clan.games / maxGames) * 100}%"
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td
                        class="py-3 px-4 text-right font-mono text-green-400/90"
                      >
                        ${clan.weightedWins.toLocaleString(undefined, {
                          maximumFractionDigits: 1,
                        })}
                      </td>
                      <td
                        class="py-3 px-4 text-right font-mono text-red-400/90"
                      >
                        ${clan.weightedLosses.toLocaleString(undefined, {
                          maximumFractionDigits: 1,
                        })}
                      </td>
                      ${showWars
                        ? html`<td
                            class="py-3 px-4 text-right font-mono whitespace-nowrap"
                          >
                            <span class="text-green-400/90"
                              >${clan.warWins ?? 0}</span
                            >
                            <span class="text-white/30">–</span>
                            <span class="text-red-400/90"
                              >${clan.warLosses ?? 0}</span
                            >
                          </td>`
                        : ""}
                      <td class="py-3 px-4 text-right pr-6">
                        <div class="inline-flex flex-col items-end">
                          <span
                            class="font-mono font-bold ${clan.weightedWLRatio >=
                            1
                              ? "text-green-400"
                              : "text-red-400"}"
                            >${clan.weightedWLRatio.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}</span
                          >
                          <span
                            class="text-[10px] uppercase text-white/30 font-bold tracking-wider"
                            >${translateText("leaderboard_modal.ratio")}</span
                          >
                        </div>
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }
}
