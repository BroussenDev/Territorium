import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import { GameMapType } from "../../core/game/Game";
import { VERSUS_TEAM_SIZES, versusGameType } from "../../core/game/Versus";
import type { PublicGameInfo, PublicGames } from "../../core/Schemas";
import { type ModeKey, modeWaiting } from "../GameModes";
import { STEAM_LAUNCH_LOCKED } from "../SteamLaunch";
import { terrainMapFileLoader } from "../TerrainMapFileLoader";
import {
  getMapName,
  getSecondsUntilServerTimestamp,
  renderDuration,
  translateText,
} from "../Utils";
import { lockIcon } from "./SteamLaunchDialog";
import { versusZoneMap } from "./VersusLobby";

// The game modes with rules of their own, as cards: in full on the Modes
// page, each with a pin for the home page, and compact on the home page for
// the player's two favourites. The cards hold no lobby logic: they say which
// lobby the player picked ("mode-join"), or that Versus should open
// ("mode-versus"), and the home page's selector joins it.

const DISABLED = "opacity-50 cursor-not-allowed pointer-events-none";

/** Countdown shown on a lobby card, or "starting" once it runs out. */
export function lobbyTime(
  lobby: PublicGameInfo,
  serverTimeOffset: number,
  defaultLobbyTime: number,
): { text: string; uppercase: boolean } {
  const timeRemaining = lobby.startsAt
    ? getSecondsUntilServerTimestamp(lobby.startsAt, serverTimeOffset)
    : undefined;
  if (timeRemaining === undefined) {
    return { text: renderDuration(defaultLobbyTime), uppercase: false };
  }
  if (timeRemaining > 0) {
    return { text: renderDuration(timeRemaining), uppercase: false };
  }
  return {
    text: translateText("public_lobby.starting_game"),
    uppercase: true,
  };
}

export interface ModeJoinDetail {
  mode: ModeKey;
  lobby: PublicGameInfo;
}

@customElement("game-mode-cards")
export class GameModeCards extends LitElement {
  @property({ attribute: false }) lobbies: PublicGames | null = null;
  @property({ attribute: false }) modes: readonly ModeKey[] = [];
  @property() variant: "full" | "compact" = "full";
  /** Modes pinned to the home page (the full cards' pins). */
  @property({ attribute: false }) pinned: readonly ModeKey[] = [];
  @property({ type: Boolean }) inputValid = true;
  /** The desktop app refuses joining right now: dimmed, still clickable. */
  @property({ type: Boolean }) blocked = false;
  @property({ type: Number }) serverTimeOffset = 0;
  @property({ type: Number }) defaultLobbyTime = 0;

  createRenderRoot() {
    return this;
  }

  private time(lobby: PublicGameInfo) {
    return lobbyTime(lobby, this.serverTimeOffset, this.defaultLobbyTime);
  }

  private join(mode: ModeKey, lobby: PublicGameInfo) {
    this.dispatchEvent(
      new CustomEvent<ModeJoinDetail>("mode-join", {
        detail: { mode, lobby },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private openVersus() {
    this.dispatchEvent(
      new CustomEvent("mode-versus", { bubbles: true, composed: true }),
    );
  }

  private togglePin(mode: ModeKey) {
    this.dispatchEvent(
      new CustomEvent<ModeKey>("mode-pin", {
        detail: mode,
        bubbles: true,
        composed: true,
      }),
    );
  }

  render() {
    return this.variant === "compact"
      ? html`${this.modes.map((m) => this.renderCompact(m))}`
      : html`${this.modes.map((m) => this.renderFull(m))}`;
  }

  // ---- Full cards (the Modes page) ----------------------------------------

  private renderFull(mode: ModeKey) {
    const card = {
      nations: () => this.renderNationsCard(),
      versus: () => this.renderVersusCard(),
      conquest: () => this.renderConquestCard(),
      survival: () => this.renderSurvivalCard(),
    }[mode]();
    // Nations shares its row with Versus; Conquest and Survival take theirs.
    const span =
      mode === "nations"
        ? "sm:col-span-2"
        : mode === "versus"
          ? ""
          : "sm:col-span-3";
    const pinned = this.pinned.includes(mode);
    return html`<div
      class="relative grid min-w-0 [&>button:first-child]:w-full ${span}"
      data-mode=${mode}
    >
      ${card}
      <button
        type="button"
        class="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full border backdrop-blur transition-colors ${pinned
          ? "border-amber-300/70 bg-amber-300/20 text-amber-200"
          : "border-white/20 bg-black/45 text-white/60 hover:text-white"}"
        aria-pressed=${pinned}
        aria-label=${translateText(
          pinned ? "game_modes.unpin" : "game_modes.pin",
        )}
        title=${translateText(pinned ? "game_modes.unpin" : "game_modes.pin")}
        @click=${() => this.togglePin(mode)}
      >
        ${pinIcon(pinned)}
      </button>
    </div>`;
  }

  /** Nations: the wide card, the giant world map showing through. */
  private renderNationsCard() {
    const nations = this.lobbies?.games?.["nations"]?.[0];
    const blocked = this.blocked;
    const unavailable = !this.inputValid || nations === undefined;
    const facts = [
      translateText("game_modes.nations_fact_country"),
      translateText("game_modes.nations_fact_capital"),
      translateText("game_modes.nations_fact_alliance"),
      translateText("game_modes.nations_fact_vassal"),
      translateText("game_modes.nations_fact_ai"),
      translateText("game_modes.nations_fact_win"),
    ];
    const time = nations ? this.time(nations) : undefined;
    return html`<button
      @click=${() => nations && this.join("nations", nations)}
      ?disabled=${unavailable}
      aria-disabled=${blocked}
      class="group/mode relative flex min-h-56 overflow-hidden rounded-2xl border border-amber-300/25 bg-[#1a1408] text-left text-white transition-[border-color,box-shadow] duration-200 hover:border-amber-300/60 hover:shadow-[0_18px_40px_-20px_rgba(251,191,36,0.6)] focus-visible:outline-2 focus-visible:outline-amber-300 ${unavailable
        ? DISABLED
        : blocked
          ? "opacity-50 cursor-not-allowed"
          : ""}"
    >
      <img
        src=${terrainMapFileLoader.getMapData(GameMapType.GiantWorldMap)
          .webpPath}
        alt=""
        draggable="false"
        class="pointer-events-none absolute inset-0 size-full select-none object-cover opacity-45 saturate-[0.7] transition-transform duration-500 group-hover/mode:scale-[1.03]"
      />
      <span
        class="absolute inset-0 bg-[linear-gradient(100deg,#1a1408_30%,rgba(26,20,8,0.75)_60%,rgba(26,20,8,0.2))]"
      ></span>
      <span class="relative flex flex-1 flex-col gap-3 p-5">
        <span class="flex items-center gap-3">
          <span
            class="font-display text-3xl font-bold tracking-[0.08em] text-amber-200"
            >${translateText("game_modes.nations_title")}</span
          >
          ${time
            ? html`<span
                class="rounded-sm bg-black/50 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white/90 ${time.uppercase
                  ? "uppercase"
                  : ""}"
                >${time.text}</span
              >`
            : nothing}
        </span>
        <span class="max-w-xl text-sm leading-relaxed text-white/85">
          ${translateText("game_modes.nations_description")}
        </span>
        <span class="grid max-w-xl gap-x-5 gap-y-1.5 text-sm sm:grid-cols-2">
          ${facts.map(
            (fact) =>
              html`<span class="flex items-start gap-2 text-white/80">
                <span
                  class="mt-1.5 size-1.5 shrink-0 rotate-45 bg-amber-300"
                  aria-hidden="true"
                ></span>
                ${fact}
              </span>`,
          )}
        </span>
        <span class="mt-auto flex items-center gap-3 pt-1">
          <span
            class="rounded-md bg-capital px-4 py-2 font-display text-sm font-bold text-capital-ink transition-colors group-hover/mode:bg-capital-light"
            >${nations
              ? translateText("game_modes.nations_join")
              : translateText("game_modes.nations_waiting")}</span
          >
          ${nations
            ? html`<span class="text-sm tabular-nums text-white/70"
                >${translateText("game_modes.players", {
                  count: nations.numClients,
                  max: nations.gameConfig?.maxPlayers ?? "?",
                })}</span
              >`
            : nothing}
        </span>
      </span>
    </button>`;
  }

  /**
   * Conquest: a full-width card under Nations and Versus. The five objective
   * tiles on the left echo the rule, the lobby's map shows through on the right.
   */
  private renderConquestCard() {
    const MODE = "conquest";
    const lobby = this.lobbies?.games?.["conquest"]?.[0];
    const blocked = this.blocked;
    const unavailable = !this.inputValid || lobby === undefined;
    const time = lobby ? this.time(lobby) : undefined;
    const map = lobby?.gameConfig?.gameMap;
    const facts = [
      translateText("game_modes.conquest_fact_objectives"),
      translateText("game_modes.conquest_fact_hold"),
      translateText("game_modes.conquest_fact_maps"),
    ];
    return html`<button
      data-conquest-card
      @click=${() => lobby && this.join(MODE, lobby)}
      ?disabled=${unavailable}
      aria-disabled=${blocked}
      class="group/mode relative flex min-h-48 overflow-hidden rounded-2xl border border-emerald-400/25 bg-[#07130f] text-left text-white transition-[border-color,box-shadow] duration-200 hover:border-emerald-300/60 hover:shadow-[0_18px_40px_-20px_rgba(16,185,129,0.6)] focus-visible:outline-2 focus-visible:outline-emerald-300 ${unavailable
        ? DISABLED
        : blocked
          ? "opacity-50 cursor-not-allowed"
          : ""}"
    >
      ${map
        ? html`<img
            src=${terrainMapFileLoader.getMapData(map).webpPath}
            alt=""
            draggable="false"
            class="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 select-none object-cover opacity-50 saturate-[0.8] [mask-image:linear-gradient(to_left,#000_40%,transparent)] transition-transform duration-500 group-hover/mode:scale-[1.03]"
          />`
        : nothing}
      <span
        class="relative flex flex-1 flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-8"
      >
        <!-- Five objectives: three already held, the majority that wins. -->
        <span
          class="grid shrink-0 grid-cols-5 gap-1.5 self-start sm:self-center"
          aria-hidden="true"
        >
          ${[0, 1, 2, 3, 4].map(
            (i) =>
              html`<span
                class="size-5 rounded-[3px] border-2 ${i < 3
                  ? "border-brand-bright bg-brand-bright shadow-[0_0_12px_rgba(52,211,153,0.6)]"
                  : "border-white/35"}"
              ></span>`,
          )}
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-2.5">
          <span class="flex flex-wrap items-center gap-3">
            <span
              class="font-display text-3xl font-bold tracking-[0.08em] text-emerald-200"
              >${translateText("game_modes.conquest_title")}</span
            >
            ${time
              ? html`<span
                  class="rounded-sm bg-black/50 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white/90 ${time.uppercase
                    ? "uppercase"
                    : ""}"
                  >${time.text}</span
                >`
              : nothing}
            ${map
              ? html`<span class="text-sm font-semibold text-white/70"
                  >${getMapName(map) ?? map}</span
                >`
              : nothing}
          </span>
          <span class="max-w-2xl text-sm leading-relaxed text-white/85">
            ${translateText("game_modes.conquest_description")}
          </span>
          <span class="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            ${facts.map(
              (fact) =>
                html`<span class="flex items-start gap-2 text-white/80">
                  <span
                    class="mt-1.5 size-1.5 shrink-0 rounded-[1px] bg-brand-bright"
                    aria-hidden="true"
                  ></span>
                  ${fact}
                </span>`,
            )}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-3">
          <span
            class="rounded-md bg-brand px-4 py-2 font-display text-sm font-bold text-white transition-colors group-hover/mode:bg-brand-light"
            >${lobby
              ? translateText("game_modes.conquest_join")
              : translateText("game_modes.conquest_waiting")}</span
          >
          ${lobby
            ? html`<span class="text-sm tabular-nums text-white/70"
                >${translateText("game_modes.players", {
                  count: lobby.numClients,
                  max: lobby.gameConfig?.maxPlayers ?? "?",
                })}</span
              >`
            : nothing}
        </span>
      </span>
    </button>`;
  }

  /**
   * Survival: a full-width card under Conquest. Ten bars rising to the right
   * are the ten waves, each bigger than the last.
   */
  private renderSurvivalCard() {
    const MODE = "survival";
    const lobby = this.lobbies?.games?.["survival"]?.[0];
    const blocked = this.blocked;
    const unavailable = !this.inputValid || lobby === undefined;
    const time = lobby ? this.time(lobby) : undefined;
    const map = lobby?.gameConfig?.gameMap;
    const facts = [
      translateText("game_modes.survival_fact_waves"),
      translateText("game_modes.survival_fact_fair"),
      translateText("game_modes.survival_fact_win"),
    ];
    return html`<button
      data-survival-card
      @click=${() => lobby && this.join(MODE, lobby)}
      ?disabled=${unavailable}
      aria-disabled=${blocked}
      class="group/mode relative flex min-h-48 overflow-hidden rounded-2xl border border-red-400/25 bg-[linear-gradient(90deg,#1a0a0a,#120d07)] text-left text-white transition-[border-color,box-shadow] duration-200 hover:border-red-300/60 hover:shadow-[0_18px_40px_-20px_rgba(248,113,113,0.55)] focus-visible:outline-2 focus-visible:outline-red-300 ${unavailable
        ? DISABLED
        : blocked
          ? "opacity-50 cursor-not-allowed"
          : ""}"
    >
      ${map
        ? html`<img
            src=${terrainMapFileLoader.getMapData(map).webpPath}
            alt=""
            draggable="false"
            class="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 select-none object-cover opacity-40 saturate-[0.6] [mask-image:linear-gradient(to_left,#000_40%,transparent)] transition-transform duration-500 group-hover/mode:scale-[1.03]"
          />`
        : nothing}
      <span
        class="relative flex flex-1 flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-8"
      >
        <!-- Ten waves, each taller than the last. -->
        <span
          class="flex h-12 shrink-0 items-end gap-1 self-start sm:self-center"
          aria-hidden="true"
        >
          ${Array.from({ length: 10 }, (_, i) => i).map(
            (i) =>
              html`<span
                class="w-1.5 rounded-[1px] ${i < 3
                  ? "bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.6)]"
                  : "bg-white/25"}"
                style="height: ${20 + i * 8}%"
              ></span>`,
          )}
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-2.5">
          <span class="flex flex-wrap items-center gap-3">
            <span
              class="font-display text-3xl font-bold tracking-[0.08em] text-red-200"
              >${translateText("game_modes.survival_title")}</span
            >
            ${time
              ? html`<span
                  class="rounded-sm bg-black/50 px-2.5 py-0.5 text-xs font-bold tabular-nums text-white/90 ${time.uppercase
                    ? "uppercase"
                    : ""}"
                  >${time.text}</span
                >`
              : nothing}
            ${map
              ? html`<span class="text-sm font-semibold text-white/70"
                  >${getMapName(map) ?? map}</span
                >`
              : nothing}
          </span>
          <span class="max-w-2xl text-sm leading-relaxed text-white/85">
            ${translateText("game_modes.survival_description")}
          </span>
          <span class="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
            ${facts.map(
              (fact) =>
                html`<span class="flex items-start gap-2 text-white/80">
                  <span
                    class="mt-1.5 size-1.5 shrink-0 rounded-[1px] bg-red-400"
                    aria-hidden="true"
                  ></span>
                  ${fact}
                </span>`,
            )}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-3">
          <span
            class="rounded-md bg-red-500/90 px-4 py-2 font-display text-sm font-bold text-white transition-colors group-hover/mode:bg-red-500"
            >${lobby
              ? translateText("game_modes.survival_join")
              : translateText("game_modes.conquest_waiting")}</span
          >
          ${lobby
            ? html`<span class="text-sm tabular-nums text-white/70"
                >${translateText("game_modes.players", {
                  count: lobby.numClients,
                  max: lobby.gameConfig?.maxPlayers ?? "?",
                })}</span
              >`
            : nothing}
        </span>
      </span>
    </button>`;
  }

  private renderVersusCard() {
    const waiting = VERSUS_TEAM_SIZES.map(
      (size) =>
        this.lobbies?.games?.[versusGameType(size)]?.[0]?.numClients ?? 0,
    );
    const total = waiting.reduce((a, b) => a + b, 0);
    return html`<button
      @click=${() => this.openVersus()}
      ?disabled=${!this.inputValid}
      class="group/mode relative flex min-h-56 overflow-hidden rounded-2xl border border-white/15 bg-[linear-gradient(90deg,#2a0d10,#0d1830)] text-left text-white transition-[border-color,box-shadow] duration-200 hover:border-white/45 hover:shadow-[0_18px_40px_-20px_rgba(147,197,253,0.6)] focus-visible:outline-2 focus-visible:outline-white ${this
        .inputValid
        ? ""
        : DISABLED}"
    >
      <span
        class="pointer-events-none absolute -right-10 -top-10 w-44 opacity-60 transition-transform duration-500 group-hover/mode:scale-[1.04]"
        >${versusZoneMap(1)}</span
      >
      <span class="relative flex flex-1 flex-col gap-3 p-5">
        <span
          class="font-display text-3xl font-bold tracking-[0.08em] text-white"
          >${translateText("game_modes.versus_title")}</span
        >
        <span class="max-w-[14rem] text-sm leading-relaxed text-white/85">
          ${translateText("game_modes.versus_description")}
        </span>
        <span class="flex flex-wrap gap-1.5">
          ${VERSUS_TEAM_SIZES.map(
            (size, i) =>
              html`<span
                class="rounded-md bg-black/45 px-2 py-0.5 text-sm font-bold tabular-nums ${waiting[
                  i
                ] > 0
                  ? "text-emerald-300"
                  : "text-white/85"}"
                >${versusGameType(size)}</span
              >`,
          )}
        </span>
        <span class="mt-auto flex flex-wrap items-center gap-3 pt-1">
          ${STEAM_LAUNCH_LOCKED
            ? html`<span
                data-steam-locked
                class="flex items-center gap-2 rounded-md bg-capital px-4 py-2 font-display text-sm font-bold text-capital-ink transition-colors group-hover/mode:bg-capital-light"
                >${lockIcon("size-4")}${translateText(
                  "steam_launch.coming",
                )}</span
              >`
            : html`<span
                class="rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#0d1830] transition-colors group-hover/mode:bg-blue-100"
                >${translateText("game_modes.versus_open")}</span
              >`}
          ${!STEAM_LAUNCH_LOCKED && total > 0
            ? html`<span class="text-sm tabular-nums text-white/70"
                >${translateText("game_modes.versus_waiting", {
                  count: total,
                })}</span
              >`
            : nothing}
        </span>
      </span>
    </button>`;
  }

  // ---- Compact cards (the home page) --------------------------------------

  private renderCompact(mode: ModeKey) {
    const theme = THEMES[mode];
    const lobby =
      mode === "versus" ? undefined : this.lobbies?.games?.[mode]?.[0];
    const versusLocked = mode === "versus" && STEAM_LAUNCH_LOCKED;
    const unavailable =
      !this.inputValid || (mode !== "versus" && lobby === undefined);
    const time = lobby ? this.time(lobby) : undefined;
    const waiting = modeWaiting(this.lobbies, mode);
    const map =
      mode === "nations"
        ? GameMapType.GiantWorldMap
        : (lobby?.gameConfig?.gameMap as GameMapType | undefined);
    const action =
      mode === "versus"
        ? versusLocked
          ? translateText("steam_launch.coming")
          : translateText("game_modes.versus_open")
        : lobby
          ? translateText(theme.join)
          : translateText(theme.waiting);
    return html`<button
      data-mode-compact=${mode}
      @click=${() =>
        mode === "versus" ? this.openVersus() : lobby && this.join(mode, lobby)}
      ?disabled=${unavailable}
      aria-disabled=${this.blocked && mode !== "versus"}
      class="group/mode relative flex h-full min-h-36 min-w-0 flex-col gap-2 overflow-hidden rounded-xl border p-4 text-left text-white transition-[border-color,box-shadow] duration-200 focus-visible:outline-2 ${theme.card} ${unavailable
        ? DISABLED
        : this.blocked && mode !== "versus"
          ? "opacity-50 cursor-not-allowed"
          : ""}"
    >
      ${mode === "versus"
        ? html`<span
            class="pointer-events-none absolute -right-8 -top-8 w-32 opacity-50 transition-transform duration-500 group-hover/mode:scale-[1.04]"
            >${versusZoneMap(1)}</span
          >`
        : map
          ? html`<img
              src=${terrainMapFileLoader.getMapData(map).webpPath}
              alt=""
              draggable="false"
              class="pointer-events-none absolute inset-y-0 right-0 h-full w-3/5 select-none object-cover opacity-35 saturate-[0.7] [mask-image:linear-gradient(to_left,#000_35%,transparent)] transition-transform duration-500 group-hover/mode:scale-[1.04]"
            />`
          : nothing}
      <span class="relative flex flex-wrap items-center gap-2">
        <span
          class="font-display text-2xl font-bold tracking-[0.06em] ${theme.title}"
          >${translateText(theme.name)}</span
        >
        ${time
          ? html`<span
              class="rounded-sm bg-black/50 px-2 py-0.5 text-xs font-bold tabular-nums text-white/90 ${time.uppercase
                ? "uppercase"
                : ""}"
              >${time.text}</span
            >`
          : nothing}
      </span>
      <span
        class="relative line-clamp-2 max-w-sm text-sm leading-snug text-white/75"
        >${translateText(theme.description)}</span
      >
      <span class="relative mt-auto flex flex-wrap items-center gap-3 pt-1">
        <span
          class="flex items-center gap-1.5 rounded-md px-3 py-1.5 font-display text-sm font-bold transition-[filter] group-hover/mode:brightness-110 ${theme.button}"
          >${versusLocked ? lockIcon("size-3.5") : nothing}${action}</span
        >
        ${!versusLocked && (lobby || waiting > 0)
          ? html`<span class="text-sm tabular-nums text-white/65"
              >${lobby
                ? translateText("game_modes.players", {
                    count: lobby.numClients,
                    max: lobby.gameConfig?.maxPlayers ?? "?",
                  })
                : translateText("game_modes.versus_waiting", {
                    count: waiting,
                  })}</span
            >`
          : nothing}
      </span>
    </button>`;
  }
}

/** What sets each mode's compact card apart. */
const THEMES: Record<
  ModeKey,
  {
    name: string;
    description: string;
    join: string;
    waiting: string;
    card: string;
    title: string;
    button: string;
  }
> = {
  nations: {
    name: "game_modes.nations_title",
    description: "game_modes.nations_description",
    join: "game_modes.nations_join",
    waiting: "game_modes.nations_waiting",
    card: "border-amber-300/25 bg-[#1a1408] hover:border-amber-300/60 hover:shadow-[0_18px_40px_-20px_rgba(251,191,36,0.6)] focus-visible:outline-amber-300",
    title: "text-amber-200",
    button: "bg-capital text-capital-ink",
  },
  versus: {
    name: "game_modes.versus_title",
    description: "game_modes.versus_description",
    join: "game_modes.versus_open",
    waiting: "game_modes.versus_open",
    card: "border-white/15 bg-[linear-gradient(90deg,#2a0d10,#0d1830)] hover:border-white/45 hover:shadow-[0_18px_40px_-20px_rgba(147,197,253,0.6)] focus-visible:outline-white",
    title: "text-white",
    button: "bg-white text-[#0d1830]",
  },
  conquest: {
    name: "game_modes.conquest_title",
    description: "game_modes.conquest_description",
    join: "game_modes.conquest_join",
    waiting: "game_modes.conquest_waiting",
    card: "border-emerald-400/25 bg-[#07130f] hover:border-emerald-300/60 hover:shadow-[0_18px_40px_-20px_rgba(16,185,129,0.6)] focus-visible:outline-emerald-300",
    title: "text-emerald-200",
    button: "bg-brand text-white",
  },
  survival: {
    name: "game_modes.survival_title",
    description: "game_modes.survival_description",
    join: "game_modes.survival_join",
    waiting: "game_modes.conquest_waiting",
    card: "border-red-400/25 bg-[linear-gradient(90deg,#1a0a0a,#120d07)] hover:border-red-300/60 hover:shadow-[0_18px_40px_-20px_rgba(248,113,113,0.55)] focus-visible:outline-red-300",
    title: "text-red-200",
    button: "bg-red-500/90 text-white",
  },
};

/** A pin: filled when the mode is pinned to the home page. */
function pinIcon(filled: boolean): TemplateResult {
  return html`<svg
    viewBox="0 0 24 24"
    class="size-4"
    fill=${filled ? "currentColor" : "none"}
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M12 17v5" />
    <path
      d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
    />
  </svg>`;
}
