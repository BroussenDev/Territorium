import { html, nothing, TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  TournamentDetail,
  TournamentMatch,
  TournamentSummary,
} from "../core/ApiSchemas";
import {
  changeTournamentEntry,
  fetchTournament,
  fetchTournaments,
  getUserMe,
} from "./Api";
import { BaseModal } from "./components/BaseModal";
import "./components/CapIcon";
import "./components/PlutoniumIcon";
import { modalHeader } from "./components/ui/ModalHeader";
import { translateText } from "./Utils";

// "1v1", "2v2", "Teams of 4", "Clans, 3 v 3", "Free for all, 8 a game".
export function formatLabel(t: {
  format: TournamentSummary["format"];
  teamSize: number;
  matchSize: number;
}): string {
  switch (t.format) {
    case "duel":
      return "1v1";
    case "duo":
      return "2v2";
    case "teams":
      return translateText("tournaments.format_teams", { n: t.teamSize });
    case "clans":
      return translateText("tournaments.format_clans", { n: t.teamSize });
    default:
      return translateText("tournaments.format_ffa", { n: t.matchSize });
  }
}

const dateTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

// A round's name: the last three are named, the others numbered.
function roundName(round: number, rounds: number): string {
  const fromEnd = rounds - round;
  if (fromEnd === 0) return translateText("tournaments.final");
  if (fromEnd === 1) return translateText("tournaments.semi_final");
  if (fromEnd === 2) return translateText("tournaments.quarter_final");
  return translateText("tournaments.round", { n: round });
}

// The tournaments the team runs: their list, then one in full, where the
// player enters (alone, with teammates, or for their clan), follows the
// bracket and joins their match when it is ready.
@customElement("tournaments-modal")
export class TournamentsModal extends BaseModal {
  protected routerName = "tournaments";

  @state() private list: TournamentSummary[] | null = null;
  @state() private detail: TournamentDetail | null = null;
  @state() private loadFailed = false;
  @state() private signedIn = false;
  @state() private busy = false;
  @state() private formError: string | null = null;
  @state() private now = Date.now();
  private mates: string[] = [];
  private teamName = "";
  private clanTag = "";
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.id = "page-tournaments";
  }

  createRenderRoot() {
    return this;
  }

  protected override async onOpen(): Promise<void> {
    this.detail = null;
    this.loadFailed = false;
    this.ticker ??= setInterval(() => {
      this.now = Date.now();
      // A running tournament moves on its own: follow it.
      if (this.detail?.status === "running") void this.show(this.detail.id);
    }, 15_000);
    const [me, list] = await Promise.all([getUserMe(), fetchTournaments()]);
    this.signedIn = me !== false;
    this.list = list === false ? null : list;
    this.loadFailed = list === false;
  }

  protected override onClose(): void {
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
  }

  private async show(id: string) {
    const detail = await fetchTournament(id);
    if (detail !== false) this.detail = detail;
  }

  private async enter() {
    if (!this.detail) return;
    this.busy = true;
    this.formError = null;
    const body =
      this.detail.teamSize > 1
        ? {
            members: this.mates.map((m) => m.trim()).filter(Boolean),
            teamName: this.teamName,
            clanTag: this.clanTag,
          }
        : {};
    const result = await changeTournamentEntry(this.detail.id, "POST", body);
    this.busy = false;
    if ("error" in result) this.formError = result.error;
    else this.detail = result;
  }

  private async leave() {
    if (!this.detail) return;
    if (!confirm(translateText("tournaments.leave_confirm"))) return;
    this.busy = true;
    const result = await changeTournamentEntry(this.detail.id, "DELETE");
    this.busy = false;
    if ("error" in result) this.formError = result.error;
    else this.detail = result;
  }

  protected renderHeaderSlot() {
    return modalHeader({
      title: this.detail?.name ?? translateText("tournaments.title"),
      onBack: () => (this.detail ? (this.detail = null) : this.close()),
      ariaLabel: translateText("common.back"),
    });
  }

  protected renderBody() {
    if (this.detail) return this.renderDetail(this.detail);
    if (this.list === null) {
      return this.loadFailed
        ? html`<p class="p-6 text-center text-white/60">
            ${translateText("map_component.error")}
          </p>`
        : this.renderLoadingSpinner();
    }
    if (this.list.length === 0) {
      return html`<div
        class="flex flex-col items-center gap-2 p-10 text-center"
      >
        ${bracketIcon("h-12 w-12 text-white/25")}
        <p class="font-bold text-white/70">
          ${translateText("tournaments.none")}
        </p>
        <p class="text-sm text-white/45">
          ${translateText("tournaments.none_hint")}
        </p>
      </div>`;
    }
    return html`<div class="grid gap-3 p-4 sm:grid-cols-2">
      ${this.list.map((t) => this.renderCard(t))}
    </div>`;
  }

  private status(t: Pick<TournamentSummary, "status">): TemplateResult {
    const tone =
      t.status === "open"
        ? "bg-emerald-500/15 text-emerald-300"
        : t.status === "running"
          ? "bg-amber-400/15 text-amber-200"
          : "bg-white/10 text-white/60";
    return html`<span class="rounded-md px-2 py-0.5 text-xs font-bold ${tone}"
      >${translateText(`tournaments.status_${t.status}`)}</span
    >`;
  }

  private renderCard(t: TournamentSummary) {
    return html`<button
      class="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-left transition hover:border-emerald-400/50 focus-visible:outline-2 focus-visible:outline-emerald-400"
      @click=${() => this.show(t.id)}
    >
      <div class="flex items-center gap-2">
        ${this.status(t)}
        <span class="rounded-md bg-white/5 px-2 py-0.5 text-xs text-white/70"
          >${formatLabel(t)}</span
        >
        <span class="ml-auto text-xs text-white/50"
          >${t.entrants}/${t.maxEntrants}</span
        >
      </div>
      <div class="font-display text-lg font-bold text-white">${t.name}</div>
      <div class="text-sm text-white/55">
        ${t.status === "finished" && t.champion
          ? translateText("tournaments.won_by", { name: t.champion })
          : dateTime(t.startsAt)}
      </div>
      ${this.prizes(t, true)}
    </button>`;
  }

  private prizes(
    t: Pick<TournamentSummary, "medals" | "emeralds" | "championBadge">,
    compact = false,
  ) {
    const rows = [0, 1, 2].filter((i) => t.medals[i] || t.emeralds[i]);
    if (rows.length === 0 && !t.championBadge) return nothing;
    return html`<div class="flex flex-wrap gap-2 text-xs">
      ${rows.map(
        (i) =>
          html`<span
            class="inline-flex items-center gap-1 rounded-md bg-black/30 px-2 py-1 text-white/80"
            ><b
              class="${["text-amber-200", "text-slate-200", "text-orange-200"][
                i
              ]}"
              >${i + 1}</b
            >
            ${t.medals[i]
              ? html`<cap-icon .size=${13}></cap-icon>${t.medals[i]}`
              : nothing}
            ${t.emeralds[i]
              ? html`<plutonium-icon .size=${13}></plutonium-icon>${t.emeralds[
                    i
                  ]}`
              : nothing}
          </span>`,
      )}
      ${t.championBadge && !compact
        ? html`<span
            class="rounded-md bg-amber-400/15 px-2 py-1 font-bold text-amber-200"
            >${translateText("tournaments.champion_badge")}</span
          >`
        : nothing}
    </div>`;
  }

  private renderDetail(t: TournamentDetail) {
    const rounds = Math.max(t.round, ...t.matches.map((m) => m.round), 0);
    // Duels halve the field each round; pools end when one pool is left, so
    // only a finished ffa knows its last round.
    const totalRounds =
      t.format !== "ffa"
        ? Math.max(1, Math.ceil(Math.log2(Math.max(2, t.entrants.length))))
        : t.status === "finished"
          ? rounds
          : Number.POSITIVE_INFINITY;
    const names = new Map(t.entrants.map((e) => [e.id, e.name]));
    return html`<div class="flex flex-col gap-4 p-4">
      <div class="flex flex-wrap items-center gap-2">
        ${this.status(t)}
        <span class="rounded-md bg-white/5 px-2 py-0.5 text-xs text-white/70"
          >${formatLabel(t)}</span
        >
        <span class="text-sm text-white/55">${dateTime(t.startsAt)}</span>
        <span class="ml-auto text-sm text-white/55"
          >${translateText("tournaments.entrants", {
            n: t.entrants.length,
            max: t.maxEntrants,
          })}</span
        >
      </div>
      ${t.description
        ? html`<p class="whitespace-pre-line text-sm text-white/75">
            ${t.description}
          </p>`
        : nothing}
      <div class="text-sm text-white/55">
        ${translateText("tournaments.maps")} : ${t.maps.join(", ")}
        ${t.format === "ffa"
          ? html` ·
            ${translateText("tournaments.ffa_rule", {
              n: t.advance,
            })}`
          : nothing}
      </div>
      ${this.prizes(t)} ${this.renderMine(t)}
      ${rounds > 0
        ? html`<section class="flex flex-col gap-2">
            <h3 class="font-bold text-white">
              ${translateText("tournaments.bracket")}
            </h3>
            <div class="flex gap-3 overflow-x-auto pb-2">
              ${Array.from({ length: rounds }, (_, i) => i + 1).map(
                (r) =>
                  html`<div class="flex min-w-[12rem] flex-col gap-2">
                    <div class="text-xs font-bold text-white/50">
                      ${roundName(r, totalRounds)}
                    </div>
                    ${t.matches
                      .filter((m) => m.round === r)
                      .map((m) =>
                        this.renderMatch(m, names, t.mine?.entrantId),
                      )}
                  </div>`,
              )}
            </div>
          </section>`
        : nothing}
      <section class="flex flex-col gap-2">
        <h3 class="font-bold text-white">
          ${translateText("tournaments.entrant_list")}
        </h3>
        ${t.entrants.length === 0
          ? html`<p class="text-sm text-white/45">
              ${translateText("tournaments.no_entrants")}
            </p>`
          : html`<div class="grid gap-1.5 sm:grid-cols-2">
              ${t.entrants.map(
                (e) =>
                  html`<div
                    class="flex items-center gap-2 rounded-lg bg-white/[0.04] px-3 py-2 text-sm ${e.out
                      ? "opacity-50"
                      : ""}"
                  >
                    ${e.place
                      ? html`<b
                          class="${[
                            "text-amber-200",
                            "text-slate-200",
                            "text-orange-200",
                          ][e.place - 1]}"
                          >${e.place}</b
                        >`
                      : nothing}
                    <span class="font-bold text-white">${e.name}</span>
                    ${e.members.length > 1
                      ? html`<span class="truncate text-white/45"
                          >${e.members.map((m) => m.username).join(", ")}</span
                        >`
                      : nothing}
                  </div>`,
              )}
            </div>`}
      </section>
    </div>`;
  }

  private renderMatch(
    m: TournamentMatch,
    names: Map<string, string>,
    mine: string | undefined,
  ) {
    return html`<div
      class="rounded-lg border ${m.entrants.includes(mine ?? "")
        ? "border-emerald-400/50"
        : "border-white/10"} bg-black/25 p-2 text-sm"
    >
      ${m.entrants.map(
        (e) =>
          html`<div
            class="flex items-center gap-2 py-0.5 ${m.status === "done" &&
            !m.winners.includes(e)
              ? "text-white/35 line-through"
              : "text-white"}"
          >
            <span class="truncate">${names.get(e) ?? "?"}</span>
            ${m.winners.includes(e)
              ? html`<span class="ml-auto text-xs font-bold text-emerald-300"
                  >${translateText("tournaments.through")}</span
                >`
              : nothing}
          </div>`,
      )}
      ${m.status === "playing" || m.status === "lobby"
        ? html`<div class="mt-1 text-xs text-amber-200">
            ${translateText(
              m.status === "lobby"
                ? "tournaments.match_lobby"
                : "tournaments.match_playing",
            )}
            ${m.map ? html`· ${m.map}` : nothing}
          </div>`
        : nothing}
    </div>`;
  }

  // The player's own place: enter, leave, or join their match.
  private renderMine(t: TournamentDetail) {
    const match = t.mine?.match;
    if (match?.joinUrl) {
      const left = Math.max(
        0,
        Math.ceil(((match.deadline ?? 0) - this.now) / 60_000),
      );
      return html`<div
        class="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-400/50 bg-emerald-500/10 p-4"
      >
        <div>
          <div class="font-bold text-white">
            ${translateText("tournaments.match_ready")}
          </div>
          ${match.status === "lobby"
            ? html`<div class="text-sm text-white/65">
                ${translateText("tournaments.join_within", { n: left })}
              </div>`
            : nothing}
        </div>
        <a
          class="ml-auto rounded-lg bg-brand px-4 py-2 font-bold text-white hover:brightness-110"
          href=${match.joinUrl}
          >${translateText("tournaments.join")}</a
        >
      </div>`;
    }
    if (t.status !== "open") {
      return t.mine
        ? html`<p class="text-sm text-white/60">
            ${translateText("tournaments.you_are_in")}
          </p>`
        : nothing;
    }
    if (!this.signedIn) {
      return html`<p class="rounded-lg bg-white/5 p-3 text-sm text-white/70">
        ${translateText("tournaments.sign_in")}
      </p>`;
    }
    if (t.mine) {
      return html`<div
        class="flex flex-wrap items-center gap-3 rounded-xl bg-white/5 p-4"
      >
        <span class="font-bold text-emerald-300"
          >${translateText("tournaments.registered")}</span
        >
        <button
          class="ml-auto rounded-lg border border-white/20 px-3 py-1.5 text-sm text-white hover:border-white/50"
          ?disabled=${this.busy}
          @click=${() => this.leave()}
        >
          ${translateText("tournaments.leave")}
        </button>
        ${this.formError
          ? html`<p class="w-full text-sm text-red-300">${this.formError}</p>`
          : nothing}
      </div>`;
    }
    const team = t.teamSize > 1;
    return html`<form
      class="flex flex-col gap-3 rounded-xl bg-white/5 p-4"
      @submit=${(e: Event) => {
        e.preventDefault();
        void this.enter();
      }}
    >
      ${team
        ? html`
            ${t.format === "clans"
              ? html`<label class="flex flex-col gap-1 text-sm text-white/70">
                  ${translateText("tournaments.clan_tag")}
                  <input
                    class="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white uppercase"
                    maxlength="5"
                    required
                    @input=${(e: Event) =>
                      (this.clanTag = (e.target as HTMLInputElement).value)}
                  />
                </label>`
              : html`<label class="flex flex-col gap-1 text-sm text-white/70">
                  ${translateText("tournaments.team_name")}
                  <input
                    class="rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white"
                    maxlength="32"
                    @input=${(e: Event) =>
                      (this.teamName = (e.target as HTMLInputElement).value)}
                  />
                </label>`}
            <div class="flex flex-col gap-1 text-sm text-white/70">
              ${translateText("tournaments.mates", { n: t.teamSize - 1 })}
              ${Array.from(
                { length: t.teamSize - 1 },
                (_, i) =>
                  html`<input
                    class="rounded-md border border-white/15 bg-black/30 px-3 py-2 font-mono text-white"
                    placeholder=${translateText("tournaments.player_code")}
                    required
                    @input=${(e: Event) =>
                      (this.mates[i] = (e.target as HTMLInputElement).value)}
                  />`,
              )}
              <span class="text-xs text-white/45"
                >${translateText("tournaments.player_code_hint")}</span
              >
            </div>
          `
        : nothing}
      <button
        class="self-start rounded-lg bg-brand px-4 py-2 font-bold text-white hover:brightness-110 disabled:opacity-50"
        ?disabled=${this.busy}
      >
        ${translateText(
          t.format === "clans"
            ? "tournaments.enter_clan"
            : team
              ? "tournaments.enter_team"
              : "tournaments.enter",
        )}
      </button>
      ${this.formError
        ? html`<p class="text-sm text-red-300">${this.formError}</p>`
        : nothing}
    </form>`;
  }
}

// A bracket: two pairs meeting, then the final.
export function bracketIcon(cls = "h-5 w-5") {
  return html`<svg
    class=${cls}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M3 4h5v6H3M3 14h5v6H3M8 7h3v10H8M11 12h4" />
    <path d="M15 9h6v6h-6z" />
  </svg>`;
}
