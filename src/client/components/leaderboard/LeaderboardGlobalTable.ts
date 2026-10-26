import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  GlobalLeaderboardEntry,
  GlobalLeaderboardResponse,
} from "../../../core/ApiSchemas";
import { fetchGlobalLeaderboard } from "../../Api";
import { translateText } from "../../Utils";
import "../PlayerName";
import { badgeIcon } from "../ui/BadgeIcon";
import { goldFramed } from "./GoldFrame";
import { rankStyle } from "./LeaderboardFormat";
import { podium } from "./Podium";

// The boards the overall one adds up, in the order their places are shown.
const BOARDS: {
  key: keyof GlobalLeaderboardEntry["ranks"];
  label: () => string;
}[] = [
  {
    key: "rankedFfa",
    label: () => translateText("leaderboard_modal.ranked_tab"),
  },
  { key: "solo", label: () => translateText("leaderboard_modal.solo_tab") },
  { key: "duel", label: () => "1v1" },
  { key: "team", label: () => "2v2" },
];

// The overall board: every player board in one, a place on each worth
// points (see GlobalLeaderboardResponseSchema).
@customElement("leaderboard-global-table")
export class LeaderboardGlobalTable extends LitElement {
  @state() private data: GlobalLeaderboardResponse | null = null;
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

  private async load() {
    this.isLoading = true;
    this.error = null;
    try {
      const data = await fetchGlobalLeaderboard();
      if (!data) throw new Error("Failed to load the overall leaderboard");
      this.data = data;
      this.hasLoaded = true;
    } catch (error) {
      console.error("LeaderboardGlobalTable: request failed", error);
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
    return html`
      <div
        class="px-4 py-2 text-[11px] text-white/40 border-b border-white/5 bg-black/20"
      >
        ${translateText("leaderboard_modal.global_rules")}
      </div>
    `;
  }

  private name(player: GlobalLeaderboardEntry, nameClass: string) {
    return html`<player-name
      class="min-w-0"
      .username=${player.username}
      .publicId=${player.publicId}
      .nameClass=${nameClass}
      .onNameClick=${() => this.openProfile(player.publicId)}
    ></player-name>`;
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
            class="rounded-md bg-brand px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-brand-light active:scale-95"
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
              ${translateText("leaderboard_modal.global_no_players")}
            </p>
          </div>
        </div>
      `;
    }
    const unit = translateText("leaderboard_modal.solo_points");
    return html`
      <div class="h-full border border-white/5 bg-black/20 flex flex-col">
        ${this.renderRules()}
        <div
          class="flex-1 min-h-0 overflow-y-auto overflow-x-auto scrollbar-thin scrollbar-thumb-white/20"
        >
          ${podium(
            "global",
            players.slice(0, 3).map((p) => ({
              key: p.publicId,
              name: this.name(p, "font-bold text-white truncate"),
              value: p.points.toLocaleString(),
              unit,
            })),
          )}
          <table class="w-full text-sm border-collapse table-fixed">
            <colgroup>
              <col style="width: 3.5rem" />
              <col style="width: 9rem" />
              <col style="width: 12rem" />
              <col style="width: 5.5rem" />
            </colgroup>
            <thead class="sticky top-0 z-10">
              <tr
                class="text-white/45 text-xs font-medium border-b border-white/5 bg-[#0d1c17]"
              >
                <th class="py-4 px-4 text-center font-bold">
                  ${translateText("leaderboard_modal.rank")}
                </th>
                <th class="py-4 px-4 text-left font-bold">
                  ${translateText("leaderboard_modal.player")}
                </th>
                <th class="py-4 px-4 text-left font-bold">
                  ${translateText("leaderboard_modal.global_boards")}
                </th>
                <th class="py-4 px-4 pr-6 text-right font-bold">${unit}</th>
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
                        player.conquerant,
                      )}
                      ${badgeIcon(
                        player.badge,
                        "inline-block w-4 h-4 align-[-3px] ml-1.5",
                      )}
                    </td>
                    <td class="py-3 px-4">
                      <div class="flex flex-wrap gap-1">
                        ${BOARDS.filter(
                          (b) => player.ranks[b.key] !== undefined,
                        ).map(
                          (b) =>
                            html`<span
                              class="rounded bg-white/[0.06] px-1.5 py-0.5 text-[11px] text-white/70"
                              >${b.label()}
                              <b class="font-mono text-white"
                                >${player.ranks[b.key]}</b
                              ></span
                            >`,
                        )}
                      </div>
                    </td>
                    <td
                      class="py-3 px-4 pr-6 text-right font-mono font-bold text-white"
                    >
                      ${player.points.toLocaleString()}
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
