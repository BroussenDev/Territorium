import type { RankedMapVote } from "../../../core/ApiSchemas";

// Pure helpers of the ranked map vote screen.

// Whole seconds left on the vote's clock, `endsInMs` having been read at
// `receivedAt`; never below zero.
export function voteSecondsLeft(
  endsInMs: number,
  receivedAt: number,
  now: number,
): number {
  return Math.max(0, Math.ceil((endsInMs - (now - receivedAt)) / 1000));
}

// Whether this player may still ban or vote.
export function canCastVote(vote: RankedMapVote): boolean {
  return vote.mine === null && vote.result === null;
}

// In a ban duel a map with a ban against it is out of the running.
export function isBannedMap(vote: RankedMapVote, map: string): boolean {
  return vote.mode === "ban" && (vote.tally[map] ?? 0) > 0;
}

// The maps in front so far: the most voted (vote), or those nobody banned
// (ban). Empty while nothing has been cast.
export function leadingMaps(vote: RankedMapVote): string[] {
  if (vote.voted === 0) return [];
  if (vote.mode === "ban") {
    return vote.options.filter((m) => (vote.tally[m] ?? 0) === 0);
  }
  const best = Math.max(...vote.options.map((m) => vote.tally[m] ?? 0));
  return best === 0 ? [] : vote.options.filter((m) => vote.tally[m] === best);
}

// The action a vote of this mode takes.
export const voteAction = (vote: RankedMapVote): "ban" | "vote" => vote.mode;

// Number keys 1..n pick the n-th map; anything else is not a shortcut.
export function mapForKey(options: string[], key: string): string | null {
  if (!/^[1-9]$/.test(key)) return null;
  return options[Number(key) - 1] ?? null;
}
