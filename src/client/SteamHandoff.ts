import type { UserSettings } from "../core/game/UserSettings";
import { clientPlatform } from "./ClientPlatform";
import { Platform } from "./Platform";

const STEAM_APP_ID = 5369890;

export type SteamHandoffMode = "none" | "ask" | "steam";

// The desktop app reads `--territorium-join=<gameID>` from its launch
// arguments (presence.rs in the app's repository), the same connect string
// Steam hands it when a friend joins. The flag name is a contract with builds
// already installed on players' machines.
export function steamJoinUrl(gameId: string): string {
  return `steam://run/${STEAM_APP_ID}//${encodeURIComponent(`--territorium-join=${gameId}`)}/`;
}

// A custom-scheme navigation leaves this page in place, which is what lets
// the caller keep a browser fallback on screen behind it. It still cancels the
// document's in-flight requests like any other navigation, so it has to wait
// for load or the fallback is left with half its assets. Returns a cancel for
// a launch still waiting, since the player can pick the browser first.
export function launchSteamJoin(gameId: string): () => void {
  const go = () => {
    window.location.href = steamJoinUrl(gameId);
  };
  if (document.readyState === "complete") {
    go();
    return () => {};
  }
  window.addEventListener("load", go, { once: true });
  return () => window.removeEventListener("load", go);
}

export function canHandOffToSteam(): boolean {
  return clientPlatform() === "web" && !Platform.isIOS && !Platform.isAndroid;
}

// Decided from local state only: this runs ahead of every network call on a
// lobby link, so a player bound for Steam never takes a slot in the browser.
export function steamHandoffMode(
  settings: Pick<UserSettings, "steamBuildSeen" | "steamLobbyLinks">,
  search: string,
): SteamHandoffMode {
  if (!canHandOffToSteam()) return "none";
  // ?host reattaches a creator to their own lobby and ?spectate is handed out
  // by casters; neither has a desktop equivalent.
  const params = new URLSearchParams(search);
  if (params.has("host") || params.has("spectate")) return "none";

  const preference = settings.steamLobbyLinks();
  if (preference === "steam") return "steam";
  if (preference === "browser") return "none";
  return settings.steamBuildSeen() ? "ask" : "none";
}
