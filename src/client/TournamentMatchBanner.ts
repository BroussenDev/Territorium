import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { TournamentMatch } from "../core/ApiSchemas";
import { fetchMyTournamentMatch, getUserMe } from "./Api";
import { translateText } from "./Utils";

const POLL_MS = 30_000;

// "Your tournament match is ready": shown on every menu page when a signed-in
// player's match game is waiting for them (the API's /tournaments/me), with
// the button that joins it. Never in a game.
@customElement("tournament-match-banner")
export class TournamentMatchBanner extends LitElement {
  @state() private ready: {
    tournamentId: string;
    name: string;
    match: TournamentMatch;
  } | null = null;
  @state() private dismissed: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this.poll();
    this.timer = setInterval(() => void this.poll(), POLL_MS);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.timer !== null) clearInterval(this.timer);
  }

  private async poll() {
    if (document.body.classList.contains("in-game")) return;
    if ((await getUserMe()) === false) {
      this.ready = null;
      return;
    }
    this.ready = await fetchMyTournamentMatch();
  }

  render() {
    const r = this.ready;
    if (
      r === null ||
      !r.match.joinUrl ||
      this.dismissed === r.match.id ||
      document.body.classList.contains("in-game")
    ) {
      return nothing;
    }
    return html`<div
      class="fixed bottom-4 left-1/2 z-[9000] flex w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded-xl border border-emerald-400/60 bg-[#0e171b]/95 p-3 shadow-2xl backdrop-blur-sm"
      role="status"
    >
      <div class="min-w-0">
        <div class="font-bold text-white">
          ${translateText("tournaments.match_ready")}
        </div>
        <div class="truncate text-sm text-white/60">${r.name}</div>
      </div>
      <a
        class="ml-auto shrink-0 rounded-lg bg-brand px-4 py-2 font-bold text-white hover:brightness-110"
        href=${r.match.joinUrl}
        >${translateText("tournaments.join")}</a
      >
      <button
        class="shrink-0 px-1 text-white/50 hover:text-white"
        aria-label=${translateText("common.close")}
        @click=${() => (this.dismissed = r.match.id)}
      >
        ×
      </button>
    </div>`;
  }
}
