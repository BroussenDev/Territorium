import { assetUrl } from "../../core/AssetUrls";

export const warshipIcon = assetUrl("images/BattleshipIconWhite.svg");
export const cityIcon = assetUrl("images/CityIconWhite.svg");
export const empBombIcon = assetUrl("images/EmpIconWhite.svg");
export const goldCoinIcon = assetUrl("images/GoldCoinIcon.svg");
export const mirvIcon = assetUrl("images/MIRVIcon.svg");
export const missileSiloIcon = assetUrl("images/MissileSiloIconWhite.svg");
export const hydrogenBombIcon = assetUrl("images/MushroomCloudIconWhite.svg");
export const atomBombIcon = assetUrl("images/NukeIconWhite.svg");
export const portIcon = assetUrl("images/PortIcon.svg");
export const radarIcon = assetUrl("images/RadarIconWhite.svg");
// The SAM launcher and the factory change look at each level they are
// upgraded to, up to 5.
function levelIcons(name: string): string[] {
  return [1, 2, 3, 4, 5].map((level) =>
    assetUrl(`images/${name}Level${level}IconWhite.svg`),
  );
}
function iconForLevel(icons: string[], level: number): string {
  return icons[Math.min(Math.max(level, 1), icons.length) - 1];
}
const samLauncherIcons = levelIcons("SamLauncher");
export const samLauncherIcon = samLauncherIcons[0];
export function samLauncherIconFor(level: number): string {
  return iconForLevel(samLauncherIcons, level);
}
const factoryIcons = levelIcons("Factory");
export const factoryIcon = factoryIcons[0];
export function factoryIconFor(level: number): string {
  return iconForLevel(factoryIcons, level);
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
