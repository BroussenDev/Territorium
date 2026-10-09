import {
  acceptsNewGames,
  type ClosableGame,
  inMaintenance,
  OPEN_SERVER_STATUS,
  type ServerStatus,
  ServerStatusSchema,
} from "../core/ServerStatus";
import { ClientEnv } from "./ClientEnv";
import { showToast, translateText } from "./Utils";

// What the operators closed and the maintenance they announced
// (src/core/ServerStatus.ts), read from our own game server, same origin as
// the page like the news. Refreshed every half minute while the page is open;
// a failed read keeps the last answer (open when there never was one: the
// server refuses closed games anyway).

const REFRESH_MS = 30_000;

export const SERVER_STATUS_EVENT = "server-status";

let status: ServerStatus = OPEN_SERVER_STATUS;
// Server clock minus ours, so a maintenance starts at the server's time.
let offsetMs = 0;
let started = false;

export function serverStatus(): ServerStatus {
  return status;
}

/** Now on the server's clock. */
export function serverNow(): number {
  return Date.now() + offsetMs;
}

function statusUrl(): string {
  try {
    return `${ClientEnv.serverHttpBase()}/api/server-status`;
  } catch {
    return "/api/server-status";
  }
}

async function refresh(): Promise<void> {
  try {
    const res = await fetch(statusUrl(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status !== 200) return;
    const json = await res.json();
    const parsed = ServerStatusSchema.safeParse(json);
    if (!parsed.success) return;
    if (typeof json.serverTime === "number") {
      offsetMs = json.serverTime - Date.now();
    }
    status = parsed.data;
    document.dispatchEvent(
      new CustomEvent(SERVER_STATUS_EVENT, { detail: status }),
    );
  } catch {
    // Offline or the server is restarting: keep the last answer.
  }
}

/** Starts reading the status (idempotent). */
export function watchServerStatus(): void {
  if (started) return;
  started = true;
  void refresh();
  setInterval(() => void refresh(), REFRESH_MS);
}

/** The name players know a closable kind of game by. */
export function closableGameName(game: ClosableGame): string {
  switch (game) {
    case "ffa":
      return translateText("game_mode.ffa");
    case "team":
      return translateText("mode_selector.teams_title");
    case "special":
      return translateText("detailed_view.pane_special");
    case "nations":
      return translateText("game_modes.nations_title");
    case "conquest":
      return translateText("game_modes.conquest_title");
    case "survival":
      return translateText("game_modes.survival_title");
    case "private":
      return translateText("server_status.private_games");
    case "solo":
      return translateText("main.solo");
    case "ranked":
      return translateText("mode_selector.ranked_title");
    default:
      return translateText("versus.format_title", { format: game });
  }
}

/**
 * Whether a new game of this kind may start; when not, tells the player why
 * (maintenance, or this mode closed for now).
 */
export function gameOpenOrExplain(game: ClosableGame): boolean {
  if (acceptsNewGames(status, game, serverNow())) return true;
  showToast(
    inMaintenance(status, serverNow())
      ? translateText("server_status.maintenance_blocked")
      : translateText("server_status.mode_closed", {
          mode: closableGameName(game),
        }),
    "red",
    5000,
  );
  return false;
}
