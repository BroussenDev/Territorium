import type { AttackLogicInput, Config } from "../configuration/Config";

/** What an attack is likely to do, for the attack preview. */
export interface AttackEstimate {
  /** Troops the attack starts with. */
  sent: number;
  /** Troops the attack loses before it stops. */
  lost: number;
  /** Tiles it takes. */
  tiles: number;
  /** How long it runs, in seconds. */
  seconds: number;
  /** True when it takes every tile the defender has. */
  wipesOut: boolean;
}

// Most tiles an estimate walks through: an attack on open land has no
// defender to run out of tiles, and the preview only needs the order of
// magnitude past this.
export const ESTIMATE_MAX_TILES = 5_000;

/**
 * Plays an attack out tile by tile with the same rules as the simulation
 * (Config.attackLogic): the attack loses troops on each tile, the defender
 * loses its troops per tile, and the front takes `borderSize` worth of tiles
 * per tick. Assumes every tile has the terrain and modifiers of `base` and
 * that the defender sends no reinforcements, so it is an estimate.
 */
export function estimateAttack(
  config: Config,
  base: Omit<AttackLogicInput, "attackTroops">,
  attackTroops: number,
  maxTiles: number = ESTIMATE_MAX_TILES,
): AttackEstimate {
  let troops = attackTroops;
  let ticks = 0;
  let tiles = 0;
  let defender = base.defender === null ? null : { ...base.defender };
  const limit =
    defender === null ? maxTiles : Math.min(maxTiles, defender.numTiles);
  while (troops >= 1 && tiles < limit) {
    const result = config.attackLogic({
      ...base,
      defender,
      attackTroops: troops,
    });
    troops -= result.attackerTroopLoss;
    ticks += result.tickFraction;
    tiles++;
    if (defender !== null) {
      defender = {
        ...defender,
        troops: Math.max(0, defender.troops - result.defenderTroopLoss),
        numTiles: Math.max(1, defender.numTiles - 1),
      };
    }
  }
  return {
    sent: attackTroops,
    lost: Math.round(attackTroops - Math.max(0, troops)),
    tiles,
    seconds: ticks / 10,
    wipesOut: base.defender !== null && tiles >= base.defender.numTiles,
  };
}
