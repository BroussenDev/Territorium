// A replay link can ask to start at a moment of the game: ?at=<turn> (the
// admin panel's clips of a report). The replay runs at full speed up to that
// turn, then plays at the chosen speed.
const MAX_TURN = 10_000_000;

export function replaySeekTurn(
  search: string = typeof window === "undefined" ? "" : window.location.search,
): number | null {
  const raw = new URLSearchParams(search).get("at");
  if (raw === null || !/^\d+$/.test(raw)) return null;
  const turn = Number(raw);
  return turn > 0 && turn <= MAX_TURN ? turn : null;
}

/** The replay bar asks to jump to a turn (ReplayPanel → LocalServer). */
export class ReplaySeekEvent {
  constructor(public readonly turn: number) {}
}

/** Where a replay stands: the turn shown, of how many, and a jump under way. */
export class ReplayProgressEvent {
  constructor(
    public readonly turn: number,
    public readonly total: number,
    public readonly seekingTo: number | null,
  ) {}
}

/**
 * The address that replays a game from a given turn: the same page with
 * ?at=<turn>, every other parameter kept (a staff review's focus too).
 */
export function replayUrlAt(href: string, turn: number): string {
  const url = new URL(href);
  if (turn > 0) url.searchParams.set("at", String(turn));
  else url.searchParams.delete("at");
  return url.toString();
}

// Read once when the page loads: the URL can be rewritten before the replay
// starts (the join flow), and a replay sent to another build's shell carries
// it along (VersionedReplay.ts).
export const initialReplaySeek = replaySeekTurn();
