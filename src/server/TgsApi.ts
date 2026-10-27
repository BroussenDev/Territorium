import { GameEnv } from "../core/configuration/Config";
import { ServerEnv } from "./ServerEnv";
import { TgsIncident, tgsSwitch, TgsSwitch } from "./Tgs";
import type { RankedVerdict } from "./TgsRanked";

// How often a worker asks the API whether TGS is switched on, and its
// thresholds: the admin panel's changes take effect everywhere within this.
const STATUS_POLL_MS = 15_000;

/**
 * Tells the API about a TGS disconnection the moment it happens, so the
 * staff sees it before the match ends (the archived record repeats it, and
 * the API keeps one). Best effort: a failure only loses the early notice.
 */
export async function reportTgsIncident(
  gameID: string,
  incident: TgsIncident,
  persistentID: string | undefined,
  username: string | undefined,
): Promise<void> {
  if (ServerEnv.env() === GameEnv.Dev) return;
  try {
    await fetch(`${ServerEnv.jwtIssuer()}/tgs/incidents`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ServerEnv.apiKey(),
      },
      body: JSON.stringify({ gameID, persistentID, username, ...incident }),
    });
  } catch {
    // The record carries it at the end of the match anyway.
  }
}

/**
 * Records what the staff did in a game (an admin's tool, a removal) in the
 * API's permanent staff log, kept even if a player later complains: the
 * API never deletes these rows. Best effort, like the TGS notices.
 */
export async function reportStaffAction(entry: {
  gameID: string;
  staffPersistentID: string;
  staffUsername: string;
  action: string;
  target: string;
  amount?: number;
  text?: string;
}): Promise<void> {
  if (ServerEnv.env() === GameEnv.Dev) return;
  try {
    await fetch(`${ServerEnv.jwtIssuer()}/staff-actions`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ServerEnv.apiKey(),
      },
      body: JSON.stringify(entry),
    });
  } catch {
    // The server log below still has it.
  }
}

/** What the players' screens say about a cancelled ranked game. */
export interface RankedCancelAnswer {
  compensation: number;
  penalty: number;
  banDays: number;
}

/** Used when the API can't be reached: the API applies its own values. */
export const RANKED_CANCEL_DEFAULTS: RankedCancelAnswer = {
  compensation: 100,
  penalty: 50,
  banDays: 7,
};

/**
 * Asks the API to cancel a ranked game TGS caught (TgsRanked.ts): it takes
 * the cheaters' rating and keeps them out of ranked, and makes the others
 * whole. Answers what to tell the players.
 */
export async function cancelRankedGame(
  gameID: string,
  verdict: RankedVerdict,
  players: {
    clientID: string;
    persistentID: string | null;
    username: string;
  }[],
): Promise<RankedCancelAnswer> {
  if (ServerEnv.env() === GameEnv.Dev) return RANKED_CANCEL_DEFAULTS;
  try {
    const res = await fetch(`${ServerEnv.jwtIssuer()}/tgs/ranked/cancel`, {
      method: "POST",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ServerEnv.apiKey(),
      },
      body: JSON.stringify({ gameID, ...verdict, players }),
    });
    if (!res.ok) return RANKED_CANCEL_DEFAULTS;
    const body = (await res.json()) as Partial<RankedCancelAnswer>;
    return {
      compensation: Number(
        body.compensation ?? RANKED_CANCEL_DEFAULTS.compensation,
      ),
      penalty: Number(body.penalty ?? RANKED_CANCEL_DEFAULTS.penalty),
      banDays: Number(body.banDays ?? RANKED_CANCEL_DEFAULTS.banDays),
    };
  } catch {
    // The record still says the game was cancelled (info.tgs.cancelled).
    return RANKED_CANCEL_DEFAULTS;
  }
}

/** Keeps `target` in step with the admin panel's TGS switch and thresholds. */
export function startTgsStatusPoller(
  target: TgsSwitch = tgsSwitch,
  fetchImpl: typeof fetch = fetch,
): () => void {
  if (ServerEnv.env() === GameEnv.Dev) return () => {};
  const poll = async () => {
    try {
      const res = await fetchImpl(`${ServerEnv.jwtIssuer()}/tgs/status`, {
        signal: AbortSignal.timeout(5000),
        headers: { "x-api-key": ServerEnv.apiKey() },
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        enabled?: unknown;
        settings?: unknown;
      };
      // Unreachable or malformed: keep the last known state.
      if (typeof body.enabled === "boolean") target.set(body.enabled);
      if (body.settings !== undefined) target.setSettings(body.settings);
    } catch {
      // Same: the last known state stands.
    }
  };
  void poll();
  const timer = setInterval(() => void poll(), STATUS_POLL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
