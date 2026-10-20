// The Steam demo (Territorium Demo, app 5474160): the Steam app built with
// its `demo` feature, always on its bundled build (offline: no account, no
// servers). It plays solo, Survival and the guided training on a few maps;
// everything else is the full game's, and the demo invites the player to
// wishlist it.

import { GameEnv } from "../core/configuration/Config";
import { GameMapType } from "../core/game/Game";
import { SURVIVAL_MAPS } from "../core/game/Survival";
import { ClientEnv } from "./ClientEnv";
import { openInSteamOverlay } from "./Workshop";
import { steamStoreUrl } from "./components/SteamWishlist";

/** The maps the demo plays on. */
export const DEMO_MAPS: readonly GameMapType[] = [
  GameMapType.World,
  GameMapType.Europe,
  GameMapType.NorthAmerica,
  GameMapType.Africa,
  GameMapType.Australia,
];

/** The guided training's map is playable in the demo too. */
const DEMO_EXTRA_MAPS: readonly GameMapType[] = [GameMapType.BlackSea];

/** Survival's maps that the demo plays on. */
export const DEMO_SURVIVAL_MAPS: readonly GameMapType[] = SURVIVAL_MAPS.filter(
  (m) => DEMO_MAPS.includes(m),
);

/**
 * Whether this is the demo: the app says so (window.__TERRITORIUM_DEMO__), or
 * a dev build opened with ?demo to try it in a browser.
 */
export function isDemo(): boolean {
  if (typeof window === "undefined") return false;
  if (
    (window as { __TERRITORIUM_DEMO__?: unknown }).__TERRITORIUM_DEMO__ === true
  ) {
    return true;
  }
  return (
    new URLSearchParams(window.location.search).has("demo") &&
    ClientEnv.env() === GameEnv.Dev
  );
}

/** Whether the demo lets `map` be played (always true in the full game). */
export function demoAllowsMap(map: GameMapType): boolean {
  return !isDemo() || DEMO_MAPS.includes(map) || DEMO_EXTRA_MAPS.includes(map);
}

/** A random map the demo allows. */
export function randomDemoMap(): GameMapType {
  return DEMO_MAPS[Math.floor(Math.random() * DEMO_MAPS.length)];
}

/** Opens the full game's store page, to wishlist it. */
export function openWishlist(campaign: string): void {
  const url = steamStoreUrl(campaign);
  if (!openInSteamOverlay(url)) window.open(url, "_blank", "noopener");
}

/** What the player did in the demo, kept on this PC for its records. */
export interface DemoStats {
  games: number;
  wins: number;
  /** Survival's furthest wave, 0 before any Survival game. */
  bestWave: number;
  /** The last game counted, so a game shown twice (death, then its end) counts once. */
  lastGame: string | null;
  /** Whether that game already counted as a win. */
  lastWon: boolean;
}

const STATS_KEY = "demoStats";

const NO_STATS: DemoStats = {
  games: 0,
  wins: 0,
  bestWave: 0,
  lastGame: null,
  lastWon: false,
};

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 0;
}

export function demoStats(): DemoStats {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? "null");
    if (raw === null || typeof raw !== "object") return { ...NO_STATS };
    return {
      games: count(raw.games),
      wins: count(raw.wins),
      bestWave: count(raw.bestWave),
      lastGame: typeof raw.lastGame === "string" ? raw.lastGame : null,
      lastWon: raw.lastWon === true,
    };
  } catch {
    return { ...NO_STATS };
  }
}

/**
 * Counts a finished game: `gameID` once, however many times its end screen
 * shows, keeping a win or a further wave learned on a later showing.
 */
export function recordDemoGame(
  gameID: string,
  result: { won: boolean; wave?: number },
): DemoStats {
  const stats = demoStats();
  const again = stats.lastGame === gameID;
  if (!again) stats.games++;
  if (result.won && !(again && stats.lastWon)) stats.wins++;
  stats.lastWon = result.won || (again && stats.lastWon);
  stats.bestWave = Math.max(stats.bestWave, count(result.wave));
  stats.lastGame = gameID;
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Storage full or blocked: the records just don't keep.
  }
  return stats;
}
