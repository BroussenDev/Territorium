import { assetUrl } from "../../core/AssetUrls";

export const warshipIcon = assetUrl("images/BattleshipIconWhite.svg");
export const cityIcon = assetUrl("images/CityIconWhite.svg");
export const empBombIcon = assetUrl("images/EmpIconWhite.svg");
export const factoryIcon = assetUrl("images/FactoryIconWhite.svg");
export const goldCoinIcon = assetUrl("images/GoldCoinIcon.svg");
export const mirvIcon = assetUrl("images/MIRVIcon.svg");
export const missileSiloIcon = assetUrl("images/MissileSiloIconWhite.svg");
export const hydrogenBombIcon = assetUrl("images/MushroomCloudIconWhite.svg");
export const atomBombIcon = assetUrl("images/NukeIconWhite.svg");
export const portIcon = assetUrl("images/PortIcon.svg");
export const radarIcon = assetUrl("images/RadarIconWhite.svg");
// The SAM launcher changes look as it is upgraded: level 1, 2, then 3 and up.
const samLauncherIcons = [
  assetUrl("images/SamLauncherLevel1IconWhite.svg"),
  assetUrl("images/SamLauncherLevel2IconWhite.svg"),
  assetUrl("images/SamLauncherLevel3IconWhite.svg"),
];
export const samLauncherIcon = samLauncherIcons[0];
export function samLauncherIconFor(level: number): string {
  return samLauncherIcons[Math.min(Math.max(level, 1), 3) - 1];
}
export const defensePostIcon = assetUrl("images/ShieldIconWhite.svg");
export const soldierIcon = assetUrl("images/SoldierIcon.svg");
export const claimIcon = assetUrl("images/ClaimIcon.svg");
export const profileIcon = assetUrl("images/ProfileIcon.svg");
export const guildIcon = assetUrl("images/GuildIconWhite.svg");
export const teamIcon = assetUrl("images/TeamIconSolidWhite.svg");
export const upperLimitIcon = assetUrl("images/UpperLimitIcon.svg");
export const allianceIcon = assetUrl("images/AllianceIcon.svg");
export const traitorIcon = assetUrl("images/TraitorIcon.svg");
