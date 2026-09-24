import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import { ClientEnv } from "src/client/ClientEnv";
import { RankedStatus } from "../core/ApiSchemas";
import { responseHasLinkedIdentity } from "./AccountIdentity";
import {
  fetchRankedStatus,
  getUserMe,
  leaveRankedQueue,
  pollRankedQueue,
} from "./Api";
import { BaseModal } from "./components/BaseModal";
import { tierEmblem, tierLabel } from "./components/ranked/RankedTier";
import { modalHeader } from "./components/ui/ModalHeader";
import type { JoinLobbyEvent } from "./Main";
import { ensureServerList, redirectToGameVersion } from "./ServerList";
import { translateText } from "./Utils";

// The API keeps a searching player queued while they poll: it drops anyone
// silent for ~10 s, so poll well inside that.
const POLL_MS = 2_500;
// A short pause before the first poll, so a player who backs out at once
// never enters the queue.
const JOIN_DELAY_MS = 1_500;

interface QueueView {
  count: number;
  min: number;
  max: number;
  lowMin: number;
  startsIn: number | null;
  lowIn: number;
  receivedAt: number;
}

// The ranked free-for-all queue. It polls the API over HTTP (the account API
// sits behind a proxy without WebSockets) until a game server takes the
// match, then joins that game like any other lobby.
@customElement("matchmaking-modal")
export class MatchmakingModal extends BaseModal {
  private pollTimeout: ReturnType<typeof setTimeout> | null = null;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private gameCheckInterval: ReturnType<typeof setInterval> | null = null;
  // Bumped on every (re)start and close, so a poll answered after the modal
  // closed or restarted is ignored.
  private session = 0;
  // Set once a poll has gone out: only then does the API hold a queue entry
  // worth leaving.
  private queued = false;
  @state() private queue: QueueView | null = null;
  @state() private gameID: string | null = null;
  @state() private status: RankedStatus | null = null;

  constructor() {
    super();
    this.id = "page-matchmaking";
  }

  createRenderRoot() {
    return this;
  }

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("ranked.queue_title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody() {
    return html`
      <div class="flex flex-col items-center justify-center gap-6 p-6">
        ${this.renderStanding()} ${this.renderInner()}
        ${this.gameID === null
          ? html`<button
              class="px-6 py-2 rounded-xl text-sm font-bold text-white/70 border border-white/15 hover:bg-white/10 transition-colors"
              @click=${() => this.close()}
            >
              ${translateText("ranked.leave_queue")}
            </button>`
          : ""}
      </div>
    `;
  }

  private renderStanding() {
    const s = this.status;
    if (s === null) return "";
    return html`
      <div class="flex items-center gap-3 text-white/80">
        ${s.tier ? tierEmblem(s.tier, 32) : ""}
        <span class="font-bold">
          ${s.tier
            ? `${tierLabel(s.tier)} · ${s.elo}`
            : translateText("ranked.placement_progress", {
                done: 5 - s.placementLeft,
                total: 5,
              })}
        </span>
      </div>
    `;
  }

  private secondsLeft(seconds: number, receivedAt: number): number {
    return Math.max(0, seconds - Math.floor((Date.now() - receivedAt) / 1000));
  }

  private renderInner() {
    if (this.gameID !== null) {
      return this.renderLoadingSpinner(
        translateText("matchmaking_modal.waiting_for_game"),
        "yellow",
      );
    }
    const q = this.queue;
    if (q === null) {
      return this.renderLoadingSpinner(
        translateText("matchmaking_modal.connecting"),
        "blue",
      );
    }
    let hint: string;
    if (q.startsIn !== null) {
      hint = translateText("ranked.starts_in", {
        seconds: this.secondsLeft(q.startsIn, q.receivedAt),
      });
    } else {
      const lowIn = this.secondsLeft(q.lowIn, q.receivedAt);
      hint =
        lowIn > 0
          ? translateText("ranked.need_players", {
              min: q.min,
              lowMin: q.lowMin,
              seconds: lowIn,
            })
          : translateText("ranked.small_match_ready", { lowMin: q.lowMin });
    }
    return html`
      <div class="flex flex-col items-center gap-3 text-center">
        <p class="text-4xl font-bold text-white tabular-nums">
          ${q.count}<span class="text-white/40 text-2xl"> / ${q.max}</span>
        </p>
        <p class="text-sm text-white/60">
          ${translateText("ranked.players_in_queue")}
        </p>
        <div class="w-56 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            class="h-full bg-emerald-500 transition-all"
            style="width: ${Math.min(100, (q.count / q.min) * 100)}%"
          ></div>
        </div>
        <p class="text-sm text-white/80 max-w-xs">${hint}</p>
      </div>
      ${this.renderLoadingSpinner(
        translateText("matchmaking_modal.searching"),
        "green",
      )}
    `;
  }

  // Re-enter the queue after a pre-start match cancellation (too few matched
  // players connected). The modal is normally still open on "waiting for
  // game" at that point. Returns false when the modal was closed in the
  // meantime, so the caller knows nothing was rejoined.
  public requeue(): boolean {
    if (!this.isModalOpen) {
      return false;
    }
    this.start();
    return true;
  }

  private stopTimers() {
    if (this.pollTimeout) clearTimeout(this.pollTimeout);
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.gameCheckInterval) clearInterval(this.gameCheckInterval);
    this.pollTimeout = null;
    this.tickInterval = null;
    this.gameCheckInterval = null;
  }

  private start() {
    this.stopTimers();
    const session = ++this.session;
    this.queue = null;
    this.gameID = null;
    this.queued = false;
    // Redraws the countdowns between polls.
    this.tickInterval = setInterval(() => this.requestUpdate(), 1000);
    this.pollTimeout = setTimeout(() => this.poll(session), JOIN_DELAY_MS);
  }

  private async poll(session: number) {
    this.queued = true;
    const result = await pollRankedQueue();
    if (session !== this.session) return;
    if (result === "login_required") {
      this.close();
      this.mustLogIn();
      return;
    }
    if (result !== false && "gameId" in result) {
      console.log(`matchmaking: got game ID: ${result.gameId}`);
      this.stopTimers();
      this.gameID = result.gameId;
      this.gameCheckInterval = setInterval(() => this.checkGame(), 1000);
      return;
    }
    // A failed poll keeps the last state and simply tries again.
    if (result !== false) this.queue = { ...result, receivedAt: Date.now() };
    this.pollTimeout = setTimeout(() => this.poll(session), POLL_MS);
  }

  private mustLogIn() {
    window.dispatchEvent(
      new CustomEvent("show-message", {
        detail: {
          message: translateText("ranked.login_required"),
          color: "red",
          duration: 4000,
        },
      }),
    );
    window.showPage?.("page-account");
  }

  protected async onOpen(): Promise<void> {
    this.status = null;
    const userMe = await getUserMe();
    if (!this.isModalOpen) return;
    if (userMe === false || !responseHasLinkedIdentity(userMe)) {
      this.close();
      this.mustLogIn();
      return;
    }
    this.start();
    const status = await fetchRankedStatus();
    if (this.isModalOpen && status !== false) this.status = status;
  }

  protected onClose(): void {
    const wasQueued = this.gameID === null && this.queued;
    this.session++;
    this.stopTimers();
    if (wasQueued) void leaveRankedQueue();
  }

  private async checkGame() {
    if (this.gameID === null) {
      return;
    }
    // The matched game may carry any server's letter: resolve it through
    // the API's list (multi-server v2) rather than this page's own map. The
    // version check waits until the game exists, below: this poll fires
    // every second and must never navigate.
    await ensureServerList();
    const url = `${ClientEnv.gameHttpBase(this.gameID)}/${ClientEnv.gameWorkerPath(this.gameID)}/api/game/${this.gameID}/exists`;

    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    const gameInfo = await response.json();

    if (response.status !== 200) {
      console.error(`Error checking game ${this.gameID}: ${response.status}`);
      return;
    }

    if (!gameInfo.exists) {
      console.info(`Game ${this.gameID} does not exist or hasn't started yet`);
      return;
    }

    if (this.gameCheckInterval) {
      clearInterval(this.gameCheckInterval);
      this.gameCheckInterval = null;
    }

    // Open the game at its server's version now: being bounced at join time
    // costs a page load, which a ranked game's start deadline does not
    // allow. See docs/MultiServer.md, "Opening a game at its server's
    // version" (OPE-471).
    if (redirectToGameVersion(this.gameID)) {
      return;
    }

    this.dispatchEvent(
      new CustomEvent("join-lobby", {
        detail: {
          gameID: this.gameID,
          source: "matchmaking",
        } as JoinLobbyEvent,
        bubbles: true,
        composed: true,
      }),
    );
  }
}
