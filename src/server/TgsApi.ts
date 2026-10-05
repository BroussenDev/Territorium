import { GameEnv } from "../core/configuration/Config";
import { ServerEnv } from "./ServerEnv";
import { TgsIncident, tgsSwitch, TgsSwitch } from "./Tgs";

// How often a worker asks the API whether TGS is switched on: the admin
// panel's switch takes effect everywhere within this.
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

/** Keeps `target` in step with the admin panel's TGS switch. */
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
      const body = (await res.json()) as { enabled?: unknown };
      // Unreachable or malformed: keep the last known state.
      if (typeof body.enabled === "boolean") target.set(body.enabled);
    } catch {
      // Same: the last known state stands.
    }
  };
  void poll();
  const timer = setInterval(() => void poll(), STATUS_POLL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
