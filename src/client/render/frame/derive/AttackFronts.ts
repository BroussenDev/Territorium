/** Matches the renderer's relation texture: one slot per player smallID. */
export const ATTACK_FRONT_SIZE = 1024;
/** The local player is attacking this player. */
export const FRONT_OUTGOING = 1;
/** This player is attacking the local player. */
export const FRONT_INCOMING = 2;

/** Reusable buffer — one allocation, rewritten each tick. */
const fronts = new Uint8Array(ATTACK_FRONT_SIZE);

interface AttackSide {
  readonly attackerID: number;
  readonly targetID: number;
  readonly retreating: boolean;
}

/**
 * Per-player flags for the local player's live land fronts, indexed by
 * smallID: FRONT_OUTGOING for players they attack, FRONT_INCOMING for players
 * attacking them (both bits when the two attack each other). Attacks on
 * unclaimed land (smallID 0) and retreats are left out.
 */
export function buildAttackFronts(
  outgoing: readonly AttackSide[],
  incoming: readonly AttackSide[],
): Uint8Array {
  fronts.fill(0);
  for (const a of outgoing) {
    if (a.retreating) continue;
    if (a.targetID > 0 && a.targetID < ATTACK_FRONT_SIZE) {
      fronts[a.targetID] |= FRONT_OUTGOING;
    }
  }
  for (const a of incoming) {
    if (a.retreating) continue;
    if (a.attackerID > 0 && a.attackerID < ATTACK_FRONT_SIZE) {
      fronts[a.attackerID] |= FRONT_INCOMING;
    }
  }
  return fronts;
}
