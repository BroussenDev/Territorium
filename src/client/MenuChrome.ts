/**
 * Whether the home page was put away for a starting game and not yet put
 * back.
 *
 * Main's leave path asks this before restarting the public lobby feed and
 * announcing "menu-restored": a leave between prestart and the game actually
 * starting finds the home page put away although the in-game signal is not
 * set yet (it is set at join, after the terrain loads), so the gate is keyed
 * on the teardown itself rather than on that signal.
 */
let tornDown = false;

export function menuChromeIsTornDown(): boolean {
  return tornDown;
}

/** The home page is being put away for a starting game. */
export function hideMenuChrome(): void {
  tornDown = true;
}

/** The home page is back after a leave that did not navigate. */
export function restoreMenuChrome(): void {
  tornDown = false;
}
