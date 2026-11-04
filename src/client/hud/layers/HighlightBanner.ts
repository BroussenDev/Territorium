import { LitElement, html, nothing, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import { PlayerType } from "../../../core/game/Game";
import { UserSettings } from "../../../core/game/UserSettings";
import { Controller } from "../../Controller";
import {
  HIGHLIGHT_KEYS,
  Highlight,
  HighlightKind,
  HighlightPlayer,
  HighlightTracker,
} from "../../HighlightRules";
import { translateText } from "../../Utils";
import { GameView } from "../../view";

/** How often the rules are evaluated. */
const EVALUATE_INTERVAL_MS = 1000;
/** A banner stays on screen this long. */
const VISIBLE_MS = 6000;

/** One custom emblem per kind, outlined with a gold accent. */
const EMBLEMS: Record<HighlightKind, ReturnType<typeof svg>> = {
  domination: svg`<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18l2-10 4.5 4L12 5l2.5 7L19 8l2 10z"/><path d="M4 21h16"/></svg>`,
  lead_change: svg`<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>`,
  giant_fallen: svg`<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v7M9 6h6"/><path d="M7 21V12c0-1.5 2-2 5-2s5 .5 5 2v9z"/><path d="M10 21v-4h4v4"/></svg>`,
  killing_spree: svg`<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3l-9 13h6l-2 5 10-14h-6z"/></svg>`,
  total_war: svg`<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l10 10M20 4L10 14"/><path d="M13 17l4 4M11 17l-4 4"/></svg>`,
  comeback: svg`<svg viewBox="0 0 24 24" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18l6-6 4 4 6-8"/><path d="M15 8h5v5"/></svg>`,
};

/**
 * A centered banner near the top of the screen announcing a notable moment.
 * Computed on the client from the game view: presentation only. The rules and
 * the rate limit live in HighlightRules.ts.
 */
@customElement("highlight-banner")
export class HighlightBanner extends LitElement implements Controller {
  public game: GameView;
  public userSettings: UserSettings;

  @state() private current: Highlight | null = null;
  @state() private visible = false;

  private tracker = new HighlightTracker();
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;

  createRenderRoot() {
    return this;
  }

  getTickIntervalMs() {
    return EVALUATE_INTERVAL_MS;
  }

  tick() {
    if (!this.userSettings.highlights()) {
      this.dismiss();
      return;
    }
    const highlight = this.tracker.update({
      elapsedSeconds: this.game.elapsedGameSeconds(),
      inSpawnPhase: this.game.inSpawnPhase(),
      landTiles: this.game.numLandTiles(),
      players: this.game.players().map(this.toPlayer),
    });
    if (highlight !== null) this.show(highlight);
  }

  private toPlayer = (p: ReturnType<GameView["players"]>[number]) => {
    const attacking = new Map<string, number>();
    for (const attack of p.outgoingAttacks()) {
      if (attack.retreating) continue;
      try {
        const target = this.game.playerBySmallID(attack.targetID);
        if (!target.isPlayer()) continue;
        const id = String(target.id());
        attacking.set(id, (attacking.get(id) ?? 0) + attack.troops);
      } catch {
        // Target vanished: the attack is over.
      }
    }
    const player: HighlightPlayer = {
      id: String(p.id()),
      name: p.displayName(),
      tiles: p.numTilesOwned(),
      alive: p.isAlive(),
      isBot: p.type() === PlayerType.Bot,
      attacking,
    };
    return player;
  };

  private show(highlight: Highlight) {
    this.clearTimers();
    this.current = highlight;
    this.visible = true;
    this.hideTimer = setTimeout(() => {
      this.visible = false;
      // Leaves the DOM after the fade-out.
      this.clearTimer = setTimeout(() => (this.current = null), 400);
    }, VISIBLE_MS);
  }

  private dismiss() {
    if (this.current === null) return;
    this.clearTimers();
    this.visible = false;
    this.current = null;
  }

  private clearTimers() {
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    if (this.clearTimer !== null) clearTimeout(this.clearTimer);
    this.hideTimer = null;
    this.clearTimer = null;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.clearTimers();
  }

  render() {
    const h = this.current;
    if (h === null) return nothing;
    // top-20 and a width capped below the sidebars keep the leaderboard and
    // the top controls uncovered, on a phone too.
    return html`
      <div
        role="status"
        aria-live="polite"
        class="pointer-events-none fixed left-1/2 top-20 z-[796] w-[min(24rem,calc(100vw-7rem))] -translate-x-1/2 transition-all duration-300 motion-reduce:transition-none ${this
          .visible
          ? "translate-y-0 opacity-100"
          : "-translate-y-3 opacity-0"}"
      >
        <div
          class="flex items-center gap-3 rounded-md border border-white/10 border-l-4 border-l-capital bg-plate-900/95 px-3 py-2 text-white shadow-[0_18px_40px_-18px_rgb(0_0_0/0.9)]"
        >
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-full bg-capital/15 text-capital"
            >${EMBLEMS[h.kind]}</span
          >
          <span class="min-w-0 text-sm font-semibold leading-snug sm:text-base"
            >${translateText(HIGHLIGHT_KEYS[h.kind], h.params)}</span
          >
        </div>
      </div>
    `;
  }
}
