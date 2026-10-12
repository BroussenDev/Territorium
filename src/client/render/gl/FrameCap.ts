import { UserSettings } from "../../../core/game/UserSettings";

// The player's frame-rate cap (Settings > Graphics). Laptops in particular
// run cooler, quieter and longer on battery at 30 or 60 frames a second than
// at a 144 Hz display's rate. The game itself is unaffected: the simulation
// runs in its worker at its own pace, and animations follow game ticks or
// the clock, not the frame count.

// requestAnimationFrame lands on the display's vsync, a little early or late
// each time; without this slack a 60 cap on a 60 Hz display would skip every
// frame that arrived a fraction of a millisecond early, halving the rate.
const VSYNC_SLACK = 0.85;

/** Whether a frame arriving at `now` should be drawn, given the last one. */
export function shouldDrawFrame(
  now: number,
  lastDrawnAt: number | null,
  cap: number,
): boolean {
  if (cap <= 0 || lastDrawnAt === null) return true;
  return now - lastDrawnAt >= (1000 / cap) * VSYNC_SLACK;
}

const settings = new UserSettings();

/** The current cap in frames per second, 0 for the display's own rate. */
export function frameRateCap(): number {
  return settings.frameRateCap();
}
