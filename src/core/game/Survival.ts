// Survival mode (gameVariant "survival"): every human on one team against
// waves of AI invaders that grow with each wave. Survive the last wave and
// wipe it out to win; the game is lost when no defender is left.
//
// The invaders never cheat: they play under the human rules (same starting
// troops, troop cap and growth as a player, see Config) whatever the
// lobby's difficulty, and grow stronger only by their numbers.

/** Waves in a game. */
export const SURVIVAL_WAVES = 10;

/** Ticks after the spawn phase before the first wave lands (1 minute). */
export const SURVIVAL_FIRST_WAVE_DELAY_TICKS = 60 * 10;

/** Ticks between two waves (2 minutes 30). */
export const SURVIVAL_WAVE_INTERVAL_TICKS = 150 * 10;

/** Most invaders a single wave brings, whatever the number of defenders. */
export const SURVIVAL_MAX_WAVE_SIZE = 40;

/**
 * Invaders in wave `wave` (1-based) against `defenders` humans: three
 * quarters of the defenders at first, a quarter more each wave, so the last
 * wave brings three times as many invaders as there are defenders.
 */
export function survivalWaveSize(wave: number, defenders: number): number {
  const size = Math.round((defenders * (2 + wave)) / 4);
  return Math.min(SURVIVAL_MAX_WAVE_SIZE, Math.max(1, size));
}

/**
 * When wave `wave` (1-based) lands, in ticks since the spawn phase ended
 * (Game.ticksSinceStart).
 */
export function survivalWaveTick(wave: number): number {
  return (
    SURVIVAL_FIRST_WAVE_DELAY_TICKS + (wave - 1) * SURVIVAL_WAVE_INTERVAL_TICKS
  );
}

/**
 * Where a game stands `sinceStart` ticks after the spawn phase: the last
 * wave that landed (0 before the first) and when the next one lands, in the
 * same ticks (null once all have).
 */
export function survivalWaveState(sinceStart: number): {
  wave: number;
  nextWaveTick: number | null;
} {
  let wave = 0;
  while (wave < SURVIVAL_WAVES && survivalWaveTick(wave + 1) <= sinceStart) {
    wave++;
  }
  return {
    wave,
    nextWaveTick: wave < SURVIVAL_WAVES ? survivalWaveTick(wave + 1) : null,
  };
}
