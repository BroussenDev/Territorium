// Badges a player can show next to their name. Each is an account item (a
// flare "badge:<id>") given by the API; the player picks which one to show,
// or none. Add new badges here, after the existing ones.
export const BADGES = ["pionnier", "haut_commandant", "champion"] as const;
export type BadgeId = (typeof BADGES)[number];

/** The player's choice to show no badge at all. */
export const NO_BADGE = "none";

export function badgeFlare(id: BadgeId): string {
  return `badge:${id}`;
}

export function isBadgeId(value: unknown): value is BadgeId {
  return (BADGES as readonly unknown[]).includes(value);
}

/** The badges an account holds, in registry order. */
export function ownedBadges(flares: readonly string[] | undefined): BadgeId[] {
  return BADGES.filter((id) => flares?.includes(badgeFlare(id)) ?? false);
}

/**
 * The badge a player shows: the one they picked when they hold it, nothing
 * when they picked none, otherwise the first badge they hold.
 */
export function shownBadge(
  choice: string | null | undefined,
  flares: readonly string[] | undefined,
): BadgeId | undefined {
  if (choice === NO_BADGE) return undefined;
  const owned = ownedBadges(flares);
  if (isBadgeId(choice) && owned.includes(choice)) return choice;
  return owned[0];
}
