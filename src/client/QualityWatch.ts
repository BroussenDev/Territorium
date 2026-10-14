import {
  GRAPHICS_QUALITIES,
  type GraphicsQuality,
} from "../core/game/UserSettings";

/**
 * Watches the frame rate during a game and says when a lower graphics
 * quality would help: the first-launch test is an estimate, a real game on
 * a real map is the truth. It only suggests (QualitySuggestion.ts asks the
 * player), never changes the quality on its own.
 *
 * The rate is counted per second of play, and only the seconds that say
 * something count: the window in use (power saving slows the others), and
 * no frame-rate limit of the player's below 60 (their 30 is not a slow
 * computer).
 */

// Under this many frames a second, a second counts as slow.
export const SLOW_FPS = 40;
// Seconds of play looked at, and the share of them that must be slow.
export const WATCH_SECONDS = 90;
export const SLOW_SHARE = 0.7;

export interface QualityAdvice {
  /** The level to offer. */
  quality: GraphicsQuality;
  /** The typical frame rate of the watched seconds. */
  fps: number;
}

/** The level just below `quality`, or null at the lowest. */
export function lowerQuality(quality: GraphicsQuality): GraphicsQuality | null {
  const at = GRAPHICS_QUALITIES.indexOf(quality);
  return at > 0 ? GRAPHICS_QUALITIES[at - 1] : null;
}

export class QualityWatch {
  private secondStart: number | null = null;
  private frames = 0;
  // The frame rate of each counted second, oldest first.
  private seconds: number[] = [];

  /**
   * One drawn frame at `now` (ms). `counts` is false while the second must
   * not count (window not in use, a low frame-rate limit). Returns advice
   * once enough slow seconds have been seen at `quality`, else null.
   */
  recordFrame(
    now: number,
    counts: boolean,
    quality: GraphicsQuality,
  ): QualityAdvice | null {
    if (!counts) {
      this.secondStart = null;
      return null;
    }
    if (this.secondStart === null) {
      this.secondStart = now;
      this.frames = 0;
      return null;
    }
    this.frames++;
    const elapsed = now - this.secondStart;
    if (elapsed < 1000) return null;
    this.seconds.push((this.frames * 1000) / elapsed);
    if (this.seconds.length > WATCH_SECONDS) this.seconds.shift();
    this.secondStart = now;
    this.frames = 0;
    return this.advice(quality);
  }

  /** Forgets what was seen, after the quality changed. */
  reset(): void {
    this.secondStart = null;
    this.frames = 0;
    this.seconds = [];
  }

  private advice(quality: GraphicsQuality): QualityAdvice | null {
    if (this.seconds.length < WATCH_SECONDS) return null;
    const lower = lowerQuality(quality);
    if (lower === null) return null;
    const slow = this.seconds.filter((fps) => fps < SLOW_FPS).length;
    if (slow < this.seconds.length * SLOW_SHARE) return null;
    const sorted = [...this.seconds].sort((a, b) => a - b);
    const fps = Math.round(sorted[Math.floor(sorted.length / 2)]);
    return { quality: lower, fps };
  }
}
