import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { fetchNationsLeaderboard } from "../../Api";
import { translateText } from "../../Utils";
import { countryFlag, loadNationsCountries } from "../NationsCountries";
import { rankStyle } from "./LeaderboardFormat";
import { NationsBoardRow, nationsBoardRows } from "./NationsBoard";

// The Nations board: which countries players pick, and which countries win,
// whether a player or the nation AI plays them.
@customElement("leaderboard-nations-table")
export class LeaderboardNationsTable extends LitElement {
  @state() private rows: NationsBoardRow[] | null = null;
  @state() private games = 0;
  @state() private isLoading = false;
  @state() private error: string | null = null;

  private hasLoaded = false;

  createRenderRoot() {
    return this;
  }

  public async ensureLoaded() {
    if (this.hasLoaded || this.isLoading) return;
    await this.loadNationsLeaderboard();
  }

  public async loadNationsLeaderboard() {
    this.isLoading = true;
    this.error = null;

    try {
      const [board, countries] = await Promise.all([
        fetchNationsLeaderboard(),
        loadNationsCountries(),
      ]);
      if (!board) throw new Error("Failed to load nations leaderboard");

      this.rows = nationsBoardRows(board, countries);
      this.games = board.games;
      this.hasLoaded = true;
    } catch (error) {
      console.error("loadNationsLeaderboard: request failed", error);
      this.error = translateText("leaderboard_modal.error");
    } finally {
      this.isLoading = false;
    }
  }

  private percent(part: number, whole: number): string {
    if (whole === 0) return "-";
    return `${Math.round((part / whole) * 100)}%`;
  }

  // The most played and the most victorious country, above the table.
  private renderSummary(rows: NationsBoardRow[]) {
    const mostWins = rows.reduce<NationsBoardRow | null>(
      (best, r) => (r.wins > (best?.wins ?? 0) ? r : best),
      null,
    );
    const highlight = (label: string, row: NationsBoardRow | null) =>
      row
        ? html`<div class="flex items-center gap-2 min-w-0">
            <span class="text-white/40">${label}</span>
            ${countryFlag(row.country)}
            <span class="font-bold text-white truncate"
              >${row.country.name}</span
            >
          </div>`
        : nothing;
    return html`
      <div
        class="px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs border-b border-white/5 bg-black/20"
      >
        <span class="text-white/60">
          ${translateText("leaderboard_modal.nations_games", {
            count: this.games.toLocaleString(),
          })}
        </span>
        ${highlight(
          translateText("leaderboard_modal.nations_most_played"),
          rows[0]?.picks > 0 ? rows[0] : null,
        )}
        ${highlight(
          translateText("leaderboard_modal.nations_most_wins"),
          mostWins,
        )}
      </div>
    `;
  }

  private renderLoading() {
    return html`
      <div
        class="flex flex-col items-center justify-center p-12 text-white h-full"
      >
        <div
          class="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mb-6"
        ></div>
        <p class="text-emerald-200/80 text-sm font-bold ">
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
        <p class="mb-8 text-center text-red-100/80 font-medium">
          ${this.error ?? translateText("leaderboard_modal.error")}
        </p>
        <button
          class="rounded-md bg-brand px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-light active:scale-95"
          @click=${() => this.loadNationsLeaderboard()}
        >
          ${translateText("leaderboard_modal.try_again")}
        </button>
      </div>
    `;
  }

  private renderNoData() {
    return html`
      <div
        class="h-full flex flex-col items-center justify-center p-12 text-white/40 border border-white/5 bg-black/20"
      >
        <h3 class="text-xl font-bold text-white/60 mb-2">
          ${translateText("leaderboard_modal.no_data_yet")}
        </h3>
        <p class="text-white/30 text-sm text-center">
          ${translateText("leaderboard_modal.nations_no_stats")}
        </p>
      </div>
    `;
  }

  render() {
    if (this.isLoading) return this.renderLoading();
    if (this.error) return this.renderError();
    const rows = this.rows;
    if (!rows || rows.length === 0) return this.renderNoData();

    const maxPicks = Math.max(...rows.map((r) => r.picks), 1);

    return html`
      <div class="h-full border border-white/5 bg-black/20 flex flex-col">
        ${this.renderSummary(rows)}
        <div
          class="flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-white/20"
        >
          <table class="w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col style="width: 3.5rem" />
              <col style="width: 10rem" />
              <col style="width: 7rem" />
              <col style="width: 5rem" />
              <col style="width: 7rem" />
            </colgroup>
            <thead class="sticky top-0 z-10">
              <tr
                class="text-white/45 text-xs font-medium border-b border-white/5 bg-[#0d1c17]"
              >
                <th class="py-4 px-4 text-center font-bold">
                  ${translateText("leaderboard_modal.rank")}
                </th>
                <th class="py-4 px-4 text-left font-bold">
                  ${translateText("leaderboard_modal.nations_country")}
                </th>
                <th
                  class="py-4 px-4 text-right font-bold whitespace-nowrap"
                  title=${translateText(
                    "leaderboard_modal.nations_picks_tooltip",
                  )}
                >
                  ${translateText("leaderboard_modal.nations_picks")}
                </th>
                <th
                  class="py-4 px-2 text-right font-bold whitespace-nowrap"
                  title=${translateText(
                    "leaderboard_modal.nations_wins_tooltip",
                  )}
                >
                  ${translateText("leaderboard_modal.wins")}
                </th>
                <th
                  class="py-4 px-4 text-right font-bold pr-6 whitespace-nowrap"
                  title=${translateText(
                    "leaderboard_modal.nations_win_rate_tooltip",
                  )}
                >
                  ${translateText("leaderboard_modal.nations_win_rate")}
                </th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row, i) => {
                const { color, icon } = rankStyle(i + 1);
                return html`
                  <tr
                    class="border-b border-white/5 hover:bg-white/[0.07] transition-colors"
                  >
                    <td class="py-3 px-4 text-center">
                      <div
                        class="w-10 h-10 mx-auto flex items-center justify-center rounded-lg font-bold font-mono text-lg ${color}"
                      >
                        ${icon}
                      </div>
                    </td>
                    <td class="py-3 px-4">
                      <div class="flex items-center gap-2 min-w-0">
                        ${countryFlag(row.country, "h-5")}
                        <span class="font-bold text-white truncate"
                          >${row.country.name}</span
                        >
                      </div>
                    </td>
                    <td class="py-3 px-4 text-right">
                      <div class="flex flex-col items-end gap-1">
                        <span class="text-white font-mono"
                          >${row.picks.toLocaleString()}</span
                        >
                        <div
                          class="w-20 h-1 bg-white/10 rounded-full overflow-hidden"
                        >
                          <div
                            class="h-full bg-emerald-500/50 rounded-full"
                            style="width: ${(row.picks / maxPicks) * 100}%"
                          ></div>
                        </div>
                      </div>
                    </td>
                    <td class="py-3 px-2 text-right font-mono text-white/80">
                      ${row.wins.toLocaleString()}
                    </td>
                    <td
                      class="py-3 px-4 text-right pr-6 font-mono text-white/60"
                    >
                      ${this.percent(row.playerWins, row.picks)}
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
}
