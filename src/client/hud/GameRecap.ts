// What the end-of-game screen tells a player about their own game: how big
// they got, their best minute, how long they lasted and who finished them.
// Fed one sample per game second by the win modal.

/** One game second of the local player, as the win modal sees it. */
export interface RecapSample {
  /** Seconds since the spawn phase ended. */
  second: number;
  tiles: number;
  troops: number;
  /** Small ID of the player sending the most troops at us, or null. */
  mainAttacker: number | null;
  /** IDs of the attacks we are sending. */
  outgoingAttackIDs: string[];
}

export interface RecapSummary {
  peakTiles: number;
  /** Peak tiles as a share of the map's land, in percent. */
  peakShare: number;
  peakTroops: number;
  /** Most tiles won over one minute, and the second that minute ended. */
  bestMinuteGain: number;
  bestMinuteEnd: number;
  attacksLaunched: number;
  secondsPlayed: number;
  /** Small ID of the last player who attacked us before we fell. */
  eliminatedBy: number | null;
}

const MINUTE = 60;

export class GameRecap {
  private peakTiles = 0;
  private peakTroops = 0;
  private bestMinuteGain = 0;
  private bestMinuteEnd = 0;
  private lastSecond = 0;
  private lastAttacker: number | null = null;
  private readonly attacks = new Set<string>();
  // Tiles owned at each second of the last minute, oldest first.
  private readonly window: { second: number; tiles: number }[] = [];

  constructor(private readonly landTiles: number) {}

  add(sample: RecapSample): void {
    this.lastSecond = sample.second;
    this.peakTiles = Math.max(this.peakTiles, sample.tiles);
    this.peakTroops = Math.max(this.peakTroops, sample.troops);
    if (sample.mainAttacker !== null) this.lastAttacker = sample.mainAttacker;
    for (const id of sample.outgoingAttackIDs) this.attacks.add(id);

    this.window.push({ second: sample.second, tiles: sample.tiles });
    while (this.window[0].second < sample.second - MINUTE) this.window.shift();
    const gain = sample.tiles - this.window[0].tiles;
    if (gain > this.bestMinuteGain) {
      this.bestMinuteGain = gain;
      this.bestMinuteEnd = sample.second;
    }
  }

  summary(alive: boolean): RecapSummary {
    return {
      peakTiles: this.peakTiles,
      peakShare:
        this.landTiles > 0 ? (this.peakTiles / this.landTiles) * 100 : 0,
      peakTroops: this.peakTroops,
      bestMinuteGain: this.bestMinuteGain,
      bestMinuteEnd: this.bestMinuteEnd,
      attacksLaunched: this.attacks.size,
      secondsPlayed: this.lastSecond,
      eliminatedBy: alive ? null : this.lastAttacker,
    };
  }
}

/** The attacker sending the most troops, among incoming attacks. */
export function mainAttacker(
  incoming: { attackerID: number; troops: number; retreating: boolean }[],
): number | null {
  let best: { attackerID: number; troops: number } | null = null;
  for (const attack of incoming) {
    if (attack.retreating) continue;
    if (best === null || attack.troops > best.troops) best = attack;
  }
  return best?.attackerID ?? null;
}
