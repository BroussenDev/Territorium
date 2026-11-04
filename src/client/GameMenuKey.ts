/**
 * Escape and the in-game menu.
 *
 * Escape first closes whatever the player has open (build preview, selection,
 * radial menu, a card or a window). Only when nothing took the key does it
 * open the game menu, so one press never does both.
 */
export interface EscapePress {
  /** The key bound to the game menu ("Escape" by default). */
  menuKey: string | undefined;
  /** The press came from a text field (chat, search): it only leaves it. */
  fromTextInput: boolean;
  /** Something closed on this press (ghost structure, box, selection...). */
  closedSomething: boolean;
  /** A CloseViewEvent listener closed a menu or card. */
  viewHandled: boolean;
}

/** Whether this Escape press should (try to) open the game menu. */
export function escapeOpensMenu(p: EscapePress): boolean {
  if (p.menuKey !== "Escape") return false;
  if (p.fromTextInput) return false;
  return !p.closedSomething && !p.viewHandled;
}
