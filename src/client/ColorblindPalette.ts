import { UserSettings } from "../core/game/UserSettings";

/**
 * Friend / foe colours for interface pieces drawn outside the territory
 * renderer (Conquest banner, attack plates). The default look is emerald and
 * red; the Colorblind graphics preset swaps them for the Okabe-Ito blue and
 * orange it already gives territories and borders, which every common form
 * of colour blindness tells apart.
 */
export interface FriendFoeColors {
  friend: string;
  foe: string;
}

const DEFAULT_COLORS: FriendFoeColors = { friend: "#34d399", foe: "#ef4444" };
const COLORBLIND_COLORS: FriendFoeColors = {
  friend: "#56b4e9",
  foe: "#e69f00",
};

export function isColorblindPalette(
  settings: Pick<UserSettings, "graphicsOverrides"> = new UserSettings(),
): boolean {
  return settings.graphicsOverrides().palette === "colorblind";
}

export function friendFoeColors(
  settings?: Pick<UserSettings, "graphicsOverrides">,
): FriendFoeColors {
  return isColorblindPalette(settings) ? COLORBLIND_COLORS : DEFAULT_COLORS;
}
