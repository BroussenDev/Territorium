import type { Logger } from "winston";
import { startPolling } from "./PollingLoop";
import { ServerEnv } from "./ServerEnv";

// The community maps private lobbies may play: the ones our moderators
// approved (the API's community-maps/approved-ids), read every minute. A map
// approved since the last read is asked about on the spot
// (ensureApprovedCommunityMap), so a host who picks it right after its
// approval gets it. A map that is pending or was rejected is refused.

const REFRESH_MS = 60_000;
// A map found not approved is not asked about again for this long.
const MISS_TTL_MS = 15_000;
const ID = /^[0-9a-f]{64}$/;

let approved = new Set<string>();
let started = false;
const misses = new Map<string, number>();

export function isApprovedCommunityMap(id: string): boolean {
  return approved.has(id);
}

/** Tests: set the approved maps directly. */
export function setApprovedCommunityMaps(ids: Iterable<string>): void {
  approved = new Set(ids);
  misses.clear();
}

/**
 * Whether a map is approved, asking the API when this server does not know
 * it yet (approved since the last read).
 */
export async function ensureApprovedCommunityMap(
  id: string,
  fetchImpl: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<boolean> {
  if (approved.has(id)) return true;
  if (!ID.test(id) || now - (misses.get(id) ?? -Infinity) < MISS_TTL_MS) {
    return false;
  }
  try {
    const res = await fetchImpl(
      `${ServerEnv.jwtIssuer()}/community-maps/${id}`,
      { signal: AbortSignal.timeout(5_000) },
    );
    const map = res.ok ? ((await res.json()) as { status?: unknown }) : null;
    if (map?.status === "approved") {
      approved.add(id);
      return true;
    }
  } catch {
    // The API is unreachable: refused, as before.
  }
  misses.set(id, now);
  return false;
}

export function startCommunityMapIdsPoller(log: Logger): void {
  if (started || ServerEnv.apiKey() === "") return;
  started = true;
  startPolling(async () => {
    try {
      const res = await fetch(
        `${ServerEnv.jwtIssuer()}/community-maps/approved-ids`,
        {
          headers: { "x-api-key": ServerEnv.apiKey() },
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok) return;
      const ids: unknown = await res.json();
      if (Array.isArray(ids) && ids.every((i) => typeof i === "string")) {
        approved = new Set(ids);
      }
    } catch (error) {
      log.warn(`community maps: approved list unavailable: ${error}`);
    }
  }, REFRESH_MS);
}
