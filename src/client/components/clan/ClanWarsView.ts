import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  answerClanWar,
  challengeClan,
  type ClanWar,
  type ClanWarsResponse,
  fetchClanWars,
} from "../../ClanApi";
import { translateText } from "../../Utils";
import "./ClanCrestBadge";
import {
  type ClanRole,
  formatClanDate,
  renderLoadingSpinner,
  renderStat,
  showToast,
} from "./ClanShared";

const OPEN_STATUSES = new Set(["pending", "accepted"]);

/**
 * The clan's Wars tab: the season's war record, a challenge form for
 * officers, how a war is played, then open wars (answered here by the clan's
 * officers) and past ones. Wars are settled by the API when a private team
 * game between the two clans ends.
 */
@customElement("clan-wars-view")
export class ClanWarsView extends LitElement {
  createRenderRoot() {
    return this;
  }

  @property() clanTag = "";
  @property({ attribute: false }) myClanRoles = new Map<string, ClanRole>();

  @state() private data: ClanWarsResponse | null = null;
  @state() private loading = false;
  @state() private failed = false;
  @state() private busy = false;
  @state() private opponent = "";
  @state() private challenger = "";
  private asyncGeneration = 0;

  connectedCallback() {
    super.connectedCallback();
    if (this.clanTag) void this.load();
  }

  private async load() {
    const gen = ++this.asyncGeneration;
    this.loading = this.data === null;
    this.failed = false;
    const res = await fetchClanWars(this.clanTag);
    if (gen !== this.asyncGeneration) return;
    this.loading = false;
    if (res === false) {
      this.failed = true;
      return;
    }
    this.data = res;
  }

  private isOfficerOf(tag: string): boolean {
    const role = this.myClanRoles.get(tag);
    return role === "leader" || role === "officer";
  }

  // Clans the player may challenge from: the viewed clan if they lead it,
  // otherwise every clan they lead.
  private challengerTags(): string[] {
    if (this.isOfficerOf(this.clanTag)) return [this.clanTag];
    return [...this.myClanRoles.keys()].filter((t) => this.isOfficerOf(t));
  }

  private async challenge(from: string, to: string) {
    const opponent = to.trim().toUpperCase();
    if (!opponent || this.busy) return;
    this.busy = true;
    const res = await challengeClan(from, opponent);
    this.busy = false;
    if ("error" in res) {
      showToast(translateText(res.error), "red");
      return;
    }
    showToast(
      translateText("clan_modal.war_challenge_sent", { tag: opponent }),
      "green",
    );
    this.opponent = "";
    void this.load();
  }

  private async answer(war: ClanWar, action: "accept" | "decline" | "cancel") {
    if (this.busy) return;
    this.busy = true;
    const res = await answerClanWar(this.clanTag, war.id, action);
    this.busy = false;
    if ("error" in res) {
      showToast(translateText(res.error), "red");
    }
    void this.load();
  }

  private selectClan(tag: string) {
    this.dispatchEvent(
      new CustomEvent("clan-select", {
        detail: { tag },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    if (this.loading) return renderLoadingSpinner();
    if (this.failed || !this.data) {
      return html`
        <div
          class="bg-white/5 rounded-xl border border-white/10 p-8 text-center"
        >
          <p class="text-white/40 text-sm mb-3">
            ${translateText("clan_modal.wars_unavailable")}
          </p>
          <button
            type="button"
            @click=${() => this.load()}
            class="text-xs font-bold text-white/60 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/5 transition-colors"
          >
            ${translateText("leaderboard_modal.try_again")}
          </button>
        </div>
      `;
    }
    const { season, wins, losses, wars } = this.data;
    const open = wars.filter((w) => OPEN_STATUSES.has(w.status));
    const past = wars.filter((w) => !OPEN_STATUSES.has(w.status));
    return html`
      <div class="space-y-4">
        <div>
          <h3 class="text-xs font-bold text-white/40 mb-2">
            ${translateText("clan_modal.wars_season", {
              season: season.number,
            })}
          </h3>
          <div class="grid grid-cols-2 gap-3">
            ${renderStat(translateText("clan_modal.wars_won"), String(wins))}
            ${renderStat(translateText("clan_modal.wars_lost"), String(losses))}
          </div>
        </div>
        ${this.renderChallenge()} ${this.renderHowTo()}
        ${this.renderList(translateText("clan_modal.wars_open"), open)}
        ${this.renderList(translateText("clan_modal.wars_history"), past)}
        ${wars.length === 0
          ? html`<div
              class="bg-white/5 rounded-xl border border-white/10 p-6 text-center text-white/40 text-sm"
            >
              ${translateText("clan_modal.wars_empty")}
            </div>`
          : ""}
      </div>
    `;
  }

  private renderChallenge(): TemplateResult | string {
    const from = this.challengerTags();
    if (from.length === 0) return "";
    const own = from[0] === this.clanTag;
    const challenger = from.includes(this.challenger)
      ? this.challenger
      : from[0];
    const button =
      "px-4 py-2 rounded-lg text-sm font-bold bg-red-600/80 hover:bg-red-600 text-white border border-red-400/30 transition-colors disabled:opacity-50";
    return html`
      <div
        class="bg-red-500/5 rounded-xl border border-red-500/20 p-4 space-y-3"
      >
        <div>
          <h3 class="text-white font-bold text-sm">
            ${translateText("clan_modal.war_challenge_title")}
          </h3>
          <p class="text-white/50 text-xs mt-1">
            ${translateText("clan_modal.war_challenge_desc")}
          </p>
        </div>
        ${own
          ? html`<form
              class="flex gap-2"
              @submit=${(e: Event) => {
                e.preventDefault();
                void this.challenge(this.clanTag, this.opponent);
              }}
            >
              <input
                type="text"
                maxlength="5"
                .value=${this.opponent}
                @input=${(e: Event) =>
                  (this.opponent = (e.target as HTMLInputElement).value)}
                placeholder=${translateText("clan_modal.war_opponent_tag")}
                aria-label=${translateText("clan_modal.war_opponent_tag")}
                class="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm placeholder:normal-case placeholder:text-white/30 focus:outline-none focus:border-red-400/60"
              />
              <button
                type="submit"
                class=${button}
                ?disabled=${this.busy || this.opponent.trim().length < 2}
              >
                ${translateText("clan_modal.war_challenge_button")}
              </button>
            </form>`
          : html`<div class="flex flex-wrap items-center gap-2">
              ${from.length > 1
                ? html`<label class="text-white/50 text-xs"
                    >${translateText("clan_modal.war_challenge_as")}
                    <select
                      class="ml-1 px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-white text-sm"
                      @change=${(e: Event) =>
                        (this.challenger = (
                          e.target as HTMLSelectElement
                        ).value)}
                    >
                      ${from.map(
                        (t) =>
                          html`<option value=${t} ?selected=${t === challenger}>
                            [${t}]
                          </option>`,
                      )}
                    </select></label
                  >`
                : ""}
              <button
                type="button"
                class=${button}
                ?disabled=${this.busy}
                @click=${() => this.challenge(challenger, this.clanTag)}
              >
                ${translateText("clan_modal.war_challenge_this", {
                  tag: this.clanTag,
                })}
              </button>
            </div>`}
      </div>
    `;
  }

  private renderHowTo(): TemplateResult {
    return html`
      <div class="bg-white/5 rounded-xl border border-white/10 p-4">
        <h3 class="text-white font-bold text-sm mb-2">
          ${translateText("clan_modal.war_how_title")}
        </h3>
        <ol class="list-decimal list-inside space-y-1 text-white/60 text-xs">
          <li>${translateText("clan_modal.war_how_1")}</li>
          <li>${translateText("clan_modal.war_how_2")}</li>
          <li>${translateText("clan_modal.war_how_3")}</li>
        </ol>
        <p class="text-white/40 text-[11px] mt-2">
          ${translateText("clan_modal.war_how_note")}
        </p>
      </div>
    `;
  }

  private renderList(title: string, wars: ClanWar[]): TemplateResult | string {
    if (wars.length === 0) return "";
    return html`
      <div>
        <h3 class="text-xs font-bold text-white/40 mb-2">${title}</h3>
        <div class="space-y-2">${wars.map((w) => this.renderWar(w))}</div>
      </div>
    `;
  }

  private renderWar(war: ClanWar): TemplateResult {
    const them =
      war.challenger.tag === this.clanTag ? war.defender : war.challenger;
    const challenged = war.defender.tag === this.clanTag;
    return html`
      <div
        data-war-id=${war.id}
        class="flex flex-wrap items-center gap-3 py-2.5 px-3 rounded-xl border bg-white/5 border-white/10"
      >
        <button
          type="button"
          class="flex items-center gap-2 min-w-0 flex-1 text-left group"
          @click=${() => this.selectClan(them.tag)}
        >
          <clan-crest
            .crest=${them.crest}
            .tag=${them.tag}
            .size=${28}
          ></clan-crest>
          <span class="min-w-0">
            <span
              class="block text-sm font-bold text-white truncate group-hover:underline"
              >${them.name}
              <span class="text-white/40 text-xs">[${them.tag}]</span></span
            >
            <span class="block text-white/40 text-[11px]"
              >${translateText(
                challenged
                  ? "clan_modal.war_challenged_by"
                  : "clan_modal.war_challenged",
              )}
              <span class="ml-1">${formatClanDate(war.createdAt)}</span></span
            >
          </span>
        </button>
        ${this.renderOutcome(war)} ${this.renderActions(war, challenged)}
      </div>
    `;
  }

  private renderOutcome(war: ClanWar): TemplateResult {
    const chip = (text: string, colors: string) =>
      html`<span
        class="text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors}"
        >${text}</span
      >`;
    if (war.status === "done") {
      return war.winner === this.clanTag
        ? chip(
            translateText("clan_modal.war_won"),
            "bg-green-500/20 text-green-400 border-green-500/30",
          )
        : chip(
            translateText("clan_modal.war_lost"),
            "bg-red-500/20 text-red-400 border-red-500/30",
          );
    }
    const open = OPEN_STATUSES.has(war.status);
    return html`<span class="flex flex-col items-end gap-0.5">
      ${chip(
        translateText(`clan_modal.war_status_${war.status}`),
        war.status === "accepted"
          ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
          : "bg-white/10 text-white/50 border-white/10",
      )}
      ${open && war.expiresAt
        ? html`<span class="text-white/30 text-[10px]"
            >${translateText("clan_modal.war_expires", {
              date: formatClanDate(war.expiresAt),
            })}</span
          >`
        : ""}
    </span>`;
  }

  private renderActions(
    war: ClanWar,
    challenged: boolean,
  ): TemplateResult | string {
    if (!this.isOfficerOf(this.clanTag)) return "";
    const small =
      "px-3 py-1 rounded-lg text-xs font-bold border transition-colors disabled:opacity-50";
    const buttons: TemplateResult[] = [];
    if (war.status === "pending" && challenged) {
      buttons.push(
        html`<button
          type="button"
          class="${small} bg-green-600/80 hover:bg-green-600 text-white border-green-400/30"
          ?disabled=${this.busy}
          @click=${() => this.answer(war, "accept")}
        >
          ${translateText("clan_modal.war_accept")}
        </button>`,
        html`<button
          type="button"
          class="${small} bg-white/5 hover:bg-white/10 text-white/70 border-white/10"
          ?disabled=${this.busy}
          @click=${() => this.answer(war, "decline")}
        >
          ${translateText("clan_modal.war_decline")}
        </button>`,
      );
    } else if (war.status === "accepted" || war.status === "pending") {
      buttons.push(
        html`<button
          type="button"
          class="${small} bg-white/5 hover:bg-white/10 text-white/70 border-white/10"
          ?disabled=${this.busy}
          @click=${() => this.answer(war, "cancel")}
        >
          ${translateText("clan_modal.war_cancel")}
        </button>`,
      );
    }
    return buttons.length
      ? html`<div class="flex gap-2 w-full sm:w-auto justify-end">
          ${buttons}
        </div>`
      : "";
  }
}
