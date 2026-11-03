/**
 * Contextual in-game tips for new players (see hud/layers/GameTips.ts).
 *
 * Pure rules: a snapshot of the local player's state goes in, at most one tip
 * id comes out. No DOM, no GameView, no storage, so the timing and the
 * once-only logic can be tested directly.
 */

/** Tips in priority order: the first due one that was not shown yet wins. */
export const GAME_TIP_IDS = [
  "spawn",
  "under_attack",
  "gold_unused",
  "troops_max",
  "attack_ratio_high",
  "no_city",
  "coastal_no_port",
  "alliance_request_pending",
  "nation_neighbour",
  "frontier_long",
  "alliances",
  "radial_menu",
] as const;

export type GameTipId = (typeof GAME_TIP_IDS)[number];

/** Translation key of each tip's text. */
export const GAME_TIP_KEYS: Record<GameTipId, string> = {
  spawn: "game_tips.spawn",
  under_attack: "game_tips.under_attack",
  gold_unused: "game_tips.gold_unused",
  troops_max: "game_tips.troops_max",
  attack_ratio_high: "game_tips.attack_ratio_high",
  no_city: "game_tips.no_city",
  coastal_no_port: "game_tips.coastal_no_port",
  alliance_request_pending: "game_tips.alliance_request_pending",
  nation_neighbour: "game_tips.nation_neighbour",
  frontier_long: "game_tips.frontier_long",
  alliances: "game_tips.alliances",
  radial_menu: "game_tips.radial_menu",
};

/** At most one tip starts within this window of the previous one. */
export const GAME_TIP_MIN_INTERVAL_MS = 45_000;

/** No tip in the first seconds after the local player spawns. */
export const GAME_TIP_START_DELAY_SECONDS = 10;

/** Share of max troops that counts as "at the cap". */
const TROOPS_AT_MAX_RATIO = 0.97;
/** Gold worth a warning, in multiples of the next city's price. */
const GOLD_UNUSED_CITY_MULTIPLE = 2;
/** Attack ratio above which the attack leaves almost nothing at home. */
const ATTACK_RATIO_HIGH = 0.8;
/** Border tiles from which a border counts as a long frontier. */
const FRONTIER_TILES_LONG = 200;
/** Neighbours from which a frontier counts as surrounded. */
const NEIGHBOURS_SURROUNDED = 4;

export interface GameTipSnapshot {
  /** Ranked games never show tips. */
  ranked: boolean;
  /** Replays, dead players and players without a player: no tips. */
  spectating: boolean;
  inSpawnPhase: boolean;
  hasSpawned: boolean;
  /** Seconds since the local player spawned, null before the spawn. */
  secondsSinceSpawn: number | null;
  /** Seconds since the game started; 0 during the spawn phase. */
  elapsedSeconds: number;
  troops: number;
  maxTroops: number;
  gold: number;
  /** Price of the next city, 0 when not known yet. */
  cityCost: number;
  cityCount: number;
  portCount: number;
  /** Owns a tile on the shore of any water body. */
  isCoastal: boolean;
  /** Distinct players sharing a border with us. */
  neighbourCount: number;
  /** Of those neighbours, how many are AI nations. */
  nationNeighbourCount: number;
  /** Number of our tiles on the border (the length of the frontier). */
  frontierTiles: number;
  /** Attacks currently aimed at us (retreating ones excluded). */
  incomingAttackCount: number;
  /** Attack ratio, 0 to 1. */
  attackRatio: number;
  hasAlliance: boolean;
  /** We sent an alliance request that is still waiting for an answer. */
  hasOutgoingAllianceRequest: boolean;
}

export interface GameTipHistory {
  /** Tips already shown to this player. */
  readonly shown: ReadonlySet<GameTipId>;
  /** When the last tip started, in the same clock as `nowMs`. */
  readonly lastShownAtMs: number;
}

/** History for a player who has seen no tip yet. */
export const EMPTY_GAME_TIP_HISTORY: GameTipHistory = {
  shown: new Set<GameTipId>(),
  lastShownAtMs: -Infinity,
};

/**
 * The tip to show now, or null. Callers record the result in their history
 * when they display it.
 */
export function pickGameTip(
  snapshot: GameTipSnapshot,
  history: GameTipHistory,
  nowMs: number,
): GameTipId | null {
  if (snapshot.ranked || snapshot.spectating) return null;
  if (nowMs - history.lastShownAtMs < GAME_TIP_MIN_INTERVAL_MS) return null;
  for (const id of GAME_TIP_IDS) {
    if (history.shown.has(id)) continue;
    if (isGameTipDue(id, snapshot)) return id;
  }
  return null;
}

/** Whether the condition for `id` holds in this snapshot. */
export function isGameTipDue(id: GameTipId, s: GameTipSnapshot): boolean {
  if (id === "spawn") return s.inSpawnPhase && !s.hasSpawned;
  // Everything else needs a living player on a started map, and waits a few
  // seconds after the spawn so the first moments are not crowded.
  if (s.inSpawnPhase || !s.hasSpawned) return false;
  if (
    s.secondsSinceSpawn === null ||
    s.secondsSinceSpawn < GAME_TIP_START_DELAY_SECONDS
  ) {
    return false;
  }
  const t = s.elapsedSeconds;
  switch (id) {
    case "under_attack":
      return s.incomingAttackCount > 0;
    case "gold_unused":
      return (
        t >= 60 &&
        s.cityCost > 0 &&
        s.gold >= s.cityCost * GOLD_UNUSED_CITY_MULTIPLE
      );
    case "troops_max":
      return (
        t >= 30 &&
        s.maxTroops > 0 &&
        s.troops >= s.maxTroops * TROOPS_AT_MAX_RATIO
      );
    case "attack_ratio_high":
      return t >= 30 && s.attackRatio > ATTACK_RATIO_HIGH;
    case "no_city":
      return t >= 180 && s.cityCount === 0;
    case "coastal_no_port":
      return t >= 240 && s.isCoastal && s.portCount === 0;
    case "alliance_request_pending":
      return s.hasOutgoingAllianceRequest;
    case "nation_neighbour":
      return t >= 60 && s.nationNeighbourCount > 0;
    case "frontier_long":
      return (
        t >= 120 &&
        s.neighbourCount >= NEIGHBOURS_SURROUNDED &&
        s.frontierTiles >= FRONTIER_TILES_LONG
      );
    case "alliances":
      return t >= 150 && s.neighbourCount > 0 && !s.hasAlliance;
    case "radial_menu":
      return t >= 60;
  }
}
