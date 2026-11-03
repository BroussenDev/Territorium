import { LitElement, html, nothing, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { PlayerType, UnitType } from "../../../core/game/Game";
import { UserSettings } from "../../../core/game/UserSettings";
import { Controller } from "../../Controller";
import {
  EMPTY_GAME_TIP_HISTORY,
  GAME_TIP_IDS,
  GAME_TIP_KEYS,
  GameTipHistory,
  GameTipId,
  GameTipSnapshot,
  pickGameTip,
} from "../../GameTipsRules";
import { UIState } from "../../UIState";
import { translateText } from "../../Utils";
import { GameView } from "../../view";
import { PlayerView } from "../../view/PlayerView";

/** How often the rules are evaluated. */
const EVALUATE_INTERVAL_MS = 2000;
/** Border and city-price lookups are asynchronous and not needed more often. */
const WORLD_REFRESH_INTERVAL_MS = 10_000;
/** A tip stays on screen this long unless closed earlier. */
const VISIBLE_MS = 12_000;
/** localStorage key listing the tips already shown (JSON array of ids). */
const SHOWN_STORAGE_KEY = "gameTips.shown";

/** Facts about the map around the local player, refreshed every few seconds. */
interface WorldFacts {
  cityCost: number;
  isCoastal: boolean;
  neighbourCount: number;
  nationNeighbourCount: number;
  frontierTiles: number;
}

const NO_WORLD_FACTS: WorldFacts = {
  cityCost: 0,
  isCoastal: false,
  neighbourCount: 0,
  nationNeighbourCount: 0,
  frontierTiles: 0,
};

const bulbIcon = svg`<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z"/></svg>`;
const closeIcon = svg`<svg viewBox="0 0 24 24" class="size-3.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

function loadShown(): Set<GameTipId> {
  try {
    const raw = localStorage.getItem(SHOWN_STORAGE_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(
      parsed.filter((id): id is GameTipId =>
        (GAME_TIP_IDS as readonly unknown[]).includes(id),
      ),
    );
  } catch {
    return new Set();
  }
}

function saveShown(shown: ReadonlySet<GameTipId>): void {
  try {
    localStorage.setItem(SHOWN_STORAGE_KEY, JSON.stringify([...shown]));
  } catch {
    // Storage unavailable: the tip may repeat in a later game, nothing breaks.
  }
}

/**
 * One short contextual tip above the command panel. Shows at most one tip at
 * a time; the rules live in GameTipsRules.ts.
 */
@customElement("game-tips")
export class GameTips extends LitElement implements Controller {
  public game: GameView;
  public uiState: UIState;
  public userSettings: UserSettings;

  @state() private tip: GameTipId | null = null;

  private history: GameTipHistory = EMPTY_GAME_TIP_HISTORY;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private spawnTick: number | null = null;
  private world: WorldFacts = NO_WORLD_FACTS;
  private worldFetch: Promise<void> | null = null;
  private lastWorldFetchMs = -Infinity;

  createRenderRoot() {
    return this;
  }

  getTickIntervalMs() {
    return EVALUATE_INTERVAL_MS;
  }

  init() {
    this.history = { shown: loadShown(), lastShownAtMs: -Infinity };
  }

  tick() {
    const player = this.game.myPlayer();
    const now = performance.now();
    if (
      player === null ||
      !this.userSettings.gameTips() ||
      document.querySelector("tutorial-panel:not(.hidden)") !== null
    ) {
      this.hideTip();
      return;
    }
    this.refreshWorld(player, now);
    if (player.hasSpawned() && this.spawnTick === null) {
      this.spawnTick = this.game.ticks();
    }
    if (this.tip !== null) return;

    const snapshot = this.snapshot(player);
    const id = pickGameTip(snapshot, this.history, now);
    if (id !== null) this.show(id, now);
  }

  private snapshot(player: PlayerView): GameTipSnapshot {
    const config = this.game.config();
    const ticks = this.game.ticks();
    const world = this.world;
    const spectating =
      config.isReplay() || (player.hasSpawned() && !player.isAlive());
    return {
      ranked: config.gameConfig().rankedType !== undefined,
      spectating,
      inSpawnPhase: this.game.inSpawnPhase(),
      hasSpawned: player.hasSpawned(),
      secondsSinceSpawn:
        this.spawnTick === null ? null : (ticks - this.spawnTick) / 10,
      elapsedSeconds: this.game.elapsedGameSeconds(),
      troops: player.troops(),
      maxTroops: config.maxTroops(player),
      gold: Number(player.gold()),
      cityCost: world.cityCost,
      cityCount: player.units(UnitType.City).length,
      portCount: player.units(UnitType.Port).length,
      isCoastal: world.isCoastal,
      neighbourCount: world.neighbourCount,
      nationNeighbourCount: world.nationNeighbourCount,
      frontierTiles: world.frontierTiles,
      incomingAttackCount: player.incomingAttacks().filter((a) => !a.retreating)
        .length,
      attackRatio: this.uiState.attackRatio,
      hasAlliance: player.alliances().length > 0,
      hasOutgoingAllianceRequest: this.game
        .players()
        .some(
          (other) =>
            other.id() !== player.id() &&
            player.isRequestingAllianceWith(other),
        ),
    };
  }

  private refreshWorld(player: PlayerView, now: number) {
    if (
      this.worldFetch !== null ||
      now - this.lastWorldFetchMs < WORLD_REFRESH_INTERVAL_MS
    ) {
      return;
    }
    this.lastWorldFetchMs = now;
    this.worldFetch = Promise.all([
      player.borderTiles(),
      player.buildables(undefined, [UnitType.City]),
    ])
      .then(([border, buildables]) => {
        const myID = player.smallID();
        const neighbours = new Set<number>();
        let isCoastal = false;
        for (const tile of border.borderTiles) {
          if (this.game.isShore(tile)) isCoastal = true;
          for (const n of this.game.neighbors(tile)) {
            const owner = this.game.ownerID(n);
            if (owner !== 0 && owner !== myID) neighbours.add(owner);
          }
        }
        let nationNeighbourCount = 0;
        for (const id of neighbours) {
          try {
            const other = this.game.playerBySmallID(id);
            if (
              other.isPlayer() &&
              (other as PlayerView).type() === PlayerType.Nation
            ) {
              nationNeighbourCount++;
            }
          } catch {
            // Owner vanished between the border read and now: ignore it.
          }
        }
        this.world = {
          cityCost: Number(
            buildables.find((b) => b.type === UnitType.City)?.cost ?? 0n,
          ),
          isCoastal,
          neighbourCount: neighbours.size,
          nationNeighbourCount,
          frontierTiles: border.borderTiles.size,
        };
      })
      .catch(() => {
        // Dead or spectated player: the next refresh tries again.
      })
      .finally(() => {
        this.worldFetch = null;
      });
  }

  private show(id: GameTipId, now: number) {
    const shown = new Set(this.history.shown);
    shown.add(id);
    this.history = { shown, lastShownAtMs: now };
    saveShown(shown);
    this.tip = id;
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => this.hideTip(), VISIBLE_MS);
  }

  private hideTip() {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    if (this.tip !== null) this.tip = null;
  }

  private disableTips() {
    this.userSettings.setGameTips(false);
    this.hideTip();
  }

  render() {
    if (this.tip === null) return nothing;
    return html`
      <div
        role="status"
        aria-live="polite"
        class="pointer-events-auto mx-auto mb-2 w-full max-w-[22rem] rounded-md border border-white/10 border-l-2 border-l-brand-bright bg-plate-800/92 px-3 py-2 text-white shadow-lg backdrop-blur-sm"
      >
        <div class="flex items-start gap-2">
          <span class="mt-0.5 shrink-0 text-brand-bright">${bulbIcon}</span>
          <div class="min-w-0 flex-1">
            <div
              class="text-[11px] font-bold uppercase tracking-wide text-brand-bright"
            >
              ${translateText("game_tips.title")}
            </div>
            <p class="mt-0.5 text-sm leading-snug">
              ${translateText(GAME_TIP_KEYS[this.tip])}
            </p>
            <button
              class="mt-1 text-xs text-white/55 underline hover:text-white"
              @click=${() => this.disableTips()}
            >
              ${translateText("game_tips.disable")}
            </button>
          </div>
          <button
            class="shrink-0 p-0.5 text-white/60 hover:text-white"
            title=${translateText("game_tips.close")}
            aria-label=${translateText("game_tips.close")}
            @click=${() => this.hideTip()}
          >
            ${closeIcon}
          </button>
        </div>
      </div>
    `;
  }
}
