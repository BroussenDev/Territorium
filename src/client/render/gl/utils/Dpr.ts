import { currentGraphicsQuality, qualityDprCap } from "../GraphicsQuality";

/**
 * Device-pixel-ratio used by the WebGL renderer for its backing store and all
 * screen↔world math. Capped by the graphics quality: 2 at "high", so a very
 * high-DPI (mobile) display does not render at 3x, which costs ~9x the
 * fragment work of 1x; "ultra" allows 3x, "low" renders at 1x.
 *
 * Every renderer call site that previously read `window.devicePixelRatio`
 * must go through this so the canvas size, camera math, and text scaling stay
 * on the same coordinate system.
 */
export function renderDpr(): number {
  return Math.min(
    window.devicePixelRatio || 2,
    qualityDprCap(currentGraphicsQuality()),
  );
}
