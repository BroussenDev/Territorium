import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { RankedFfaLeaderboardResponse } from "../../../core/ApiSchemas";
import { fetchRankedFfaLeaderboard } from "../../Api";
import { translateText } from "../../Utils";
import "../PlayerName";
import { tierEmblem, tierLabel } from "../ranked/RankedTier";
import { goldFramed } from "./GoldFrame";
import { rankStyle } from "./LeaderboardTribeTable";

// The ranked free-for-all board: this season's top 100 placed players.
@customElement("leaderboard-ranked-table")
export class LeaderboardRankedTable extends LitElement {
  @state() private data: RankedFfaLeaderboardResponse | null = null;
  @state() private isLoading = false;
  @state() private error: string | null = null;

  private hasLoaded = false;

  createRenderRoot() {
    return this;
  }

  public async ensureLoaded() {
    if (this.hasLoaded || this.isLoading) return;
    await this.load();
  }

  public async load() {
    this.isLoading = true;
    this.error = null;
    try {
      const data = await fetchRankedFfaLeaderboard();
      if (!data) throw new Error("Failed to load ranked leaderboard");
      this.data = data;
      this.hasLoaded = true;
    } catch (error) {
      console.error("LeaderboardRankedTable: request failed", error);
      this.error = translateText("leaderboard_modal.error");
    } finally {
      this.isLoading = false;
    }
  }

  private openProfile(publicId: string) {
    document
      .querySelector<
        HTMLElement & { openFromLeaderboard(publicId: string): void }
      >("player-profile-modal")
      ?.openFromLeaderboard(publicId);
  }

  private renderRules() {
    const season = this.data?.season;
    return html`
      <div
        class="px-4 py-2 text-[11px] text-white/40 border-b border-white/5 bg-black/20"
      >
        ${season
          ? translateText("leaderboard_modal.ranked_rules", {
              season: season.number,
              date: new Date(season.endsAt).toLocaleDateString(),
            })
          : ""}
      </div>
    `;
  }

  render() {
    if (this.isLoading) {
      return html`<div class="flex justify-center p-12">
        <div
          class="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"
        ></div>
      </div>`;
    }
    if (this.error) {
      return html`
        <div class="flex flex-col items-center justify-center p-12 text-white">
          <p class="mb-8 text-center text-red-100/80 font-medium">
            ${this.error}
          </p>
          <button
            class="px-8 py-3 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-xl text-sm font-bold uppercase transition-all active:scale-95"
            @click=${() => this.load()}
          >
            ${translateText("leaderboard_modal.try_again")}
          </button>
        </div>
      `;
    }
    const players = this.data?.players ?? [];
    if (players.length === 0) {
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
              ${translateText("leaderboard_modal.ranked_no_players")}
            </p>
          </div>
        </div>
      `;
    }
    return html`
      <div class="h-full border border-white/5 bg-black/20 flex flex-col">
        ${this.renderRules()}
        <div
          class="flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-white/20"
        >
          <table class="w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col style="width: 3.5rem" />
              <col style="width: 8rem" />
              <col style="width: 7rem" />
              <col style="width: 4rem" />
              <col style="width: 4.5rem" />
              <col style="width: 4.5rem" />
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
                <th class="py-4 px-2 text-left font-bold">
                  ${translateText("leaderboard_modal.tier")}
                </th>
                <th class="py-4 px-2 text-right font-bold">
                  ${translateText("leaderboard_modal.elo")}
                </th>
                <th class="py-4 px-2 text-right font-bold whitespace-nowrap">
                  ${translateText("leaderboard_modal.wins")}
                </th>
                <th class="py-4 px-4 text-right font-bold whitespace-nowrap">
                  ${translateText("leaderboard_modal.games")}
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
                      ${goldFramed(
                        player.goldFrame,
                        html`<player-name
                          class="min-w-0"
                          .username=${player.username}
                          .publicId=${player.publicId}
                          .nameClass=${"font-bold text-white hover:underline truncate text-left"}
                          .onNameClick=${() =>
                            this.openProfile(player.publicId)}
                        ></player-name>`,
                      )}
                    </td>
                    <td class="py-3 px-2">
                      <span class="flex items-center gap-2 text-white/90">
                        ${tierEmblem(player.tier, 24)}
                        <span class="truncate">${tierLabel(player.tier)}</span>
                      </span>
                    </td>
                    <td
                      class="py-3 px-2 text-right font-mono text-white font-medium"
                    >
                      ${player.elo}
                    </td>
                    <td class="py-3 px-2 text-right font-mono text-white/80">
                      ${player.wins.toLocaleString()}
                    </td>
                    <td class="py-3 px-4 text-right font-mono text-white/60">
                      ${player.games.toLocaleString()}
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
