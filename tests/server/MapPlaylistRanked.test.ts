import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { GameMapSize, GameMapType } from "../../src/core/game/Game";
import {
  MapPlaylist,
  RANKED_FFA_POOLS,
  rankedFfaPool,
} from "../../src/server/MapPlaylist";

// Land tiles of a map at the size a ranked match plays it.
function landTiles(map: GameMapType, size: GameMapSize): number {
  const key = (
    Object.keys(GameMapType) as Array<keyof typeof GameMapType>
  ).find((k) => GameMapType[k] === map)!;
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join("resources/maps", key.toLowerCase(), "manifest.json"),
      "utf8",
    ),
  );
  return size === GameMapSize.Compact
    ? manifest.map4x.num_land_tiles
    : manifest.map.num_land_tiles;
}

describe("MapPlaylist ranked free-for-all", () => {
  it("gives every player about the same land from 4 to 16 players", () => {
    for (let players = 4; players <= 16; players++) {
      const pool = rankedFfaPool(players);
      for (const map of pool.maps) {
        const perPlayer = landTiles(map, pool.size) / players;
        expect(perPlayer, `${map} with ${players} players`).toBeGreaterThan(
          45_000,
        );
        expect(perPlayer, `${map} with ${players} players`).toBeLessThan(
          130_000,
        );
      }
    }
  });

  it("covers up to 16 players and never uses uneven maps", () => {
    expect(RANKED_FFA_POOLS[RANKED_FFA_POOLS.length - 1].maxPlayers).toBe(16);
    const maps = RANKED_FFA_POOLS.flatMap((pool) => pool.maps);
    expect(maps).not.toContain(GameMapType.Italia);
    expect(maps).not.toContain(GameMapType.Japan);
    expect(maps).not.toContain(GameMapType.France);
  });

  it("builds the match from the pool for its size", () => {
    const small = new MapPlaylist().getRankedFfaConfig(4);
    expect(small.gameMapSize).toBe(GameMapSize.Compact);
    expect(rankedFfaPool(4).maps).toContain(small.gameMap);
    expect(small.maxPlayers).toBe(4);
    expect(small.bots).toBe(0);
    expect(small.nations).toBe("disabled");

    const full = new MapPlaylist().getRankedFfaConfig(16);
    expect(full.gameMapSize).toBe(GameMapSize.Normal);
    expect(rankedFfaPool(16).maps).toContain(full.gameMap);
  });

  it("plays the voted map when it is in the pool for the match size", () => {
    const voted = rankedFfaPool(4).maps[1];
    expect(new MapPlaylist().getRankedFfaConfig(4, voted).gameMap).toBe(voted);
  });

  it("ignores a voted map outside the pool", () => {
    const config = new MapPlaylist().getRankedFfaConfig(4, GameMapType.France);
    expect(rankedFfaPool(4).maps).toContain(config.gameMap);
  });
});
