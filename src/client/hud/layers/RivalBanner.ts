import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { GameType, PlayerType } from "../../../core/game/Game";
import { fetchMyRival } from "../../Api";
import { Controller } from "../../Controller";
import { crossedSwords } from "../../RivalIcon";
import { findRivalPlayer, Rival, setRivalPresence } from "../../Rivalry";
import { translateText } from "../../Utils";
import { GameView } from "../../view";

/** How long the banner stays up once the spawn phase is over. */
const VISIBLE_MS = 7000;

/**
 * Announces the player's rival when they are in the game: once the spawn
 * phase ends, a dramatic banner with the head to head. Remembers the rival
 * for the end screen (see Rivalry.ts).
 */
@customElement("rival-banner")
export class RivalBanner extends LitElement implements Controller {
  public game: GameView;

  @state() private rival: Rival | null = null;
  @state() private shown = false;

  private requested = false;
  private myRival: Rival | null = null;
  private decided = false;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  createRenderRoot() {
    return this;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
  }

  init() {
    const config = this.game.config();
    if (
      config.isReplay() ||
      config.gameConfig().gameType === GameType.Singleplayer
    ) {
      this.decided = true;
      return;
    }
    this.requested = true;
    void fetchMyRival().then((rival) => {
      this.myRival = rival;
      if (rival === null) this.decided = true;
    });
  }

  tick() {
    if (!this.requested || this.decided || this.myRival === null) return;
    if (this.game.inSpawnPhase()) return;
    this.decided = true;
    const me = this.game.myPlayer();
    const humans = this.game
      .players()
      .filter((p) => p.type() === PlayerType.Human);
    const found = findRivalPlayer(this.myRival, humans, me?.clientID() ?? null);
    const clientID = found?.clientID() ?? null;
    if (found === null || clientID === null) return;
    setRivalPresence({
      gameID: this.game.gameID(),
      rival: this.myRival,
      clientID,
    });
    this.rival = this.myRival;
    // Rendered hidden first, so the entrance animates.
    setTimeout(() => {
      this.shown = true;
    }, 50);
    this.hideTimer = setTimeout(() => {
      this.shown = false;
    }, VISIBLE_MS);
  }

  render() {
    if (this.rival === null) return nothing;
    const r = this.rival;
    return html`<div
      role="status"
      class="pointer-events-none fixed left-1/2 top-24 z-[1100] w-[min(92vw,34rem)] -translate-x-1/2 transition-all duration-700 ${this
        .shown
        ? "translate-y-0 scale-100 opacity-100"
        : "-translate-y-6 scale-95 opacity-0"}"
    >
      <div
        class="flex items-center gap-4 rounded-xl border border-red-400/50 bg-gradient-to-r from-red-950/95 via-plate-900/95 to-red-950/95 px-5 py-3 text-white shadow-[0_0_32px_rgba(220,38,38,0.45)] backdrop-blur-sm"
      >
        ${crossedSwords("size-14 shrink-0 drop-shadow-lg")}
        <p class="text-base font-extrabold leading-snug sm:text-lg">
          ${translateText("rival.banner", {
            name: r.name,
            you: r.yourWins,
            them: r.theirWins,
          })}
        </p>
      </div>
    </div>`;
  }
}
