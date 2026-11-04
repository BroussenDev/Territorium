/**
 * "Moments forts": short commentator-style banners when something notable
 * happens in a game (see hud/layers/HighlightBanner.ts).
 *
 * Pure rules, presentation only: a snapshot of the game goes in, at most one
 * highlight comes out. No DOM, no GameView, no storage, so every rule and the
 * rate limit can be tested directly. Time is game seconds.
 */

export type HighlightKind =
  | "giant_fallen"
  | "killing_spree"
  | "domination"
  | "lead_change"
  | "total_war"
  | "comeback";

/** Priority order: the first kind wins when several are waiting. */
export const HIGHLIGHT_PRIORITY: readonly HighlightKind[] = [
  "giant_fallen",
  "killing_spree",
  "domination",
  "lead_change",
  "total_war",
  "comeback",
];

/** Translation key of each highlight's text. */
export const HIGHLIGHT_KEYS: Record<HighlightKind, string> = {
  giant_fallen: "highlights.giant_fallen",
  killing_spree: "highlights.killing_spree",
  domination: "highlights.domination",
  lead_change: "highlights.lead_change",
  total_war: "highlights.total_war",
  comeback: "highlights.comeback",
};

export const DOMINATION_THRESHOLDS = [25, 40, 60] as const;
/** At most one banner per this many game seconds. */
export const HIGHLIGHT_MIN_GAP_S = 25;
/** A waiting highlight older than this is no longer news. */
export const HIGHLIGHT_STALE_S = 30;
/** The same player is the subject of a banner at most this often. */
export const HIGHLIGHT_PLAYER_COOLDOWN_S = 120;
/** A lead must last this long before losing it is a turn of events. */
export const LEAD_MIN_DURATION_S = 90;
/** Eliminations within this window make a streak. */
export const SPREE_WINDOW_S = 300;
export const SPREE_MILESTONES = [3, 5, 8] as const;
/** Two players are "at war" after attacking each other this long. */
export const WAR_MIN_DURATION_S = 15;
export const WAR_TOP_RANK = 5;
/** A comeback needs at least this many contenders, and a game this old. */
export const COMEBACK_MIN_PLAYERS = 6;
export const COMEBACK_MIN_ELAPSED_S = 60;
export const GIANT_TOP_RANK = 3;

export interface HighlightPlayer {
  id: string;
  name: string;
  tiles: number;
  alive: boolean;
  /** Bots are scenery: they never rank and never count as victims. */
  isBot: boolean;
  /** Per target player id: troops of the attacks launched at it. */
  attacking: ReadonlyMap<string, number>;
}

export interface HighlightSnapshot {
  elapsedSeconds: number;
  inSpawnPhase: boolean;
  landTiles: number;
  players: readonly HighlightPlayer[];
}

export interface Highlight {
  kind: HighlightKind;
  /** Values for the translation (name, percent, count, a, b). */
  params: Record<string, string | number>;
  /** Players the banner is about, for the per-player cooldown. */
  subjects: string[];
}

interface Pending {
  highlight: Highlight;
  createdAt: number;
}

/** Territory share in whole percent, rounded down. */
export function territoryPercent(tiles: number, landTiles: number): number {
  if (landTiles <= 0) return 0;
  return Math.floor((tiles * 100) / landTiles);
}

/** Highest threshold reached by this share, or null. */
export function dominationThreshold(percent: number): number | null {
  let reached: number | null = null;
  for (const t of DOMINATION_THRESHOLDS) if (percent >= t) reached = t;
  return reached;
}

/** Alive non-bot players, biggest first (ties by id, so it is stable). */
export function rankPlayers(
  players: readonly HighlightPlayer[],
): HighlightPlayer[] {
  return players
    .filter((p) => p.alive && !p.isBot && p.tiles > 0)
    .sort((a, b) => b.tiles - a.tiles || (a.id < b.id ? -1 : 1));
}

export class HighlightTracker {
  private pending: Pending[] = [];
  private lastShownAt = -Infinity;
  private playerShownAt = new Map<string, number>();
  private fired = new Set<string>();

  private baselined = false;
  private leaderId: string | null = null;
  private leaderSince = 0;
  private previousTop = new Set<string>();
  private previousAlive = new Set<string>();
  private previousNames = new Map<string, string>();
  private previousAttacking = new Map<string, ReadonlyMap<string, number>>();
  private kills = new Map<string, number[]>();
  private warSince = new Map<string, number>();
  private wasLast = new Set<string>();

  /** Feeds a snapshot; returns the highlight to show now, if any. */
  update(snap: HighlightSnapshot): Highlight | null {
    // Nothing happens, and nothing is learned, during the spawn phase.
    if (snap.inSpawnPhase) return null;
    const now = snap.elapsedSeconds;
    const ranked = rankPlayers(snap.players);

    if (this.baselined) {
      this.detectEliminations(snap, now);
      this.detectDomination(ranked, snap.landTiles, now);
      this.detectLeadChange(ranked, now);
      this.detectWar(ranked, now);
      this.detectComeback(ranked, now);
    } else {
      this.baselined = true;
      this.leaderId = ranked[0]?.id ?? null;
      this.leaderSince = now;
      // What was already true at the first look is not news.
      for (const p of ranked) {
        this.markDominated(
          p.id,
          dominationThreshold(territoryPercent(p.tiles, snap.landTiles)),
        );
      }
    }
    this.remember(snap, ranked);
    return this.pick(now);
  }

  private remember(snap: HighlightSnapshot, ranked: HighlightPlayer[]) {
    this.previousTop = new Set(
      ranked.slice(0, GIANT_TOP_RANK).map((p) => p.id),
    );
    this.previousAlive = new Set(
      snap.players.filter((p) => p.alive && !p.isBot).map((p) => p.id),
    );
    this.previousNames = new Map(snap.players.map((p) => [p.id, p.name]));
    this.previousAttacking = new Map(
      snap.players.map((p) => [p.id, p.attacking]),
    );
  }

  private push(highlight: Highlight, now: number) {
    this.pending.push({ highlight, createdAt: now });
  }

  private markDominated(id: string, threshold: number | null) {
    if (threshold === null) return;
    for (const th of DOMINATION_THRESHOLDS) {
      if (th <= threshold) this.fired.add(`domination:${id}:${th}`);
    }
  }

  private detectEliminations(snap: HighlightSnapshot, now: number) {
    const aliveNow = new Set(
      snap.players.filter((p) => p.alive).map((p) => p.id),
    );
    for (const id of this.previousAlive) {
      if (aliveNow.has(id)) continue;
      const name = this.previousNames.get(id) ?? id;
      if (this.previousTop.has(id)) {
        this.push(
          { kind: "giant_fallen", params: { name }, subjects: [id] },
          now,
        );
      }
      const killer = this.killerOf(id, snap);
      if (killer === null) continue;
      const times = (this.kills.get(killer.id) ?? []).filter(
        (t) => now - t <= SPREE_WINDOW_S,
      );
      times.push(now);
      this.kills.set(killer.id, times);
      const count = times.length;
      const key = `spree:${killer.id}:${count}`;
      if (
        (SPREE_MILESTONES as readonly number[]).includes(count) &&
        !this.fired.has(key)
      ) {
        this.fired.add(key);
        this.push(
          {
            kind: "killing_spree",
            params: { name: killer.name, count },
            subjects: [killer.id],
          },
          now,
        );
      }
    }
  }

  /** The living player that was sending the most troops at the victim. */
  private killerOf(
    victimId: string,
    snap: HighlightSnapshot,
  ): HighlightPlayer | null {
    let best: HighlightPlayer | null = null;
    let bestTroops = 0;
    for (const p of snap.players) {
      if (!p.alive || p.id === victimId) continue;
      const troops = this.previousAttacking.get(p.id)?.get(victimId) ?? 0;
      if (troops > bestTroops) {
        best = p;
        bestTroops = troops;
      }
    }
    return best;
  }

  private detectDomination(
    ranked: HighlightPlayer[],
    landTiles: number,
    now: number,
  ) {
    for (const p of ranked) {
      const t = dominationThreshold(territoryPercent(p.tiles, landTiles));
      if (t === null || this.fired.has(`domination:${p.id}:${t}`)) continue;
      this.markDominated(p.id, t);
      this.push(
        {
          kind: "domination",
          params: { name: p.name, percent: t },
          subjects: [p.id],
        },
        now,
      );
    }
  }

  private detectLeadChange(ranked: HighlightPlayer[], now: number) {
    const top = ranked[0];
    if (top === undefined) return;
    if (this.leaderId === null) {
      this.leaderId = top.id;
      this.leaderSince = now;
      return;
    }
    if (top.id === this.leaderId) return;
    const ledFor = now - this.leaderSince;
    // A dead leader is not overtaken; a short lead is not worth a banner.
    const overtook = ranked.some((p) => p.id === this.leaderId);
    this.leaderId = top.id;
    this.leaderSince = now;
    if (!overtook || ledFor < LEAD_MIN_DURATION_S) return;
    this.push(
      { kind: "lead_change", params: { name: top.name }, subjects: [top.id] },
      now,
    );
  }

  private detectWar(ranked: HighlightPlayer[], now: number) {
    const big = ranked.slice(0, WAR_TOP_RANK);
    const live = new Set<string>();
    for (let i = 0; i < big.length; i++) {
      for (let j = i + 1; j < big.length; j++) {
        const a = big[i];
        const b = big[j];
        if (!(a.attacking.has(b.id) && b.attacking.has(a.id))) continue;
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        live.add(key);
        const since = this.warSince.get(key) ?? now;
        this.warSince.set(key, since);
        if (
          now - since >= WAR_MIN_DURATION_S &&
          !this.fired.has(`war:${key}`)
        ) {
          this.fired.add(`war:${key}`);
          this.push(
            {
              kind: "total_war",
              params: { a: a.name, b: b.name },
              subjects: [a.id, b.id],
            },
            now,
          );
        }
      }
    }
    for (const key of [...this.warSince.keys()]) {
      if (!live.has(key)) this.warSince.delete(key);
    }
  }

  private detectComeback(ranked: HighlightPlayer[], now: number) {
    if (ranked.length < COMEBACK_MIN_PLAYERS || now < COMEBACK_MIN_ELAPSED_S) {
      return;
    }
    this.wasLast.add(ranked[ranked.length - 1].id);
    for (const p of ranked.slice(0, GIANT_TOP_RANK)) {
      if (!this.wasLast.delete(p.id)) continue;
      if (this.fired.has(`comeback:${p.id}`)) continue;
      this.fired.add(`comeback:${p.id}`);
      this.push(
        { kind: "comeback", params: { name: p.name }, subjects: [p.id] },
        now,
      );
    }
  }

  /** The waiting highlight to show now, honouring the rate limit. */
  private pick(now: number): Highlight | null {
    this.pending = this.pending.filter(
      (p) => now - p.createdAt <= HIGHLIGHT_STALE_S,
    );
    if (now - this.lastShownAt < HIGHLIGHT_MIN_GAP_S) return null;
    // Drop what is about a player that just had a banner.
    this.pending = this.pending.filter((p) =>
      p.highlight.subjects.every(
        (id) =>
          now - (this.playerShownAt.get(id) ?? -Infinity) >=
          HIGHLIGHT_PLAYER_COOLDOWN_S,
      ),
    );
    let bestIndex = -1;
    let bestRank = Infinity;
    this.pending.forEach((p, i) => {
      const rank = HIGHLIGHT_PRIORITY.indexOf(p.highlight.kind);
      if (rank < bestRank) {
        bestRank = rank;
        bestIndex = i;
      }
    });
    if (bestIndex < 0) return null;
    const [chosen] = this.pending.splice(bestIndex, 1);
    this.lastShownAt = now;
    for (const id of chosen.highlight.subjects) this.playerShownAt.set(id, now);
    return chosen.highlight;
  }
}
