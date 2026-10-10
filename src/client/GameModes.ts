import { VERSUS_TEAM_SIZES, versusGameType } from "../core/game/Versus";
import type { PublicGameInfo, PublicGames } from "../core/Schemas";

// The game modes with rules of their own (the Modes page), and the two the
// home page shows: the ones the player pinned, then the ones they join the
// most, then the busiest. Kept on this device.

export const MODE_KEYS = ["nations", "versus", "conquest", "survival"] as const;
export type ModeKey = (typeof MODE_KEYS)[number];

export const MAX_PINNED_MODES = 2;
const PLAYS_KEY = "territorium.modePlays";
const PINS_KEY = "territorium.modePins";

const isMode = (v: unknown): v is ModeKey =>
  typeof v === "string" && (MODE_KEYS as readonly string[]).includes(v);

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked: the home page falls back to the busiest modes.
  }
}

/** The public lobby a mode joins (Versus has several: the busiest). */
export function modeLobby(
  lobbies: PublicGames | null,
  mode: ModeKey,
): PublicGameInfo | undefined {
  const games = lobbies?.games;
  if (!games) return undefined;
  if (mode === "versus") {
    return VERSUS_TEAM_SIZES.map((size) => games[versusGameType(size)]?.[0])
      .filter((g): g is PublicGameInfo => g !== undefined)
      .sort((a, b) => b.numClients - a.numClients)[0];
  }
  return games[mode]?.[0];
}

/** Players waiting in a mode's lobbies. */
export function modeWaiting(
  lobbies: PublicGames | null,
  mode: ModeKey,
): number {
  if (mode === "versus") {
    return VERSUS_TEAM_SIZES.reduce(
      (sum, size) =>
        sum + (lobbies?.games?.[versusGameType(size)]?.[0]?.numClients ?? 0),
      0,
    );
  }
  return modeLobby(lobbies, mode)?.numClients ?? 0;
}

export function modePlays(): Partial<Record<ModeKey, number>> {
  const plays = read<Record<string, unknown>>(PLAYS_KEY, {});
  const out: Partial<Record<ModeKey, number>> = {};
  for (const mode of MODE_KEYS) {
    const n = plays[mode];
    if (typeof n === "number" && Number.isFinite(n) && n > 0) out[mode] = n;
  }
  return out;
}

/** The player joined a mode: it counts toward their favourites. */
export function recordModePlay(mode: ModeKey): void {
  const plays = modePlays();
  plays[mode] = (plays[mode] ?? 0) + 1;
  write(PLAYS_KEY, plays);
}

export function pinnedModes(): ModeKey[] {
  const pins = read<unknown>(PINS_KEY, []);
  return Array.isArray(pins)
    ? [...new Set(pins.filter(isMode))].slice(0, MAX_PINNED_MODES)
    : [];
}

/**
 * Pins or unpins a mode. False when pinning would go over the limit (the
 * player unpins one first).
 */
export function togglePinnedMode(mode: ModeKey): boolean {
  const pins = pinnedModes();
  if (pins.includes(mode)) {
    write(
      PINS_KEY,
      pins.filter((m) => m !== mode),
    );
    return true;
  }
  if (pins.length >= MAX_PINNED_MODES) return false;
  write(PINS_KEY, [...pins, mode]);
  return true;
}

/**
 * The two modes for the home page: pinned ones first, then the most joined,
 * then the busiest right now. A mode the player cannot open yet (`locked`,
 * Versus before the Steam release) only comes when pinned or played.
 */
export function favoriteModes(
  lobbies: PublicGames | null,
  locked: readonly ModeKey[] = [],
  pins: ModeKey[] = pinnedModes(),
  plays: Partial<Record<ModeKey, number>> = modePlays(),
): ModeKey[] {
  const chosen = [...pins];
  const rest = MODE_KEYS.filter(
    (m) => !chosen.includes(m) && (!locked.includes(m) || (plays[m] ?? 0) > 0),
  ).sort(
    (a, b) =>
      (plays[b] ?? 0) - (plays[a] ?? 0) ||
      modeWaiting(lobbies, b) - modeWaiting(lobbies, a) ||
      MODE_KEYS.indexOf(a) - MODE_KEYS.indexOf(b),
  );
  return [...chosen, ...rest].slice(0, MAX_PINNED_MODES);
}
