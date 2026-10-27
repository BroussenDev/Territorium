// What the end-of-game screen works out about the local player's game: their
// finishing place, a few surprise highlights that change from game to game,
// the personal records they just beat and the next challenge within reach.
// Pure helpers, fed by the win modal.

import { UnitType } from "../../core/game/Game";

/** One player as the finishing order sees them (bots never count). */
export interface PlacePlayer {
  isMe: boolean;
  isWinner: boolean;
  alive: boolean;
  spawned: boolean;
  tiles: number;
  /** Place stamped by the simulation when the player fell, if they did. */
  deathPosition: number | null;
}

/**
 * The local player's place out of everyone who played: the place stamped at
 * their elimination, else first for the winner, else ranked by land among the
 * players still standing (the winner always ahead). Null when the local
 * player never spawned.
 */
export function finishPlace(
  players: PlacePlayer[],
): { place: number; total: number } | null {
  const me = players.find((p) => p.isMe);
  if (me === undefined || !me.spawned) return null;
  const total = players.filter((p) => p.spawned).length;
  let place: number;
  if (me.isWinner) {
    place = 1;
  } else if (!me.alive && me.deathPosition !== null) {
    place = me.deathPosition;
  } else {
    place =
      1 +
      players.filter(
        (p) =>
          !p.isMe && p.alive && p.spawned && (p.isWinner || p.tiles > me.tiles),
      ).length;
  }
  return { place: Math.min(place, total), total: Math.max(total, 1) };
}

export const HIGHLIGHT_KEYS = [
  "mirv",
  "hbomb",
  "abomb",
  "landings",
  "warships",
  "cities",
  "trade",
  "defense",
  "eliminations",
  "biggest_attack",
  "peak_gold",
  "attacks_endured",
  "fronts",
] as const;
export type HighlightKey = (typeof HIGHLIGHT_KEYS)[number];

const COUNTED_UNITS: Partial<Record<UnitType, HighlightKey>> = {
  [UnitType.MIRV]: "mirv",
  [UnitType.HydrogenBomb]: "hbomb",
  [UnitType.AtomBomb]: "abomb",
  [UnitType.TransportShip]: "landings",
  [UnitType.Warship]: "warships",
  [UnitType.City]: "cities",
  [UnitType.TradeShip]: "trade",
  [UnitType.DefensePost]: "defense",
};

/**
 * Counts what the local player did, from the game updates the client already
 * receives: a unit counts as theirs when it first appears under their flag
 * (captured units first appeared under someone else's).
 */
export class GameHighlights {
  private readonly seenUnits = new Set<number>();
  private readonly incoming = new Set<string>();
  private readonly values = new Map<HighlightKey, number>();

  private add(key: HighlightKey, n = 1) {
    this.values.set(key, (this.values.get(key) ?? 0) + n);
  }

  private max(key: HighlightKey, n: number) {
    if (n > (this.values.get(key) ?? 0)) this.values.set(key, n);
  }

  unit(id: number, unitType: UnitType, ownerID: number, mySmallID: number) {
    if (this.seenUnits.has(id)) return;
    this.seenUnits.add(id);
    const key = COUNTED_UNITS[unitType];
    if (key !== undefined && ownerID === mySmallID) this.add(key);
  }

  conquest(conquerorIsMe: boolean) {
    if (conquerorIsMe) this.add("eliminations");
  }

  /** One sample of the local player's attacks and treasury. */
  sample(outgoingTroops: number[], incomingAttackIDs: string[], gold: number) {
    for (const troops of outgoingTroops) this.max("biggest_attack", troops);
    this.max("fronts", outgoingTroops.length);
    for (const id of incomingAttackIDs) {
      if (this.incoming.has(id)) continue;
      this.incoming.add(id);
      this.add("attacks_endured");
    }
    this.max("peak_gold", gold);
  }

  value(key: HighlightKey): number {
    return this.values.get(key) ?? 0;
  }

  /** Every highlight worth showing: something actually happened. */
  candidates(): { key: HighlightKey; value: number }[] {
    return HIGHLIGHT_KEYS.map((key) => ({
      key,
      value: this.value(key),
    })).filter(
      // One front at a time is no feat.
      (h) => h.value > (h.key === "fronts" ? 1 : 0),
    );
  }
}

/** `n` of the candidates in a random order, so each game tells a new story. */
export function pickHighlights<T>(
  candidates: T[],
  n: number,
  random: () => number = Math.random,
): T[] {
  const pool = [...candidates];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

/** Personal bests kept on this device. Places only count in real games. */
export interface EndRecords {
  bestPlace?: number;
  peakShare?: number;
  survivalSeconds?: number;
  eliminations?: number;
  biggestAttack?: number;
}
export type RecordKey = keyof EndRecords;

export interface GameFigures {
  place: number | null;
  peakShare: number;
  survivalSeconds: number;
  eliminations: number;
  biggestAttack: number;
}

// A place among fewer players than this proves little.
export const MIN_PLAYERS_FOR_PLACE_RECORD = 5;
const RECORDS_KEY = "territorium.endRecords.v1";

/**
 * The records this game beat, and the records once updated. The very first
 * game sets the marks without announcing them: a record needs something to
 * beat.
 */
export function compareRecords(
  previous: EndRecords,
  game: GameFigures,
): { beaten: RecordKey[]; next: EndRecords } {
  const next: EndRecords = { ...previous };
  const beaten: RecordKey[] = [];
  const higher = (key: Exclude<RecordKey, "bestPlace">, value: number) => {
    if (value <= 0) return;
    const old = previous[key];
    if (old === undefined || value > old) {
      next[key] = value;
      if (old !== undefined) beaten.push(key);
    }
  };
  if (game.place !== null) {
    const old = previous.bestPlace;
    if (old === undefined || game.place < old) {
      next.bestPlace = game.place;
      if (old !== undefined) beaten.push("bestPlace");
    }
  }
  higher("peakShare", Math.floor(game.peakShare * 10) / 10);
  higher("survivalSeconds", Math.floor(game.survivalSeconds));
  higher("eliminations", game.eliminations);
  higher("biggestAttack", game.biggestAttack);
  return { beaten, next };
}

export function loadRecords(): EndRecords {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    const parsed: unknown = raw === null ? null : JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};
    const out: EndRecords = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        out[key as RecordKey] = value;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRecords(records: EndRecords): void {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Private window or blocked storage: records simply don't persist.
  }
}

/** A challenge as the next-goal line needs it. */
export interface GoalChallenge {
  template: string;
  period: string;
  target: number;
  progress: number;
  completed: boolean;
}

/** The unfinished challenge closest to done, the reason to play once more. */
export function nextGoal<T extends GoalChallenge>(challenges: T[]): T | null {
  let best: T | null = null;
  let bestRatio = -1;
  for (const c of challenges) {
    if (c.completed || c.target <= 0) continue;
    const ratio = Math.min(c.progress, c.target) / c.target;
    if (ratio > bestRatio) {
      best = c;
      bestRatio = ratio;
    }
  }
  return best;
}
