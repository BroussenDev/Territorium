import { createHash } from "crypto";
import {
  AllPlayersStats,
  ClientID,
  ClientSendWinnerMessage,
  LiveStats,
} from "../core/Schemas";
import { VoteRound } from "./VoteTally";

// The simulation runs on the clients, so the outcomes the server has to
// report — who won, and what the board looks like right now — exist only as
// claims from clients. Both are settled by the same IP-weighted majority
// vote (VoteTally.ts); these two classes keep the per-game state around it.
// Who is allowed to vote (not a spectator, not desynced, not kicked) and
// what happens once a vote settles are the game's business, not theirs.

export interface VoteOutcome<T> {
  value: T;
  votes: number;
}

// A fingerprint of a winner vote's per-player stats, so votes can be compared
// on their stats and not just their winner. The stats come from the
// deterministic simulation, so in-sync clients hold the same values, but not
// necessarily in the same key order: keys are sorted at every level before
// hashing. Bigints hash as decimal strings, the form the archive writes them
// in.
export function statsDigest(stats: AllPlayersStats): string {
  const canonical = JSON.stringify(stats, (_key, value: unknown) => {
    if (typeof value === "bigint") return value.toString();
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(obj)
          .sort()
          .map((k) => [k, obj[k]]),
      );
    }
    return value;
  });
  return createHash("sha256").update(canonical).digest("hex");
}

// A cancelled match ends with winner omitted; JSON.stringify(undefined) is
// not a string, so those votes are keyed "null".
function winnerKey(msg: ClientSendWinnerMessage): string {
  return JSON.stringify(msg.winner ?? null);
}

// The end-of-game winner vote. A vote is the whole message: the winner and
// every player's stats, so one voter can't put forged stats in the record by
// agreeing with the majority on the winner (they back a candidate of their
// own). When the stats split but every voter has voted and a majority agrees
// on the winner, the winner is decided without any stats: the result still
// counts (a ranked 1v1 keeps its rating change), and no unverified stats are
// archived. Decided once; the game guards against votes arriving after that.
export class WinnerVote {
  private readonly round = new VoteRound<ClientSendWinnerMessage>();
  private readonly winners = new VoteRound<ClientSendWinnerMessage>();
  private readonly voters = new Set<string>();
  private decided: ClientSendWinnerMessage | null = null;

  // The winning message once a majority has backed one, else null.
  winner(): ClientSendWinnerMessage | null {
    return this.decided;
  }

  // Records a vote from `ip`. Returns the candidate's key and how many unique
  // IPs back it after this vote.
  cast(
    msg: ClientSendWinnerMessage,
    ip: string,
  ): { key: string; votes: number } {
    const key = winnerKey(msg);
    this.voters.add(ip);
    this.winners.add(key, msg, ip);
    return {
      key,
      votes: this.round.add(
        JSON.stringify([key, statsDigest(msg.allPlayersStats)]),
        msg,
        ip,
      ),
    };
  }

  // Decides the vote if some candidate holds a strict majority of an
  // electorate of `electorate` unique IPs.
  tally(electorate: number): VoteOutcome<ClientSendWinnerMessage> | null {
    const result =
      this.round.result(electorate) ??
      (this.voters.size >= electorate
        ? withoutStats(this.winners.result(electorate))
        : null);
    if (result !== null) {
      this.decided = result.value;
    }
    return result;
  }

  // Re-tally against a shrunken electorate: only votes from `activeIPs`
  // count, and only against `activeIPs.size` (see VoteRound.resultAmong).
  tallyAmong(
    activeIPs: Set<string>,
  ): VoteOutcome<ClientSendWinnerMessage> | null {
    const allVoted = [...activeIPs].every((ip) => this.voters.has(ip));
    const result =
      this.round.resultAmong(activeIPs) ??
      (allVoted ? withoutStats(this.winners.resultAmong(activeIPs)) : null);
    if (result !== null) {
      this.decided = result.value;
    }
    return result;
  }
}

// A winner the voters agree on, with the stats they don't agree on left out.
function withoutStats(
  result: VoteOutcome<ClientSendWinnerMessage> | null,
): VoteOutcome<ClientSendWinnerMessage> | null {
  if (result === null) return null;
  return {
    votes: result.votes,
    value: { ...result.value, allPlayersStats: {} },
  };
}

// The running live-stats vote. Clients each send a snapshot every ~10s
// tagged with the turn it was taken at; in-sync clients produce an identical
// snapshot for a given turn, so a majority settles it and the latest settled
// snapshot is what the admin bot reads.
export class LiveStatsVote {
  // Bound on the pending rounds in case consensus is never reached for some
  // turns (e.g. a persistent desync). Maps iterate in insertion order and
  // turns arrive ascending, so pruning drops the oldest pending rounds.
  private static readonly MAX_PENDING_ROUNDS = 20;

  // Tallies keyed by turn number; an entry is removed once consensus is
  // reached for that turn (or a later one) so the map stays small.
  private readonly rounds: Map<
    number,
    { round: VoteRound<LiveStats>; voters: Set<ClientID> }
  > = new Map();
  private settled: LiveStats | null = null;

  // The latest snapshot a majority agreed on, or null before the first.
  latest(): LiveStats | null {
    return this.settled;
  }

  // Records a client's snapshot, one vote per client per turn, against an
  // electorate of `electorate` unique IPs. Returns whether this vote settled
  // its turn. Turns at or before the latest settled one are ignored.
  cast(
    clientID: ClientID,
    ip: string,
    stats: LiveStats,
    electorate: number,
  ): boolean {
    const turn = stats.turn;
    if (this.settled !== null && turn <= this.settled.turn) {
      return false;
    }

    let entry = this.rounds.get(turn);
    if (entry === undefined) {
      entry = { round: new VoteRound<LiveStats>(), voters: new Set() };
      this.rounds.set(turn, entry);
      this.prune();
    }
    if (entry.voters.has(clientID)) {
      return false;
    }
    entry.voters.add(clientID);

    entry.round.add(JSON.stringify(stats), stats, ip);
    const result = entry.round.result(electorate);
    if (result === null) {
      return false;
    }

    this.settled = result.value;
    // This turn (and any older still-pending ones) are now settled.
    for (const t of this.rounds.keys()) {
      if (t <= turn) {
        this.rounds.delete(t);
      }
    }
    return true;
  }

  private prune(): void {
    while (this.rounds.size > LiveStatsVote.MAX_PENDING_ROUNDS) {
      const oldest = this.rounds.keys().next().value;
      if (oldest === undefined) break;
      this.rounds.delete(oldest);
    }
  }
}
