import { UserSettings } from "../../../core/game/UserSettings";

// The player's frame-rate cap (Settings > Graphics). Laptops in particular
// run cooler, quieter and longer on battery at 30 or 60 frames a second than
// at a 144 Hz display's rate. The game itself is unaffected: the simulation
// runs in its worker at its own pace, and animations follow game ticks or
// the clock, not the frame count.
//
// Power saving lowers it further while the player is elsewhere. Browsers
// already slow a hidden tab down, but the Steam app turns that off (so a
// game in the background keeps its connection and timers on time), and
// neither slows a window that is only behind another one: this does both.

// requestAnimationFrame lands on the display's vsync, a little early or late
// each time; without this slack a 60 cap on a 60 Hz display would skip every
// frame that arrived a fraction of a millisecond early, halving the rate.
const VSYNC_SLACK = 0.85;

// Visible but not the active window (a second screen, a chat in front): the
// map still moves smoothly enough to follow the game.
export const UNFOCUSED_CAP = 30;
// Hidden (minimised, another tab, behind a full-screen window): nobody
// looks, a few frames keep the picture current for when they come back.
export const HIDDEN_CAP = 5;

export type WindowState = "active" | "unfocused" | "hidden";

/** Whether a frame arriving at `now` should be drawn, given the last one. */
export function shouldDrawFrame(
  now: number,
  lastDrawnAt: number | null,
  cap: number,
): boolean {
  if (cap <= 0 || lastDrawnAt === null) return true;
  return now - lastDrawnAt >= (1000 / cap) * VSYNC_SLACK;
}

/**
 * The cap to draw at: the player's own, lowered while the window is not the
 * active one when power saving is on. 0 is the display's own rate.
 */
export function effectiveCap(
  playerCap: number,
  window: WindowState,
  powerSaving: boolean,
): number {
  if (!powerSaving || window === "active") return playerCap;
  const saving = window === "hidden" ? HIDDEN_CAP : UNFOCUSED_CAP;
  return playerCap > 0 ? Math.min(playerCap, saving) : saving;
}

const settings = new UserSettings();

/** Where the game window stands: in use, behind another, or hidden. */
export function windowState(): WindowState {
  if (typeof document === "undefined") return "active";
  if (document.hidden) return "hidden";
  return document.hasFocus() ? "active" : "unfocused";
}

/** The current cap in frames per second, 0 for the display's own rate. */
export function frameRateCap(): number {
  return effectiveCap(
    settings.frameRateCap(),
    windowState(),
    settings.powerSaving(),
  );
}
