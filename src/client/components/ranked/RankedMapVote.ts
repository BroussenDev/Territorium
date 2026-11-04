import { html, LitElement, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { RankedMapVote as MapVote } from "../../../core/ApiSchemas";
import type { GameMapType } from "../../../core/game/Game";
import { fetchRankedMapVote, postRankedMapVote } from "../../Api";
import { terrainMapFileLoader } from "../../TerrainMapFileLoader";
import { getMapName, translateText } from "../../Utils";
import {
  canCastVote,
  isBannedMap,
  leadingMaps,
  mapForKey,
  voteAction,
  voteSecondsLeft,
} from "./MapVoteLogic";

const POLL_MS = 1_000;

// Custom icons: a crossed circle for a ban, a check for a vote.
const banIcon = svg`<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/></svg>`;
const checkIcon = svg`<svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

// The map vote of a ranked match, shown in the matchmaking window once the
// match is formed. It polls the vote every second, so the other players'
// bans and votes appear live, and ends by itself when the map is settled.
@customElement("ranked-map-vote")
export class RankedMapVote extends LitElement {
  @property({ type: String }) voteId = "";
  @state() private vote: MapVote | null = null;
  @state() private receivedAt = 0;
  @state() private sending = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  // The longest wait seen, the full width of the countdown bar.
  private span = 1;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKey);
    this.tickTimer = setInterval(() => this.requestUpdate(), 500);
    void this.poll(++this.generation);
  }

  disconnectedCallback() {
    this.generation++;
    window.removeEventListener("keydown", this.onKey);
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.pollTimer = null;
    this.tickTimer = null;
    super.disconnectedCallback();
  }

  private async poll(generation: number) {
    const vote = await fetchRankedMapVote(this.voteId);
    if (generation !== this.generation) return;
    if (vote !== false) {
      this.vote = vote;
      this.receivedAt = Date.now();
      this.span = Math.max(this.span, vote.endsInMs);
    }
    this.pollTimer = setTimeout(() => void this.poll(generation), POLL_MS);
  }

  private onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (this.vote === null) return;
    const map = mapForKey(this.vote.options, event.key);
    if (map !== null) void this.cast(map);
  };

  private async cast(map: string) {
    const vote = this.vote;
    if (vote === null || this.sending || !canCastVote(vote)) return;
    this.sending = true;
    const next = await postRankedMapVote(this.voteId, map, voteAction(vote));
    this.sending = false;
    if (next !== false) {
      this.vote = next;
      this.receivedAt = Date.now();
    }
  }

  private renderCard(vote: MapVote, map: string, index: number) {
    let webp: string | null;
    try {
      webp = terrainMapFileLoader.getMapData(map as GameMapType).webpPath;
    } catch {
      webp = null;
    }
    const name = getMapName(map) ?? map;
    const count = vote.tally[map] ?? 0;
    const banned = isBannedMap(vote, map);
    const mine = vote.mine === map;
    const leading = leadingMaps(vote).includes(map);
    const won = vote.result === map;
    const open = canCastVote(vote);
    const verb = translateText(
      vote.mode === "ban" ? "ranked.vote_ban" : "ranked.vote_pick",
    );
    const border = won
      ? "border-emerald-400 bg-emerald-500/15"
      : mine
        ? "border-brand/60 bg-brand/20"
        : banned
          ? "border-red-500/40 bg-red-500/10"
          : "border-white/10 bg-white/5";
    return html`
      <button
        type="button"
        ?disabled=${!open || this.sending}
        @click=${() => void this.cast(map)}
        aria-label="${verb}: ${name}"
        class="relative flex flex-col gap-2 p-3 rounded-xl border text-left transition-all duration-150 ${border} ${open
          ? "hover:bg-white/10 hover:border-white/30 active:scale-95 cursor-pointer"
          : "cursor-default"}"
      >
        <span
          class="absolute top-2 left-2 z-10 w-6 h-6 rounded-md bg-black/60 text-xs font-bold text-white/80 flex items-center justify-center"
          aria-hidden="true"
          >${index + 1}</span
        >
        ${webp
          ? html`<img
              src="${webp}"
              alt=""
              draggable="false"
              class="w-full aspect-[2/1] object-cover rounded-lg bg-black/20 ${banned
                ? "grayscale opacity-40"
                : ""}"
            />`
          : html`<div
              class="w-full aspect-[2/1] rounded-lg bg-black/20"
            ></div>`}
        <span class="font-display text-sm font-semibold text-white"
          >${name}</span
        >
        <span
          class="flex items-center justify-between text-xs min-h-5 text-white/70"
        >
          ${banned
            ? html`<span class="flex items-center gap-1 text-red-300"
                >${banIcon}${translateText("ranked.vote_banned")}</span
              >`
            : mine
              ? html`<span class="flex items-center gap-1 text-brand"
                  >${vote.mode === "ban" ? banIcon : checkIcon}${translateText(
                    "ranked.vote_mine",
                  )}</span
                >`
              : html`<span></span>`}
          ${vote.mode === "vote"
            ? html`<span
                class="tabular-nums ${leading ? "text-white font-bold" : ""}"
                >${translateText("ranked.vote_count", { count })}</span
              >`
            : ""}
        </span>
      </button>
    `;
  }

  render() {
    const vote = this.vote;
    if (vote === null) {
      return html`<p class="text-sm text-white/60">
        ${translateText("matchmaking_modal.connecting")}
      </p>`;
    }
    const seconds = voteSecondsLeft(vote.endsInMs, this.receivedAt, Date.now());
    const result = vote.result;
    const hint =
      result !== null
        ? translateText("ranked.vote_result", {
            map: getMapName(result) ?? result,
          })
        : translateText(
            vote.mode === "ban"
              ? "ranked.vote_ban_hint"
              : "ranked.vote_pick_hint",
          );
    return html`
      <div
        class="flex flex-col items-center gap-4 w-full max-w-3xl"
        role="group"
        aria-label="${translateText("ranked.vote_title")}"
      >
        <div class="flex flex-col items-center gap-1 text-center">
          <h2 class="text-xl font-bold text-white">
            ${translateText("ranked.vote_title")}
          </h2>
          <p class="text-sm text-white/80" aria-live="polite">${hint}</p>
        </div>
        <div
          class="grid gap-3 w-full ${vote.options.length >= 3
            ? "grid-cols-1 sm:grid-cols-3"
            : "grid-cols-1 sm:grid-cols-2"}"
        >
          ${vote.options.map((map, i) => this.renderCard(vote, map, i))}
        </div>
        ${result === null
          ? html`<div class="flex flex-col items-center gap-2 w-full max-w-sm">
              <div
                class="w-full h-1.5 rounded-full bg-white/10 overflow-hidden"
              >
                <div
                  class="h-full bg-emerald-500 transition-all duration-500"
                  style="width: ${Math.min(
                    100,
                    ((seconds * 1000) / this.span) * 100,
                  )}%"
                ></div>
              </div>
              <p class="text-xs text-white/60 tabular-nums">
                ${translateText("ranked.vote_progress", {
                  voted: vote.voted,
                  total: vote.total,
                })}
                · ${translateText("ranked.vote_seconds", { seconds })}
              </p>
            </div>`
          : html`<p class="text-xs text-white/60">
              ${translateText("ranked.vote_start_soon")}
            </p>`}
      </div>
    `;
  }
}
