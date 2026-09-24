import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { SoloLeaderboardResponse } from "../../../core/ApiSchemas";
import { fetchSoloLeaderboard } from "../../Api";
import { translateText } from "../../Utils";
import "../PlayerName";
import { rankStyle } from "./LeaderboardTribeTable";

// The solo board: players ranked by points from singleplayer wins against
// the nations (see SoloLeaderboardResponseSchema for the scoring).
@customElement("leaderboard-solo-table")
export class LeaderboardSoloTable extends LitElement {
  @state() private soloData: SoloLeaderboardResponse | null = null;
  @state() private isLoading = false;
  @state() private error: string | null = null;

  private hasLoaded = false;

  createRenderRoot() {
    return this;
  }

  public async ensureLoaded() {
    if (this.hasLoaded || this.isLoading) return;
    await this.loadSoloLeaderboard();
  }

  public async loadSoloLeaderboard() {
    this.isLoading = true;
    this.error = null;

    try {
      const data = await fetchSoloLeaderboard();
      if (!data) throw new Error("Failed to load solo leaderboard");

      this.soloData = data;
      this.hasLoaded = true;
    } catch (error) {
      console.error("loadSoloLeaderboard: request failed", error);
      this.error = translateText("leaderboard_modal.error");
    } finally {
      this.isLoading = false;
    }
  }

  // Same handoff the other boards use: the profile modal's back button
  // reopens the leaderboard.
  private openProfile(publicId: string) {
    document
      .querySelector<
        HTMLElement & { openFromLeaderboard(publicId: string): void }
      >("player-profile-modal")
      ?.openFromLeaderboard(publicId);
  }

  // How a win scores, above the table and on the empty board alike.
  private renderRules() {
    return html`
      <div
        class="px-4 py-2 text-[11px] text-white/40 border-b border-white/5 bg-black/20"
      >
        ${translateText("leaderboard_modal.solo_rules")}
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
        <p class="mb-8 text-center text-red-100/80 font-medium">
          ${this.error ?? translateText("leaderboard_modal.error")}
        </p>
        <button
          class="px-8 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-sm font-bold uppercase transition-all active:scale-95"
          @click=${() => this.loadSoloLeaderboard()}
        >
          ${translateText("leaderboard_modal.try_again")}
        </button>
      </div>
    `;
  }

  private renderNoData() {
    return html`
      <div class="h-full flex flex-col border border-white/5 bg-black/20">
        ${this.renderRules()}
        <div
          class="flex-1 flex flex-col items-center justify-center p-12 text-white/40"
        >
          <h3 class="text-xl font-bold text-white/60 mb-2">
            ${translateText("leaderboard_modal.no_data_yet")}
          </h3>
          <p class="text-white/30 text-sm text-center">
            ${translateText("leaderboard_modal.solo_no_stats")}
          </p>
        </div>
      </div>
    `;
  }

  render() {
    if (this.isLoading) return this.renderLoading();
    if (this.error) return this.renderError();
    if (!this.soloData || this.soloData.players.length === 0)
      return this.renderNoData();

    const { players } = this.soloData;
    const maxPoints = Math.max(...players.map((p) => p.points), 1);

    return html`
      <div class="h-full">
        <div class="h-full border border-white/5 bg-black/20 flex flex-col">
          ${this.renderRules()}
          <div
            class="flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-white/20"
          >
            <table class="w-full text-sm border-collapse table-fixed">
              <colgroup>
                <col style="width: 3.5rem" />
                <col style="width: 8rem" />
                <col style="width: 4rem" />
                <col style="width: 4.5rem" />
                <col style="width: 7rem" />
              </colgroup>
              <thead class="sticky top-0 z-10">
                <tr
                  class="text-white/40 text-[10px] uppercase tracking-wider border-b border-white/5 bg-[#1e2433]"
                >
                  <th class="py-4 px-4 text-center font-bold">
                    ${translateText("leaderboard_modal.rank")}
                  </th>
                  <th class="py-4 px-4 text-left font-bold">
                    ${translateText("leaderboard_modal.player")}
                  </th>
                  <th class="py-4 px-2 text-right font-bold whitespace-nowrap">
                    ${translateText("leaderboard_modal.wins")}
                  </th>
                  <th class="py-4 px-4 text-right font-bold whitespace-nowrap">
                    ${translateText("leaderboard_modal.games")}
                  </th>
                  <th
                    class="py-4 px-4 text-right font-bold pr-6 whitespace-nowrap"
                    title=${translateText(
                      "leaderboard_modal.solo_points_tooltip",
                    )}
                  >
                    ${translateText("leaderboard_modal.solo_points")}
                  </th>
                </tr>
              </thead>
              <tbody>
                ${players.map((player) => {
                  const { color, icon } = rankStyle(player.rank);
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
                      <td class="py-3 px-4 wrap-break-words">
                        <player-name
                          class="min-w-0"
                          .username=${player.username}
                          .publicId=${player.publicId}
                          .nameClass=${"font-bold text-white hover:underline truncate text-left"}
                          .onNameClick=${() =>
                            this.openProfile(player.publicId)}
                        ></player-name>
                      </td>
                      <td class="py-3 px-2 text-right font-mono text-white/80">
                        ${player.wins.toLocaleString()}
                      </td>
                      <td class="py-3 px-4 text-right font-mono text-white/60">
                        ${player.games.toLocaleString()}
                      </td>
                      <td class="py-3 px-4 text-right pr-6">
                        <div class="flex flex-col items-end gap-1">
                          <span class="text-white font-mono font-medium"
                            >${player.points.toLocaleString()}</span
                          >
                          <div
                            class="w-24 h-1 bg-white/10 rounded-full overflow-hidden"
                          >
                            <div
                              class="h-full bg-emerald-500/50 rounded-full"
                              style="width: ${(player.points / maxPoints) *
                              100}%"
                            ></div>
                          </div>
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
