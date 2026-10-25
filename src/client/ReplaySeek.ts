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

// Read once when the page loads: the URL can be rewritten before the replay
// starts (the join flow), and a replay sent to another build's shell carries
// it along (VersionedReplay.ts).
export const initialReplaySeek = replaySeekTurn();
