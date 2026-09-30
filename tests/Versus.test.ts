import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { SpawnExecution } from "../src/core/execution/SpawnExecution";
import { WinCheckExecution } from "../src/core/execution/WinCheckExecution";
import {
  Game,
  GameMapSize,
  GameMapType,
  GameMode,
  GameType,
  PlayerInfo,
  PlayerType,
  Team,
} from "../src/core/game/Game";
import { TileRef } from "../src/core/game/GameMap";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import { genTerrainFromBin } from "../src/core/game/TerrainMapLoader";
import {
  isInVersusSpawnZone,
  isVersusSpawnCell,
  isVersusSpawnTile,
  VERSUS_TEAM_SIZES,
  versusGameConfig,
  versusGameType,
  versusMap,
  versusSpawnArea,
  versusTeamIndex,
  versusTeamSize,
  versusTeamSizeOfType,
} from "../src/core/game/Versus";
import { GameConfigSchema } from "../src/core/Schemas";
import { setup } from "./util/Setup";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FORMATS = VERSUS_TEAM_SIZES.map(
  (size) => [versusGameType(size), size] as const,
);

const MAP_FOLDERS: Partial<Record<GameMapType, string>> = {
  [GameMapType.Tourney1]: "tourney1",
  [GameMapType.Tourney2]: "tourney2",
  [GameMapType.Tourney3]: "tourney3",
  [GameMapType.Tourney4]: "tourney4",
};

function humans(count: number): PlayerInfo[] {
  return Array.from(
    { length: count },
    (_, i) =>
      new PlayerInfo(
        `player${i}`,
        PlayerType.Human,
        `client${i}`,
        `p${i}_id`,
        false,
        null,
        [],
        i % 2,
      ),
  );
}

// A versus game on the all-land test map: the zone rules only depend on the
// configured map and the terrain size, so every tile is a candidate.
async function versusGame(teamSize: 1 | 2 | 3 | 4, players = teamSize * 2) {
  return setup(
    "plains",
    versusGameConfig(teamSize, GameType.Private),
    humans(players),
    undefined,
    undefined,
    false,
  );
}

function spawnAt(game: Game, info: PlayerInfo, tile: TileRef) {
  const exec = new SpawnExecution("test-game", info, tile, true);
  exec.init(game, 0);
  exec.tick(0);
}

describe("Versus presets", () => {
  it.each(FORMATS)("locks the rules of %s", (_, size) => {
    const config = versusGameConfig(size, GameType.Public);
    expect(GameConfigSchema.safeParse(config).success).toBe(true);
    expect(config.gameMode).toBe(GameMode.Team);
    expect(config.playerTeams).toBe(2);
    expect(config.maxPlayers).toBe(size * 2);
    expect(config.bots).toBe(0);
    expect(config.nations).toBe("disabled");
    expect(config.gameVariant).toBe("versus");
    expect(config.gameMap).toBe(versusMap(size));
    expect(versusTeamSize(config)).toBe(size);
    expect(versusTeamSizeOfType(versusGameType(size))).toBe(size);
  });

  it("plays each format on its tournament map", () => {
    expect(VERSUS_TEAM_SIZES.map(versusMap)).toEqual([
      GameMapType.Tourney1,
      GameMapType.Tourney3,
      GameMapType.Tourney2,
      GameMapType.Tourney4,
    ]);
  });

  it("recognises only versus configs", () => {
    expect(versusTeamSize({ gameVariant: undefined, maxPlayers: 2 })).toBe(
      null,
    );
    expect(versusTeamSize({ gameVariant: "versus", maxPlayers: 10 })).toBe(
      null,
    );
    expect(versusTeamSizeOfType("ffa")).toBe(null);
  });
});

describe("Versus spawn zones", () => {
  it("splits the map into mirrored west and east halves", () => {
    const west = versusSpawnArea(GameMapType.Tourney1, 0, 750, 750);
    const east = versusSpawnArea(GameMapType.Tourney1, 1, 750, 750);
    expect(west).toEqual({ x: 0, y: 0, width: 375, height: 750 });
    expect(east).toEqual({ x: 375, y: 0, width: 375, height: 750 });
    expect(versusSpawnArea(GameMapType.Tourney1, 2, 750, 750)).toBe(undefined);
  });

  it("keeps 3v3 teams in the lower quadrants", () => {
    expect(versusSpawnArea(GameMapType.Tourney2, 0, 1500, 1500)).toEqual({
      x: 0,
      y: 750,
      width: 750,
      height: 750,
    });
    expect(versusSpawnArea(GameMapType.Tourney2, 1, 1500, 1500)).toEqual({
      x: 750,
      y: 750,
      width: 750,
      height: 750,
    });
  });

  // On the terrain each format really loads, no land links the two teams'
  // zones: both sides start apart, and the zones hold the same land.
  it.each(FORMATS)(
    "starts the %s teams apart on equal land",
    async (_, size) => {
      const config = versusGameConfig(size, GameType.Public);
      const folder = path.join(
        __dirname,
        "../resources/maps",
        MAP_FOLDERS[config.gameMap]!,
      );
      const manifest = JSON.parse(
        fs.readFileSync(path.join(folder, "manifest.json"), "utf8"),
      );
      const compact = config.gameMapSize === GameMapSize.Compact;
      const map = await genTerrainFromBin(
        compact ? manifest.map4x : manifest.map,
        fs.readFileSync(path.join(folder, compact ? "map4x.bin" : "map.bin")),
      );
      const w = map.width();
      const h = map.height();

      const component = new Int32Array(w * h).fill(-1);
      const passable = (t: TileRef) => map.isLand(t) && !map.isImpassable(t);
      let next = 0;
      for (let start = 0; start < w * h; start++) {
        if (component[start] >= 0 || !passable(start)) continue;
        const stack = [start];
        component[start] = next;
        while (stack.length > 0) {
          const t = stack.pop()!;
          for (const n of map.neighbors(t)) {
            if (component[n] < 0 && passable(n)) {
              component[n] = next;
              stack.push(n);
            }
          }
        }
        next++;
      }

      const zones = [0, 1].map((team) => {
        const area = versusSpawnArea(config.gameMap, team, w, h)!;
        const components = new Set<number>();
        let land = 0;
        for (let y = area.y; y < area.y + area.height; y++) {
          for (let x = area.x; x < area.x + area.width; x++) {
            const t = map.ref(x, y);
            if (!passable(t) || !isInVersusSpawnZone(area, x, y, w, h)) {
              continue;
            }
            components.add(component[t]);
            land++;
          }
        }
        return { components, land };
      });

      for (const c of zones[0].components) {
        expect(zones[1].components.has(c)).toBe(false);
      }
      expect(zones[0].land).toBeGreaterThan((w * h) / 20);
      expect(
        Math.abs(zones[0].land - zones[1].land) / zones[0].land,
      ).toBeLessThan(0.02);
    },
    30_000,
  );

  it("only accepts a spawn in the player's own zone", async () => {
    const game = await versusGame(1);
    const [a, b] = humans(2);
    const pa = game.player(a.id);
    const pb = game.player(b.id);
    expect(pa.team()).not.toBe(pb.team());

    const zoneA = game.teamSpawnArea(pa.team()!)!;
    const zoneB = game.teamSpawnArea(pb.team()!)!;
    const inA = game.ref(zoneA.x + 10, zoneA.y + 10);
    const inB = game.ref(zoneB.x + 10, zoneB.y + 10);
    expect(isVersusSpawnTile(game, pa.team(), inA)).toBe(true);
    expect(isVersusSpawnTile(game, pa.team(), inB)).toBe(false);

    spawnAt(game, a, inB);
    expect(pa.hasSpawned()).toBe(false);

    const centre = game.ref(game.width() / 2, game.height() / 2);
    spawnAt(game, a, centre);
    expect(pa.hasSpawned()).toBe(false);

    spawnAt(game, a, inA);
    expect(pa.spawnTile()).toBe(inA);

    spawnAt(game, b, inB);
    expect(pb.spawnTile()).toBe(inB);
  });

  // The client greys out the other zone before the game knows the teams'
  // areas; both must agree on every tile.
  it("matches the zone the client shows", async () => {
    const game = await versusGame(1);
    const map = versusMap(1);
    const w = game.width();
    const h = game.height();
    for (const info of humans(2)) {
      const team = game.player(info.id).team()!;
      for (let y = 0; y < h; y += 7) {
        for (let x = 0; x < w; x += 7) {
          expect(isVersusSpawnCell(map, team, x, y, w, h)).toBe(
            isVersusSpawnTile(game, team, game.ref(x, y)),
          );
        }
      }
    }
    expect(versusTeamIndex("Bot" as Team)).toBe(-1);
  });

  it("places random spawns in the team's zone", async () => {
    const game = await versusGame(2);
    for (const info of humans(4)) {
      const exec = new SpawnExecution("test-game", info);
      exec.init(game, 0);
      exec.tick(0);
      const player = game.player(info.id);
      expect(isVersusSpawnTile(game, player.team(), player.spawnTile()!)).toBe(
        true,
      );
    }
  });
});

describe("Versus win", () => {
  it("gives the win to the last team with a player in the game", async () => {
    const game = await versusGame(1);
    const [a, b] = humans(2);
    const pa = game.player(a.id);
    const pb = game.player(b.id);
    const zoneA = game.teamSpawnArea(pa.team()!)!;
    const zoneB = game.teamSpawnArea(pb.team()!)!;
    spawnAt(game, a, game.ref(zoneA.x + 10, zoneA.y + 10));
    spawnAt(game, b, game.ref(zoneB.x + 10, zoneB.y + 10));
    game.endSpawnPhase();

    pb.markDisconnected(true);
    game.addExecution(new WinCheckExecution());
    const wins = [];
    for (let i = 0; i < 11; i++) {
      wins.push(...game.executeNextTick()[GameUpdateType.Win]);
    }

    expect(wins).toHaveLength(1);
    expect(game.getWinner()).toBe(pa.team());
  });
});
