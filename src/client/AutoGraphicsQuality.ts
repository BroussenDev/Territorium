import { UserSettings } from "../core/game/UserSettings";
import { isDesktopShell } from "./DesktopShell";
import { runGraphicsBenchmark } from "./render/gl/GraphicsBenchmark";

// How long after the home page shows the test waits, so it never competes
// with the page's own loading.
const START_DELAY_MS = 2500;
// The size the test draws at; the estimate scales it to the real screen.
const TEST_WIDTH = 640;
const TEST_HEIGHT = 360;

/**
 * Whether a visitor's graphics quality should be picked for them: in the
 * browser only (the Steam app runs the same test, shown, on its first
 * launch), and only while no quality was ever saved, so a player's own
 * choice is never overridden and the test runs once.
 */
export function shouldAutoPickQuality(
  settings: UserSettings,
  desktop = isDesktopShell(),
): boolean {
  return !desktop && !settings.hasGraphicsQuality();
}

/**
 * On a visitor's first visit, runs the graphics test unseen and saves the
 * quality it recommends, so a weak computer starts on a level it can hold
 * instead of the default "high". The in-game watch (QualitySuggestion)
 * still offers a lower level if real games turn out slow.
 */
export function autoPickGraphicsQuality(
  settings: UserSettings = new UserSettings(),
): void {
  if (!shouldAutoPickQuality(settings)) return;
  setTimeout(() => {
    // Picked meanwhile (settings opened, a game started from a link).
    if (!shouldAutoPickQuality(settings)) return;
    const canvas = document.createElement("canvas");
    canvas.width = TEST_WIDTH;
    canvas.height = TEST_HEIGHT;
    runGraphicsBenchmark(canvas)
      .then((result) => {
        if (shouldAutoPickQuality(settings)) {
          settings.setGraphicsQuality(result.recommended);
        }
      })
      .catch(() => {
        // No WebGL2 or a lost context: the game's own fallbacks apply.
      })
      .finally(() => {
        canvas
          .getContext("webgl2")
          ?.getExtension("WEBGL_lose_context")
          ?.loseContext();
      });
  }, START_DELAY_MS);
}
