import { isDesktopShell } from "../DesktopShell";
import { AudioMixer } from "./AudioMixer";

// What counts as a control the player presses in the menus.
const CONTROL =
  'button, a[href], [role="button"], [role="tab"], .nav-menu-item, select, input[type="checkbox"], input[type="radio"]';

// Presses closer together than this make one click, so a control nested in
// another, or a quick double press, is not heard twice.
const MIN_GAP_MS = 60;

/**
 * In the desktop app, the menus answer every press with the interface click,
 * as a game's menus do. Not in a game (its own sounds take over at
 * "game-starting", back at "menu-restored"), not on the web, and silent
 * whenever the interface channel is turned down.
 */
export function startMenuClicks(mixer: AudioMixer): void {
  if (!isDesktopShell()) return;
  let inGame = false;
  let last = 0;
  document.addEventListener("game-starting", () => (inGame = true));
  document.addEventListener("menu-restored", () => (inGame = false));
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (inGame || e.button !== 0) return;
      const control = pressedControl(e);
      if (control === null) return;
      if (control.matches(':disabled, [aria-disabled="true"]')) return;
      const now = performance.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      mixer.play("click");
    },
    true,
  );
}

/** The control a press landed on, looking inside components' shadow DOM. */
export function pressedControl(e: Event): Element | null {
  for (const node of e.composedPath()) {
    if (!(node instanceof Element)) continue;
    if (node.matches(CONTROL)) return node;
  }
  return null;
}
