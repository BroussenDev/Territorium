import { GameConfig } from "../Schemas";
import {
  Difficulty,
  Game,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  SpawnArea,
  Team,
} from "./Game";
import { TileRef } from "./GameMap";
import { resolveTeamsList } from "./TeamAssignment";

// Versus mode: two teams of 1 to 4 players on a tournament map, with fixed
// rules nobody can change. Each team spawns in its own zone, and the zones
// are mirror images of each other, so both sides start on equal terms.

export const VERSUS_TEAM_SIZES = [1, 2, 3, 4] as const;
export type VersusTeamSize = (typeof VERSUS_TEAM_SIZES)[number];

export const VERSUS_GAME_TYPES = ["1v1", "2v2", "3v3", "4v4"] as const;
export type VersusGameType = (typeof VERSUS_GAME_TYPES)[number];

interface VersusFormat {
  map: GameMapType;
  mapSize: GameMapSize;
  /**
   * "halves": each team spawns on its half of the map (west / east).
   * "lower": each team spawns in its lower quadrant, and the land north of
   * them is left to fight over.
   */
  zones: "halves" | "lower";
}

const VERSUS_FORMATS: Record<VersusTeamSize, VersusFormat> = {
  1: {
    map: GameMapType.Tourney1,
    mapSize: GameMapSize.Compact,
    zones: "halves",
  },
  2: {
    map: GameMapType.Tourney3,
    mapSize: GameMapSize.Compact,
    zones: "halves",
  },
  3: {
    map: GameMapType.Tourney2,
    mapSize: GameMapSize.Normal,
    zones: "lower",
  },
  4: {
    map: GameMapType.Tourney4,
    mapSize: GameMapSize.Normal,
    zones: "halves",
  },
};

/**
 * Nobody spawns this close to the map centre (in percent of the map width):
 * the central island touches both zones, and a spawn there would start next
 * to the other team.
 */
export const VERSUS_CENTER_EXCLUSION_PERCENT = 8;

export function isVersusTeamSize(n: unknown): n is VersusTeamSize {
  return VERSUS_TEAM_SIZES.includes(n as VersusTeamSize);
}

export function versusGameType(teamSize: VersusTeamSize): VersusGameType {
  return VERSUS_GAME_TYPES[teamSize - 1];
}

export function isVersusGameType(type: string): type is VersusGameType {
  return VERSUS_GAME_TYPES.includes(type as VersusGameType);
}

export function versusTeamSizeOfType(type: string): VersusTeamSize | null {
  const i = VERSUS_GAME_TYPES.indexOf(type as VersusGameType);
  return i < 0 ? null : VERSUS_TEAM_SIZES[i];
}

export function versusMap(teamSize: VersusTeamSize): GameMapType {
  return VERSUS_FORMATS[teamSize].map;
}

export function versusZoneLayout(
  teamSize: VersusTeamSize,
): VersusFormat["zones"] {
  return VERSUS_FORMATS[teamSize].zones;
}

/** The fixed rules of a versus game: every lobby of a format plays these. */
export function versusGameConfig(
  teamSize: VersusTeamSize,
  gameType: GameType.Public | GameType.Private,
): GameConfig {
  const format = VERSUS_FORMATS[teamSize];
  return {
    gameMap: format.map,
    gameMapSize: format.mapSize,
    gameType,
    gameMode: GameMode.Team,
    playerTeams: 2,
    maxPlayers: teamSize * 2,
    difficulty: Difficulty.Medium,
    nations: "disabled",
    bots: 0,
    donateGold: true,
    donateTroops: true,
    infiniteGold: false,
    infiniteTroops: false,
    instantBuild: false,
    randomSpawn: false,
    disabledUnits: [],
    disableClanTags: true,
    publicGameModifiers: {
      isCompact: format.mapSize === GameMapSize.Compact || undefined,
    },
    // The game starts as soon as the lobby is full.
    startDelay: 3,
    overtime: { enabled: true },
    gameVariant: "versus",
  };
}

/** Players per team of a versus config, or null if it isn't one. */
export function versusTeamSize(
  config: Pick<GameConfig, "gameVariant" | "maxPlayers">,
): VersusTeamSize | null {
  if (config.gameVariant !== "versus") return null;
  const size = (config.maxPlayers ?? 0) / 2;
  return isVersusTeamSize(size) ? size : null;
}

/**
 * The spawn zone of the team at `teamIndex` (0: west, 1: east) on a map of
 * the given size. The east zone mirrors the west one.
 */
export function versusSpawnArea(
  map: GameMapType,
  teamIndex: number,
  width: number,
  height: number,
): SpawnArea | undefined {
  if (teamIndex !== 0 && teamIndex !== 1) return undefined;
  const format = Object.values(VERSUS_FORMATS).find((f) => f.map === map);
  const halfWidth = Math.floor(width / 2);
  const halfHeight = Math.floor(height / 2);
  const lower = format?.zones === "lower";
  return {
    x: teamIndex === 0 ? 0 : width - halfWidth,
    y: lower ? height - halfHeight : 0,
    width: halfWidth,
    height: lower ? halfHeight : height,
  };
}

/** The side of a versus team: 0 (west) or 1 (east), or -1 for any other. */
export function versusTeamIndex(team: Team): number {
  return resolveTeamsList(2, 2).indexOf(team);
}

/** Radius, in tiles, of the no-spawn disc at the centre of a map. */
export function versusExclusionRadius(width: number): number {
  return exclusionDiameter(width) / 2;
}

function exclusionDiameter(width: number): number {
  return Math.floor((2 * width * VERSUS_CENTER_EXCLUSION_PERCENT) / 100);
}

/**
 * Whether a player of `team` may spawn at (x, y) on the versus map `map` of
 * the given size.
 */
export function isVersusSpawnCell(
  map: GameMapType,
  team: Team,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  const area = versusSpawnArea(map, versusTeamIndex(team), width, height);
  return area !== undefined && isInVersusSpawnZone(area, x, y, width, height);
}

/** Whether a player of `team` may spawn on `tile` in a versus game. */
export function isVersusSpawnTile(
  game: Game,
  team: Team | null,
  tile: TileRef,
): boolean {
  if (team === null) return false;
  const area = game.teamSpawnArea(team);
  if (area === undefined) return false;
  return isInVersusSpawnZone(
    area,
    game.x(tile),
    game.y(tile),
    game.width(),
    game.height(),
  );
}

/** Whether (x, y) is in the spawn zone `area`, away from the map centre. */
export function isInVersusSpawnZone(
  area: SpawnArea,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  if (
    x < area.x ||
    x >= area.x + area.width ||
    y < area.y ||
    y >= area.y + area.height
  ) {
    return false;
  }
  // Doubled coordinates keep the map centre on whole numbers.
  const dx = 2 * x - (width - 1);
  const dy = 2 * y - (height - 1);
  const diameter = exclusionDiameter(width);
  return dx * dx + dy * dy >= diameter * diameter;
}
