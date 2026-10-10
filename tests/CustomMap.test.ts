import { describe, expect, it } from "vitest";
import {
  customMapId,
  customMapManifest,
  registerCustomMapFiles,
} from "../src/core/game/CustomMaps";
import { FetchGameMapLoader } from "../src/core/game/FetchGameMapLoader";
import { GameMapSize, GameMapType } from "../src/core/game/Game";
import { generateMap } from "../src/core/game/MapGenerator";
import { loadTerrainMap } from "../src/core/game/TerrainMapLoader";
import { GameConfigSchema, ServerMessage } from "../src/core/Schemas";
import { decodeServerMessage, encodeServerMessage } from "../src/core/ZbinWire";
import { testGameConfig } from "./util/Wire";

// A 64x48 island in the middle of the sea, as the editor would hand it over.
function island() {
  const width = 64;
  const height = 48;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const land = (x - 32) ** 2 / 400 + (y - 24) ** 2 / 200 < 1;
      rgba.set(land ? [0, 0, 150, 255] : [0, 0, 106, 255], o);
    }
  }
  return generateMap({ width, height, rgba }, false);
}

const dataUrl = (bytes: Uint8Array, type: string) =>
  `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;

describe("player-made maps", () => {
  it("are named by the hash of their files", async () => {
    const map = island();
    const a = customMapManifest("Île", map, [{ name: "Nord", x: 30, y: 16 }]);
    const b = customMapManifest("Île", map, [{ name: "Nord", x: 31, y: 16 }]);
    const id = await customMapId(map, a);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(await customMapId(map, a)).toBe(id);
    expect(await customMapId(map, b)).not.toBe(id);
  });

  it("load into a game in place of the official map", async () => {
    const map = island();
    const manifest = customMapManifest("Île de test", map, [
      { name: "Nord", x: 30, y: 16 },
    ]);
    const id = await customMapId(map, manifest);
    registerCustomMapFiles(id, {
      mapBin: dataUrl(map.map.data, "application/octet-stream"),
      map4xBin: dataUrl(map.map4x.data, "application/octet-stream"),
      map16xBin: dataUrl(map.map16x.data, "application/octet-stream"),
      manifest: `data:application/json,${encodeURIComponent(JSON.stringify(manifest))}`,
      thumbnail: "data:image/webp;base64,",
    });
    const terrain = await loadTerrainMap(
      GameMapType.World,
      GameMapSize.Normal,
      new FetchGameMapLoader("unused"),
      false,
      { id, name: "Île de test" },
    );
    expect(terrain.gameMap.width()).toBe(64);
    expect(terrain.gameMap.height()).toBe(48);
    expect(terrain.gameMap.numLandTiles()).toBe(map.map.numLandTiles);
    expect(terrain.nations.map((n) => n.name)).toEqual(["Nord"]);
  });

  it("refuses a map that was never made available", async () => {
    await expect(
      loadTerrainMap(
        GameMapType.World,
        GameMapSize.Normal,
        new FetchGameMapLoader("unused"),
        false,
        { id: "f".repeat(64), name: "Ailleurs" },
      ),
    ).rejects.toThrow("Custom map not available");
  });

  it("travel in the game config, and only well-formed", () => {
    const config = {
      ...testGameConfig(),
      customMap: { id: "a".repeat(64), name: "Archipel" },
    };
    expect(GameConfigSchema.safeParse(config).success).toBe(true);
    expect(
      GameConfigSchema.safeParse({
        ...config,
        customMap: { id: "../../etc", name: "x" },
      }).success,
    ).toBe(false);
    const start = {
      type: "start",
      turns: [],
      lobbyCreatedAt: 1,
      myClientID: "AAAAAAAA",
      gameStartInfo: {
        gameID: "game1234",
        lobbyCreatedAt: 1,
        config,
        players: [],
      },
    } as unknown as ServerMessage;
    const back = decodeServerMessage(
      encodeServerMessage(start, undefined),
      undefined,
    );
    expect(
      back.type === "start" && back.gameStartInfo.config.customMap,
    ).toEqual(config.customMap);
  });
});
