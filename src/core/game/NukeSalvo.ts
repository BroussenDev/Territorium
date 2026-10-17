import { Tick, UnitType } from "./Game";

// Launch limits that keep the end of a game from turning into a rain of
// bombs (shared by the sim and the build bar, which shows the wait):
// - a salvo: at most NUKE_SALVO_SIZE bombs (atom, hydrogen, EMP) within any
//   NUKE_SALVO_WINDOW_TICKS, per player, however many silos they own;
// - a MIRV, then MIRV_COOLDOWN_TICKS before the same player's next one.
// Ranked games have no MIRV at all (Config.isUnitDisabled).

/** Bombs one player may launch within NUKE_SALVO_WINDOW_TICKS. */
export const NUKE_SALVO_SIZE = 3;

/** The salvo window: one minute. */
export const NUKE_SALVO_WINDOW_TICKS = 60 * 10;

/** Wait between two MIRVs of the same player: four minutes. */
export const MIRV_COOLDOWN_TICKS = 4 * 60 * 10;

/** The bombs a salvo counts. */
export const SALVO_NUKE_TYPES: readonly UnitType[] = [
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.EMPBomb,
];

/** A player's recent launches, as the sim keeps them. */
export interface NukeLaunches {
  /** Ticks of the last salvo bombs launched (the latest NUKE_SALVO_SIZE). */
  salvo: readonly Tick[];
  /** Tick of the last MIRV launched, -1 if none. */
  lastMirv: Tick;
}

/** Ticks before a `type` launch is allowed again at `now`; 0 when it is. */
export function nukeCooldownLeft(
  launches: NukeLaunches,
  type: UnitType,
  now: Tick,
): Tick {
  if (type === UnitType.MIRV) {
    if (launches.lastMirv < 0) return 0;
    return Math.max(0, launches.lastMirv + MIRV_COOLDOWN_TICKS - now);
  }
  if (!SALVO_NUKE_TYPES.includes(type)) return 0;
  const recent = launches.salvo.filter(
    (t) => now - t < NUKE_SALVO_WINDOW_TICKS,
  );
  if (recent.length < NUKE_SALVO_SIZE) return 0;
  // The oldest launch of the salvo leaves the window first.
  return Math.min(...recent) + NUKE_SALVO_WINDOW_TICKS - now;
}

/** `launches` after a `type` launch at `now`. */
export function withNukeLaunch(
  launches: NukeLaunches,
  type: UnitType,
  now: Tick,
): NukeLaunches {
  if (type === UnitType.MIRV) return { ...launches, lastMirv: now };
  if (!SALVO_NUKE_TYPES.includes(type)) return launches;
  return {
    ...launches,
    salvo: [...launches.salvo, now].slice(-NUKE_SALVO_SIZE),
  };
}
