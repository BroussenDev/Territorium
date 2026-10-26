import type { ClientID, StampedIntent } from "../core/Schemas";
import { TgsControls, tgsSwitch } from "./Tgs";

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
 * Anything less certain is left to the end-of-game review. The thresholds
 * come from the admin panel (TgsSettings in Tgs.ts).
 */

export type RankedCancelCode = "TGS-104" | "TGS-105" | "TGS-106";

export interface RankedVerdict {
  code: RankedCancelCode;
  cheaters: ClientID[];
  details: string;
  turn: number;
}

const TURNS_PER_MINUTE = 600;

export class RankedWatch {
  private readonly players: ReadonlySet<ClientID>;
  private readonly recent = new Map<ClientID, number[]>();
  private readonly gifts = new Map<string, number>();
  private decided = false;

  constructor(
    players: readonly ClientID[],
    private readonly switch_: TgsControls = tgsSwitch,
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
    const settings = this.switch_.settings();
    const from = intent.clientID;
    if (!this.players.has(from)) return null;

    if (intent.type === "donate_troops" || intent.type === "donate_gold") {
      const to = intent.recipient;
      if (to !== from && this.players.has(to)) {
        const key = `${from}>${to}`;
        const count = (this.gifts.get(key) ?? 0) + 1;
        this.gifts.set(key, count);
        if (count >= settings.rankedGifts) {
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
    while (turns.length > settings.rhythmWindow) turns.shift();
    this.recent.set(from, turns);
    if (turns.length === settings.rhythmWindow) {
      const span = turns[turns.length - 1] - turns[0];
      if (
        span >= settings.rhythmMinMinutes * TURNS_PER_MINUTE &&
        span <= settings.rhythmMaxMinutes * TURNS_PER_MINUTE
      ) {
        const variation = gapVariation(turns);
        if (variation <= settings.rhythmMaxVariation) {
          return this.decide({
            code: "TGS-105",
            cheaters: [from],
            details: `${turns.length} commandes à intervalles identiques (variation ${variation.toFixed(3)})`,
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
