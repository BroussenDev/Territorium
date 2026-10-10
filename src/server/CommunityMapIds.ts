import type { Logger } from "winston";
import { startPolling } from "./PollingLoop";
import { ServerEnv } from "./ServerEnv";

// The community maps private lobbies may play: the ones our moderators
// approved (the API's community-maps/approved-ids), read every minute. A map
// that is pending or was rejected is refused when a host picks it.

const REFRESH_MS = 60_000;

let approved = new Set<string>();
let started = false;

export function isApprovedCommunityMap(id: string): boolean {
  return approved.has(id);
}

/** Tests: set the approved maps directly. */
export function setApprovedCommunityMaps(ids: Iterable<string>): void {
  approved = new Set(ids);
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
