import { assetUrl } from "../../core/AssetUrls";

export const warshipIcon = assetUrl("images/BattleshipIconWhite.svg");
export const empBombIcon = assetUrl("images/EmpIconWhite.svg");
export const goldCoinIcon = assetUrl("images/GoldCoinIcon.svg");
export const mirvIcon = assetUrl("images/MIRVIcon.svg");
export const hydrogenBombIcon = assetUrl("images/MushroomCloudIconWhite.svg");
export const atomBombIcon = assetUrl("images/NukeIconWhite.svg");
// The city, the port, the SAM launcher, the factory, the radar and the missile
// silo change look at each level they are upgraded to (up to 5, 3 for the
// radar and the missile silo).
function levelIcons(name: string, levels: number): string[] {
  return Array.from({ length: levels }, (_, i) =>
    assetUrl(`images/${name}Level${i + 1}IconWhite.svg`),
  );
}
function iconForLevel(icons: string[], level: number): string {
  return icons[Math.min(Math.max(level, 1), icons.length) - 1];
}
const cityIcons = levelIcons("City", 5);
export const cityIcon = cityIcons[0];
export function cityIconFor(level: number): string {
  return iconForLevel(cityIcons, level);
}
const samLauncherIcons = levelIcons("SamLauncher", 5);
export const samLauncherIcon = samLauncherIcons[0];
export function samLauncherIconFor(level: number): string {
  return iconForLevel(samLauncherIcons, level);
}
const factoryIcons = levelIcons("Factory", 5);
export const factoryIcon = factoryIcons[0];
export function factoryIconFor(level: number): string {
  return iconForLevel(factoryIcons, level);
}
const portIcons = levelIcons("Port", 5);
export const portIcon = portIcons[0];
export function portIconFor(level: number): string {
  return iconForLevel(portIcons, level);
}
const missileSiloIcons = levelIcons("MissileSilo", 3);
export const missileSiloIcon = missileSiloIcons[0];
export function missileSiloIconFor(level: number): string {
  return iconForLevel(missileSiloIcons, level);
}
const radarIcons = levelIcons("Radar", 3);
export const radarIcon = radarIcons[0];
export function radarIconFor(level: number): string {
  return iconForLevel(radarIcons, level);
}
export const defensePostIcon = assetUrl("images/DefensePostIconWhite.svg");
export const soldierIcon = assetUrl("images/SoldierIcon.svg");
export const claimIcon = assetUrl("images/ClaimIcon.svg");
export const profileIcon = assetUrl("images/ProfileIcon.svg");
export const guildIcon = assetUrl("images/GuildIconWhite.svg");
export const teamIcon = assetUrl("images/TeamIconSolidWhite.svg");
export const upperLimitIcon = assetUrl("images/UpperLimitIcon.svg");
export const allianceIcon = assetUrl("images/AllianceIcon.svg");
export const traitorIcon = assetUrl("images/TraitorIcon.svg");
