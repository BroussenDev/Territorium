import { TemplateResult } from "lit";
import { BadgeId, isBadgeId } from "../../../core/Badges";
import { translateText } from "../../Utils";
import { championBadge } from "./ChampionBadge";
import { highCommanderBadge } from "./HighCommanderBadge";
import { pioneerBadge } from "./PioneerBadge";

// How each badge (core/Badges.ts) is drawn and named.
const ICONS: Record<
  BadgeId,
  (sizeClass: string, label?: string | null) => TemplateResult
> = {
  pionnier: pioneerBadge,
  haut_commandant: highCommanderBadge,
  champion: championBadge,
};

const NAMES: Record<BadgeId, { name: string; description: string }> = {
  pionnier: { name: "pioneer.badge", description: "pioneer.badge_desc" },
  haut_commandant: { name: "deluxe.badge", description: "deluxe.badge_desc" },
  champion: {
    name: "tournaments.champion_badge",
    description: "tournaments.champion_badge_desc",
  },
};

/** The badge's icon, or null for an id this client does not know. */
export function badgeIcon(
  id: string | undefined,
  sizeClass = "w-4 h-4",
  label?: string | null,
): TemplateResult | null {
  return isBadgeId(id) ? ICONS[id](sizeClass, label) : null;
}

export function badgeName(id: BadgeId): string {
  return translateText(NAMES[id].name);
}

export function badgeDescription(id: BadgeId): string {
  return translateText(NAMES[id].description);
}
