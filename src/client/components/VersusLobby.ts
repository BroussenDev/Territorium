import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import {
  versusExclusionRadius,
  versusGameType,
  versusMap,
  versusSpawnArea,
  VersusTeamSize,
  versusZoneLayout,
} from "../../core/game/Versus";
import { ClientInfo } from "../../core/Schemas";
import { terrainMapFileLoader } from "../TerrainMapFileLoader";
import { getMapName, translateText } from "../Utils";

// Side 0 is the Red team, side 1 the Blue one (the order the game gives the
// two teams).
const SIDE_STYLES = [
  {
    zone: "bg-red-500/35",
    edge: "border-red-400",
    name: "text-red-300",
    button: "bg-red-500 hover:bg-red-400",
  },
  {
    zone: "bg-blue-500/35",
    edge: "border-blue-400",
    name: "text-blue-300",
    button: "bg-blue-500 hover:bg-blue-400",
  },
] as const;

/** A side's team color, and where on the map it starts. */
export function versusSideName(
  teamSize: VersusTeamSize,
  side: 0 | 1,
): { team: string; place: string } {
  const direction = side === 0 ? "west" : "east";
  const place =
    versusZoneLayout(teamSize) === "lower" ? `south_${direction}` : direction;
  return {
    team: translateText(`team_colors.${side === 0 ? "red" : "blue"}`),
    place: translateText(`versus.side_${place}`),
  };
}

/**
 * The format's tournament map with both teams' spawn zones on it, and the
 * no-spawn disc at its centre.
 */
export function versusZoneMap(teamSize: VersusTeamSize): TemplateResult {
  const map = versusMap(teamSize);
  // Zones in percent of the map side.
  const zones = [0, 1].map((side) => versusSpawnArea(map, side, 100, 100)!);
  const hole = versusExclusionRadius(100) * 2;
  return html`<div
    class="relative aspect-square w-full overflow-hidden rounded-full bg-black ring-1 ring-white/15"
  >
    <img
      src=${terrainMapFileLoader.getMapData(map).webpPath}
      alt=""
      draggable="false"
      class="pointer-events-none absolute inset-0 size-full select-none object-cover"
    />
    ${zones.map(
      (zone, side) =>
        html`<span
          class="absolute ${SIDE_STYLES[side].zone}"
          style="left:${zone.x}%;top:${zone.y}%;width:${zone.width}%;height:${zone.height}%"
        ></span>`,
    )}
    <span
      class="absolute rounded-full border border-dashed border-white/70 bg-black/55"
      style="left:${50 - hole / 2}%;top:${50 -
      hole / 2}%;width:${hole}%;height:${hole}%"
    ></span>
  </div>`;
}

/** The fixed rules every lobby of a format plays. */
export function versusRules(teamSize: VersusTeamSize): string[] {
  return [
    translateText("versus.rule_map", {
      map: getMapName(versusMap(teamSize)) ?? "",
    }),
    translateText("versus.rule_zones"),
    ...(versusZoneLayout(teamSize) === "lower"
      ? [translateText("versus.rule_north")]
      : []),
    translateText("versus.rule_no_ai"),
    translateText("versus.rule_fixed"),
    translateText("versus.rule_win"),
  ];
}

/**
 * A versus lobby: both sides with their seats, the map with the spawn zones,
 * and the players still without a side. In a private lobby each player picks
 * a side (`pick-team` with 0, 1, or null to leave it); in a public one the
 * teams are drawn when the game starts.
 */
@customElement("versus-lobby")
export class VersusLobby extends LitElement {
  @property({ attribute: false }) clients: ClientInfo[] = [];
  @property({ type: String }) currentClientID = "";
  @property({ type: String }) hostClientID = "";
  @property({ type: Number }) teamSize: VersusTeamSize = 1;
  @property({ type: Boolean }) canPick = false;
  // Hosts only: removes a player from the lobby.
  @property({ attribute: false }) onKick?: (clientID: string) => void;

  createRenderRoot() {
    return this;
  }

  private get players(): ClientInfo[] {
    return this.clients.filter((c) => !c.spectator);
  }

  private sideOf(client: ClientInfo): 0 | 1 | null {
    if (!this.canPick) return null;
    return client.teamIndex === 0 || client.teamIndex === 1
      ? client.teamIndex
      : null;
  }

  private pick(team: 0 | 1 | null) {
    this.dispatchEvent(
      new CustomEvent("pick-team", {
        detail: { team },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderPlayer(client: ClientInfo) {
    const isMe = client.clientID === this.currentClientID;
    return html`<li
      class="flex h-9 items-center gap-2 rounded-md bg-white/10 px-2.5 text-sm text-white"
    >
      <span class="min-w-0 flex-1 truncate ${isMe ? "font-bold" : ""}"
        >${client.username}</span
      >
      ${client.clientID === this.hostClientID
        ? html`<span class="text-[11px] text-amber-300"
            >${translateText("versus.host")}</span
          >`
        : nothing}
      ${isMe
        ? html`<span class="text-[11px] text-white/60"
            >${translateText("versus.you")}</span
          >`
        : this.onKick
          ? html`<button
              type="button"
              class="grid size-6 place-items-center rounded text-white/50 hover:bg-white/10 hover:text-white"
              title=${translateText("versus.kick")}
              aria-label=${translateText("versus.kick")}
              @click=${() => this.onKick?.(client.clientID)}
            >
              ✕
            </button>`
          : nothing}
    </li>`;
  }

  private renderSide(side: 0 | 1) {
    const style = SIDE_STYLES[side];
    const name = versusSideName(this.teamSize, side);
    const members = this.players.filter((c) => this.sideOf(c) === side);
    const mine =
      this.players.find((c) => c.clientID === this.currentClientID) ?? null;
    const isMine = mine !== null && this.sideOf(mine) === side;
    const full = members.length >= this.teamSize;
    const seats = Array.from(
      { length: this.teamSize },
      (_, i) => members[i] ?? null,
    );
    return html`<div
      class="flex flex-col gap-3 rounded-lg border-t-4 ${style.edge} bg-black/30 p-3"
    >
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-lg font-bold ${style.name}">${name.team}</span>
        <span class="text-xs text-white/60">${name.place}</span>
      </div>
      <ul class="flex flex-col gap-1.5">
        ${seats.map((client) =>
          client
            ? this.renderPlayer(client)
            : html`<li
                class="flex h-9 items-center rounded-md border border-dashed border-white/15 px-2.5 text-xs text-white/40"
              >
                ${this.canPick
                  ? translateText("versus.seat_free")
                  : translateText("versus.seat_draw")}
              </li>`,
        )}
      </ul>
      ${!this.canPick || mine === null
        ? nothing
        : isMine
          ? html`<button
              type="button"
              class="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
              @click=${() => this.pick(null)}
            >
              ${translateText("versus.leave_side")}
            </button>`
          : html`<button
              type="button"
              class="rounded-lg px-3 py-2 text-sm font-bold text-white transition-colors disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 ${full
                ? ""
                : style.button}"
              ?disabled=${full}
              @click=${() => this.pick(side)}
            >
              ${full
                ? translateText("versus.side_full")
                : translateText("versus.join_side")}
            </button>`}
    </div>`;
  }

  render() {
    const unassigned = this.players.filter((c) => this.sideOf(c) === null);
    return html`<section
      class="flex flex-col gap-4 rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="font-display text-2xl font-bold tracking-wide text-white">
          ${translateText("versus.format_title", {
            format: versusGameType(this.teamSize),
          })}
        </h3>
        <p class="text-sm text-white/70">
          ${this.canPick
            ? translateText("versus.pick_hint")
            : translateText("versus.draw_hint")}
        </p>
      </div>
      <div
        class="grid items-start gap-4 sm:grid-cols-[1fr_minmax(8rem,11rem)_1fr]"
      >
        ${this.renderSide(0)}
        <div class="flex flex-col items-center gap-3">
          <div class="w-32 sm:w-full">${versusZoneMap(this.teamSize)}</div>
          <div class="w-full">
            <p class="mb-1.5 text-center text-xs text-white/60">
              ${this.canPick
                ? translateText("versus.no_side", {
                    count: unassigned.length,
                  })
                : translateText("versus.in_lobby", {
                    count: unassigned.length,
                    max: this.teamSize * 2,
                  })}
            </p>
            <ul class="flex flex-col gap-1.5">
              ${unassigned.map((c) => this.renderPlayer(c))}
            </ul>
          </div>
        </div>
        ${this.renderSide(1)}
      </div>
      <ul class="grid gap-x-5 gap-y-1.5 text-sm text-white/80 sm:grid-cols-2">
        ${versusRules(this.teamSize).map(
          (rule) =>
            html`<li class="flex items-start gap-2">
              <span
                class="mt-1.5 size-1.5 shrink-0 rotate-45 bg-white/60"
                aria-hidden="true"
              ></span>
              ${rule}
            </li>`,
        )}
      </ul>
    </section>`;
  }
}
