import { crestOf, formatCrest } from "./ClanCrest";
import { PlayerCosmetics } from "./Schemas";

// The Nation pack: a clan pack whose standard and crown carry the wearer's
// clan crest, drawn in the clan's colors (or around the country's flag in
// a Nations game).
export const NATION_FLAG_NAME = "etendard_national";
export const NATION_CROWN_NAME = "couronne_nationale";

export function isNationFlag(flag: string | undefined): boolean {
  return flag?.endsWith(`/${NATION_FLAG_NAME}.svg`) ?? false;
}

/** Whether the cosmetics include a Nation pack item. */
export function wearsNationPack(cosmetics: PlayerCosmetics): boolean {
  return (
    isNationFlag(cosmetics.flag) || cosmetics.crown?.name === NATION_CROWN_NAME
  );
}

/**
 * The crest a Nation pack wearer shows: the clan whose tag they wear, or
 * else their first clan. Null when they are in no clan.
 */
export function wearerCrest(
  clans: readonly { tag: string; crest?: string | null }[] | undefined,
  wornTag: string | null,
): { tag: string; crest: string } | null {
  const list = clans ?? [];
  const worn = wornTag?.toUpperCase();
  const clan = list.find((c) => c.tag.toUpperCase() === worn) ?? list[0];
  if (clan === undefined) return null;
  return { tag: clan.tag, crest: formatCrest(crestOf(clan.crest, clan.tag)) };
}

/** Stamps the wearer's clan crest onto cosmetics holding a Nation pack item. */
export function stampNationCrest(
  cosmetics: PlayerCosmetics,
  clans: readonly { tag: string; crest?: string | null }[] | undefined,
  wornTag: string | null,
): void {
  if (!wearsNationPack(cosmetics)) return;
  const crest = wearerCrest(clans, wornTag);
  if (crest !== null) cosmetics.clanCrest = crest;
}
