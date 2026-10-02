import "./components/SteamLaunchDialog";
import type {
  SteamLaunchDialog,
  SteamLockedFeature,
} from "./components/SteamLaunchDialog";

export type { SteamLockedFeature } from "./components/SteamLaunchDialog";

/**
 * Ranked games, Versus and public lobbies open with Territorium's Steam
 * release. Until then they are shown but locked for everyone, and trying one
 * invites the player to wishlist the game. Flip to false on release day.
 */
export const STEAM_LAUNCH_LOCKED = true;

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
