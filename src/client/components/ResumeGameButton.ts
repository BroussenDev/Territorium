import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { GameID } from "../../core/Schemas";
import { ClientEnv } from "../ClientEnv";
import { ensureServerList } from "../ServerList";
import { translateText } from "../Utils";

// The multiplayer game the player is in, kept so a closed tab or a crashed
// browser can go back to it from the main menu. Leaving on purpose forgets it.
const ACTIVE_GAME_KEY = "territorium.activeGame";
// Past this, the game is surely over: don't even ask the server.
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

interface ActiveGame {
  gameID: GameID;
  at: number;
}

export function rememberActiveGame(gameID: GameID): void {
  try {
    const entry: ActiveGame = { gameID, at: Date.now() };
    localStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify(entry));
  } catch {
    // Storage can be full or disabled: resuming is only a convenience.
  }
}

export function forgetActiveGame(): void {
  try {
    localStorage.removeItem(ACTIVE_GAME_KEY);
  } catch {
    // See rememberActiveGame.
  }
}

function readActiveGame(): ActiveGame | null {
  try {
    const raw = localStorage.getItem(ACTIVE_GAME_KEY);
    if (raw === null) return null;
    const entry = JSON.parse(raw) as Partial<ActiveGame>;
    if (
      typeof entry.gameID !== "string" ||
      typeof entry.at !== "number" ||
      Date.now() - entry.at > MAX_AGE_MS
    ) {
      forgetActiveGame();
      return null;
    }
    return { gameID: entry.gameID, at: entry.at };
  } catch {
    forgetActiveGame();
    return null;
  }
}

async function gameStillRunning(gameID: GameID): Promise<boolean> {
  await ensureServerList();
  const url = `${ClientEnv.gameHttpBase(gameID)}/${ClientEnv.gameWorkerPath(gameID)}/api/game/${gameID}/exists`;
  const response = await fetch(url);
  if (!response.ok) return false;
  const body = (await response.json()) as { exists?: boolean };
  return body.exists === true;
}

/**
 * Main menu: "Resume my game" while the multiplayer game the player dropped
 * out of is still running on the server.
 */
@customElement("resume-game-button")
export class ResumeGameButton extends LitElement {
  @state() private gameID: GameID | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    const active = readActiveGame();
    if (active === null) return;
    gameStillRunning(active.gameID)
      .then((running) => {
        if (running) {
          this.gameID = active.gameID;
        } else {
          forgetActiveGame();
        }
      })
      .catch((e) => console.warn("resume: could not check the game", e));
  }

  private resume() {
    if (this.gameID === null) return;
    window.location.href = ClientEnv.gamePath(this.gameID);
  }

  private dismiss() {
    forgetActiveGame();
    this.gameID = null;
  }

  render() {
    if (this.gameID === null) return nothing;
    return html`<div
      class="flex flex-wrap items-center gap-3 rounded-xl border border-amber-400/40 bg-[linear-gradient(115deg,#3a2a08_0%,var(--color-ink)_70%)] px-4 py-3"
    >
      <div class="min-w-0 flex-1">
        <div class="font-bold text-white">
          ${translateText("resume_game.title")}
        </div>
        <div class="text-sm text-white/70">
          ${translateText("resume_game.description")}
        </div>
      </div>
      <button
        type="button"
        class="rounded-lg bg-amber-400 px-4 py-2 font-bold text-black hover:bg-amber-300"
        @click=${this.resume}
      >
        ${translateText("resume_game.resume")}
      </button>
      <button
        type="button"
        class="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/80 hover:bg-white/20"
        @click=${this.dismiss}
      >
        ${translateText("resume_game.dismiss")}
      </button>
    </div>`;
  }
}
