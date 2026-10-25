import type { ClientID, StampedIntent } from "../core/Schemas";
import { tgsSwitch, TgsSwitch } from "./Tgs";

/**
 * TGS's live watch over a ranked game. Ranked results move ratings, so what
 * TGS is sure of is acted on while the game is played: the game is
 * cancelled, its cheaters sanctioned and everyone else made whole by the
 * API (rankedCancel.js there). Only near-certain signs cancel a game:
 *
 *   TGS-106  two players of the game on the same network (the ranked queue
 *            already keeps them apart, so this means it was gamed)
 *   TGS-104  one player giving troops or gold to the same rival again and
 *            again (ranked is every player for themselves)
 *   TGS-105  a command rhythm no human keeps: the same gap between
 *            commands, over minutes
 *
 * Anything less certain is left to the end-of-game review.
 */

export type RankedCancelCode = "TGS-104" | "TGS-105" | "TGS-106";

export interface RankedVerdict {
  code: RankedCancelCode;
  cheaters: ClientID[];
  details: string;
  turn: number;
}

/** Gifts from one player to the same rival that cancel the game. */
export const LIVE_GIFTS = 3;
/** Commands looked at for the rhythm, and over how long they may spread. */
export const RHYTHM_WINDOW = 120;
const RHYTHM_MIN_TURNS = 1200; // 2 minutes
const RHYTHM_MAX_TURNS = 3600; // 6 minutes
/** Coefficient of variation of the gaps under which no human plays. */
export const RHYTHM_MAX_VARIATION = 0.08;

export class RankedWatch {
  private readonly players: ReadonlySet<ClientID>;
  private readonly recent = new Map<ClientID, number[]>();
  private readonly gifts = new Map<string, number>();
  private decided = false;

  constructor(
    players: readonly ClientID[],
    private readonly switch_: Pick<TgsSwitch, "isEnabled"> = tgsSwitch,
  ) {
    this.players = new Set(players);
  }

  /** At the start: players of the game on the same network. */
  atStart(
    clients: readonly { clientID: ClientID; ip: string }[],
  ): RankedVerdict | null {
    if (!this.switch_.isEnabled() || this.decided) return null;
    const byIP = new Map<string, ClientID[]>();
    for (const c of clients) {
      if (!this.players.has(c.clientID) || c.ip === "") continue;
      byIP.set(c.ip, [...(byIP.get(c.ip) ?? []), c.clientID]);
    }
    const shared = [...byIP.values()].find((g) => new Set(g).size >= 2);
    if (shared === undefined) return null;
    return this.decide({
      code: "TGS-106",
      cheaters: [...new Set(shared)],
      details: `${new Set(shared).size} comptes du même réseau dans la partie classée`,
      turn: 0,
    });
  }

  /** Every intent of the game, as it is queued. */
  observe(intent: StampedIntent, turn: number): RankedVerdict | null {
    if (!this.switch_.isEnabled() || this.decided) return null;
    const from = intent.clientID;
    if (!this.players.has(from)) return null;

    if (intent.type === "donate_troops" || intent.type === "donate_gold") {
      const to = intent.recipient;
      if (to !== from && this.players.has(to)) {
        const key = `${from}>${to}`;
        const count = (this.gifts.get(key) ?? 0) + 1;
        this.gifts.set(key, count);
        if (count >= LIVE_GIFTS) {
          // The receiver is in on it when they gave back too.
          const mutual = (this.gifts.get(`${to}>${from}`) ?? 0) > 0;
          return this.decide({
            code: "TGS-104",
            cheaters: mutual ? [from, to] : [from],
            details: `${count} dons au même adversaire${mutual ? ", dons dans les deux sens" : ""}`,
            turn,
          });
        }
      }
    }

    const turns = this.recent.get(from) ?? [];
    turns.push(turn);
    if (turns.length > RHYTHM_WINDOW) turns.shift();
    this.recent.set(from, turns);
    if (turns.length === RHYTHM_WINDOW) {
      const span = turns[turns.length - 1] - turns[0];
      if (span >= RHYTHM_MIN_TURNS && span <= RHYTHM_MAX_TURNS) {
        const variation = gapVariation(turns);
        if (variation <= RHYTHM_MAX_VARIATION) {
          return this.decide({
            code: "TGS-105",
            cheaters: [from],
            details: `${RHYTHM_WINDOW} commandes à intervalles identiques (variation ${variation.toFixed(3)})`,
            turn,
          });
        }
      }
    }
    return null;
  }

  private decide(verdict: RankedVerdict): RankedVerdict {
    this.decided = true;
    return verdict;
  }
}

/** Coefficient of variation of the gaps between turns. */
export function gapVariation(turns: readonly number[]): number {
  const gaps: number[] = [];
  for (let i = 1; i < turns.length; i++) gaps.push(turns[i] - turns[i - 1]);
  const mean = gaps.reduce((a, b) => a + b, 0) / Math.max(1, gaps.length);
  if (mean === 0) return 1;
  const sd = Math.sqrt(
    gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / Math.max(1, gaps.length),
  );
  return sd / mean;
}
