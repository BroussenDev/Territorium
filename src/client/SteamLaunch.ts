import "./components/SteamLaunchDialog";
import type {
  SteamLaunchDialog,
  SteamLockedFeature,
} from "./components/SteamLaunchDialog";
import { isDesktopShell } from "./DesktopShell";

export type { SteamLockedFeature } from "./components/SteamLaunchDialog";

/**
 * Ranked games, Versus and public lobbies are the Steam app's: on the website
 * they are shown but locked, and trying one invites the player to wishlist
 * the game. The app's bridge is in place before this module loads, so the
 * answer never changes during a session.
 */
export const STEAM_LAUNCH_LOCKED = steamLaunchLocked();

export function steamLaunchLocked(): boolean {
  return !isDesktopShell();
}

/** Shows the "coming with the Steam release" dialog for a locked feature. */
export function showSteamLaunchDialog(feature: SteamLockedFeature): void {
  document.querySelector("steam-launch-dialog")?.remove();
  const dialog = document.createElement(
    "steam-launch-dialog",
  ) as SteamLaunchDialog;
  dialog.feature = feature;
  dialog.addEventListener("close", () => dialog.remove());
  document.body.appendChild(dialog);
}
