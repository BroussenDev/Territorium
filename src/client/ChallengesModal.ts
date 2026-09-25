import { html } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  ChallengePeriod,
  ChallengesResponse,
  MultiChallenge,
  SoloBoardEntry,
  SoloChallenge,
  UserMeResponse,
} from "../core/ApiSchemas";
import { generateID } from "../core/Util";
import { responseHasLinkedIdentity } from "./AccountIdentity";
import { fetchChallenges, getUserMe } from "./Api";
import { BaseModal } from "./components/BaseModal";
import "./components/CapIcon";
import { modalHeader } from "./components/ui/ModalHeader";
import { getPlayerCosmetics } from "./Cosmetics";
import { GameStartingModal } from "./GameStartingModal";
import { JoinLobbyEvent } from "./Main";
import { fallbackPlayerName } from "./PlayerName";
import { terrainMapFileLoader } from "./TerrainMapFileLoader";
import { UsernameInput } from "./UsernameInput";
import { getMapName, translateText } from "./Utils";

const PERIODS: ChallengePeriod[] = ["daily", "weekly", "monthly"];

// Templates with a label of their own; a newer one reads as "task_other".
const TASKS = new Set([
  "games",
  "wins",
  "build_city",
  "build_port",
  "build_defp",
  "build_silo",
  "build_saml",
  "build_fact",
  "build_wshp",
  "destroy",
  "capture",
  "bombs",
  "trade",
  "boats",
  "sink",
  "conquer",
  "alliances",
]);

// Ten ticks a second: a solo time as m:ss.
export function formatTicks(ticks: number): string {
  const seconds = Math.floor(ticks / 10);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

// Time left until an ISO date: "2d 5h", "5h 12m" or "12m".
export function formatTimeLeft(endsAt: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return translateText("challenges.days_hours", { days, hours });
  if (hours > 0) {
    return translateText("challenges.hours_minutes", {
      hours,
      minutes: minutes % 60,
    });
  }
  return translateText("challenges.minutes", { minutes });
}

function medals(amount: number) {
  return html`<span
    class="inline-flex items-center gap-1 font-bold text-amber-500 tabular-nums"
    title=${translateText("cosmetics.soft")}
    ><cap-icon .size=${16}></cap-icon>${amount}</span
  >`;
}

// The challenges hub: the daily solo race, then the multiplayer challenges of
// the day, the week and the month.
@customElement("challenges-modal")
export class ChallengesModal extends BaseModal {
  protected routerName = "challenges";

  @state() private data: ChallengesResponse | null = null;
  @state() private loadFailed = false;
  @state() private userMe: UserMeResponse | false | null = null;
  @state() private now = Date.now();
  @state() private starting = false;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.id = "page-challenges";
  }

  createRenderRoot() {
    return this;
  }

  private signedIn(): boolean {
    return this.userMe !== null && responseHasLinkedIdentity(this.userMe);
  }

  protected override async onOpen(): Promise<void> {
    this.loadFailed = false;
    this.now = Date.now();
    this.ticker ??= setInterval(() => (this.now = Date.now()), 30_000);
    const [userMe, data] = await Promise.all([getUserMe(), fetchChallenges()]);
    this.userMe = userMe;
    this.data = data === false ? null : data;
    this.loadFailed = data === false;
  }

  protected override onClose(): void {
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
  }

  protected renderHeaderSlot() {
    return modalHeader({
      title: translateText("challenges.title"),
      onBack: () => this.close(),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody() {
    if (this.data === null) {
      return this.loadFailed
        ? html`<p class="p-6 text-center text-white/60">
            ${translateText("map_component.error")}
          </p>`
        : this.renderLoadingSpinner();
    }
    const solo = this.data.challenges.find(
      (c): c is SoloChallenge => c.kind === "solo",
    );
    const multi = this.data.challenges.filter(
      (c): c is MultiChallenge => c.kind === "multi",
    );
    return html`
      <div class="custom-scrollbar p-4 sm:p-6 flex flex-col gap-5">
        ${this.userMe !== null && !this.signedIn() ? this.renderLogin() : ""}
        ${solo ? this.renderSolo(solo) : ""}
        <div class="grid gap-4 lg:grid-cols-3">
          ${PERIODS.map((period) =>
            this.renderPeriod(
              period,
              multi.filter((c) => c.period === period),
            ),
          )}
        </div>
        <p class="text-xs text-white/50 text-center">
          ${translateText("challenges.public_only")}
        </p>
        ${this.renderLastSolo()}
      </div>
    `;
  }

  private renderLogin() {
    return html`
      <section
        class="rounded-2xl bg-white/5 border border-white/10 p-4 flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left"
      >
        <p class="flex-1 text-sm text-white/80">
          ${translateText("challenges.login_required")}
        </p>
        <button
          class="px-5 py-2 rounded-xl bg-brand hover:bg-brand-light text-white font-bold transition-colors"
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

  private renderSolo(c: SoloChallenge) {
    const map = c.config.gameMap;
    return html`
      <section
        class="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30"
      >
        <img
          src=${terrainMapFileLoader.getMapData(map).webpPath}
          alt=""
          draggable="false"
          class="pointer-events-none absolute inset-0 size-full object-cover opacity-25 select-none"
        />
        <div
          class="relative grid gap-5 p-5 md:grid-cols-[1fr_18rem] bg-gradient-to-r from-black/70 to-black/30"
        >
          <div class="flex flex-col gap-3 min-w-0">
            <div class="flex flex-wrap items-baseline justify-between gap-2">
              <h3 class="text-xl font-bold text-white">
                ${translateText("challenges.solo_title")}
              </h3>
              <span class="text-xs text-white/60">
                ${translateText("challenges.ends_in", {
                  time: formatTimeLeft(c.endsAt, this.now),
                })}
              </span>
            </div>
            <p class="text-sm text-white/70">
              ${translateText("challenges.solo_desc")}
            </p>
            <dl class="flex flex-wrap gap-2 text-sm">
              ${[
                getMapName(map) ?? map,
                translateText(
                  `difficulty.${c.config.difficulty.toLowerCase()}`,
                ),
                translateText("challenges.solo_bots", { n: c.config.bots }),
              ].map(
                (value) =>
                  html`<dd
                    class="rounded-lg bg-white/10 px-2.5 py-1 font-bold text-white"
                  >
                    ${value}
                  </dd>`,
              )}
            </dl>
            <ul class="flex flex-col gap-1 text-sm text-white/80">
              <li class="flex items-center gap-2">
                ${medals(c.medals)} ${translateText("challenges.solo_finish")}
              </li>
              <li class="flex items-center gap-2">
                ${medals(c.placeMedals[0] ?? 0)}
                ${translateText("challenges.solo_places", {
                  n: c.placeMedals.length,
                })}
              </li>
            </ul>
            ${this.renderSoloMine(c)}
            <button
              class="w-full sm:w-auto sm:self-start px-8 py-3 rounded-xl bg-brand hover:bg-brand-light active:scale-[0.98] text-white text-lg font-bold transition-all disabled:opacity-60"
              ?disabled=${this.starting}
              @click=${() => this.playSolo(c)}
            >
              ${translateText("challenges.solo_play")}
            </button>
          </div>
          ${this.renderBoard(c.board, c.players)}
        </div>
      </section>
    `;
  }

  private renderSoloMine(c: SoloChallenge) {
    const mine = c.mine;
    if (mine === null) return "";
    const lines: string[] = [];
    if (mine.bestTicks !== null) {
      lines.push(
        translateText("challenges.solo_mine", {
          time: formatTicks(mine.bestTicks),
          rank: mine.rank ?? "-",
        }),
      );
    }
    if (mine.checking) lines.push(translateText("challenges.solo_checking"));
    else if (mine.rejected && mine.bestTicks === null) {
      lines.push(translateText("challenges.solo_rejected"));
    }
    return lines.map(
      (line) => html`<p class="text-sm font-bold text-white">${line}</p>`,
    );
  }

  private renderBoard(board: SoloBoardEntry[], players: number) {
    return html`
      <div class="rounded-xl bg-black/40 p-3 flex flex-col gap-1">
        <div class="flex justify-between text-xs text-white/60 mb-1">
          <span>${translateText("challenges.solo_board")}</span>
          <span
            >${translateText("challenges.solo_players", { n: players })}</span
          >
        </div>
        ${board.length === 0
          ? html`<p class="py-4 text-center text-sm text-white/60">
              ${translateText("challenges.solo_empty")}
            </p>`
          : html`<ol class="flex flex-col gap-0.5">
              ${board.map((line) => this.renderBoardLine(line))}
            </ol>`}
      </div>
    `;
  }

  private renderBoardLine(line: SoloBoardEntry) {
    return html`<li class="flex items-center gap-2 text-sm">
      <span class="w-6 text-right tabular-nums text-white/50"
        >${line.rank}</span
      >
      <button
        class="flex-1 truncate text-left text-white hover:underline"
        @click=${() =>
          document
            .querySelector<
              HTMLElement & { open(args: Record<string, unknown>): void }
            >("player-profile-modal")
            ?.open({ publicID: line.publicId })}
      >
        ${line.username ?? translateText("challenges.anonymous")}
      </button>
      <span class="tabular-nums font-bold text-white"
        >${formatTicks(line.ticks)}</span
      >
    </li>`;
  }

  private renderPeriod(period: ChallengePeriod, list: MultiChallenge[]) {
    const endsAt = list[0]?.endsAt;
    return html`
      <section
        class="rounded-2xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3"
      >
        <div class="flex items-baseline justify-between gap-2">
          <h3 class="font-bold text-white">
            ${translateText(`challenges.${period}`)}
          </h3>
          ${endsAt
            ? html`<span class="text-xs text-white/60">
                ${translateText("challenges.ends_in", {
                  time: formatTimeLeft(endsAt, this.now),
                })}
              </span>`
            : ""}
        </div>
        ${list.map((c) => this.renderTask(c))}
      </section>
    `;
  }

  private renderTask(c: MultiChallenge) {
    const task = TASKS.has(c.template) ? c.template : "other";
    const done = c.completed;
    const shown = done ? c.target : Math.min(c.progress, c.target);
    const conditions = [
      c.scope === "game" ? translateText("challenges.scope_game") : null,
      c.mode === "any"
        ? null
        : translateText(c.mode === "ffa" ? "game_mode.ffa" : "game_mode.teams"),
    ].filter((s): s is string => s !== null);
    return html`
      <div
        class="rounded-xl p-3 flex flex-col gap-2 ${done
          ? "bg-green-500/10 border border-green-500/30"
          : "bg-black/20 border border-white/5"}"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex flex-col min-w-0">
            <span class="text-sm font-bold text-white">
              ${translateText(`challenges.task_${task}`, { n: c.target })}
            </span>
            ${conditions.length > 0
              ? html`<span class="mt-1 flex flex-wrap gap-1">
                  ${conditions.map(
                    (condition) =>
                      html`<span
                        class="rounded-md bg-white/10 px-1.5 py-0.5 text-xs text-white/70"
                        >${condition}</span
                      >`,
                  )}
                </span>`
              : ""}
          </div>
          ${medals(c.medals)}
        </div>
        <div class="flex items-center gap-2">
          <div class="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              class="h-full rounded-full ${done ? "bg-green-500" : "bg-brand"}"
              style="width: ${(shown / c.target) * 100}%"
            ></div>
          </div>
          <span class="text-xs tabular-nums text-white/70">
            ${done
              ? translateText("challenges.done")
              : `${shown} / ${c.target}`}
          </span>
        </div>
      </div>
    `;
  }

  private renderLastSolo() {
    const last = this.data?.lastSolo;
    if (!last || last.board.length === 0) return "";
    return html`
      <section class="rounded-2xl bg-black/20 border border-white/5 p-4">
        <h3 class="text-sm font-bold text-white mb-2">
          ${translateText("challenges.yesterday", {
            map: getMapName(last.config.gameMap) ?? last.config.gameMap,
          })}
        </h3>
        <ol class="grid gap-1 sm:grid-cols-3">
          ${last.board.map((line) => this.renderBoardLine(line))}
        </ol>
      </section>
    `;
  }

  // Starts the challenge's game as the singleplayer modal would, with the
  // challenge's config untouched: a changed setting disqualifies the run.
  private async playSolo(c: SoloChallenge) {
    if (this.starting) return;
    this.starting = true;
    const startingModal = document.querySelector("game-starting-modal");
    const overlay =
      startingModal instanceof GameStartingModal ? startingModal : null;
    overlay?.show();
    let dispatched = false;
    try {
      const usernameInput = document.querySelector(
        "username-input",
      ) as UsernameInput | null;
      await usernameInput?.whenSeeded();
      const resolvedName =
        usernameInput?.resolvedName() ?? fallbackPlayerName();
      const cosmetics = await getPlayerCosmetics({
        verified: resolvedName.verified,
      });
      const clientID = generateID();
      const gameID = generateID();
      this.dispatchEvent(
        new CustomEvent("join-lobby", {
          detail: {
            gameID,
            gameStartInfo: {
              gameID,
              players: [
                {
                  clientID,
                  username: resolvedName.name,
                  clanTag: usernameInput?.joinClanTag() ?? null,
                  cosmetics,
                },
              ],
              config: c.config,
              lobbyCreatedAt: Date.now(),
            },
            source: "singleplayer",
          } satisfies JoinLobbyEvent,
          bubbles: true,
          composed: true,
        }),
      );
      dispatched = true;
      this.close();
    } finally {
      this.starting = false;
      if (!dispatched) overlay?.hide();
    }
  }
}
