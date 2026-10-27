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

// An admin account plays them in the browser too (unlockSteamForAdmin);
// the game servers and the API check the role on their side as well.
let adminUnlocked = false;

/** Whether the Steam app's modes are locked here, now. */
export function isSteamLocked(): boolean {
  return STEAM_LAUNCH_LOCKED && !adminUnlocked;
}

/** Called once the account is known to be an admin's. */
export function unlockSteamForAdmin(): void {
  if (adminUnlocked || !STEAM_LAUNCH_LOCKED) return;
  adminUnlocked = true;
  window.dispatchEvent(new Event("steam-lock-changed"));
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
