import { describe, expect, it } from "vitest";
import zlib from "zlib";
import {
  buildCommunityMap,
  checkMapSource,
  type MapSource,
  packUpload,
  SOURCE_VOID,
  SOURCE_WATER,
  sourceImage,
  unpackUpload,
} from "../src/core/game/CommunityMaps";
import {
  customMapFiles,
  setCustomMapServer,
} from "../src/core/game/CustomMaps";
import { generateMap } from "../src/core/game/MapGenerator";
import { buildFromUpload } from "../src/server/CommunityMapUpload";

// A 200 x 200 map: water around a square island with a little relief, and
// one land tile alone in the sea (too small, the generator removes it).
function islandSource(): MapSource {
  const width = 200;
  const height = 200;
  const tiles = new Uint8Array(width * height).fill(SOURCE_WATER);
  for (let y = 40; y < 160; y++) {
    for (let x = 40; x < 160; x++) tiles[y * width + x] = (x + y) % 31;
  }
  tiles[10 * width + 10] = 5;
  return {
    name: "  Island  ",
    width,
    height,
    tiles,
    nations: [
      { name: "Center", x: 100, y: 100 },
      { name: "Lost", x: 10, y: 10 },
    ],
  };
}

describe("community map sources", () => {
  it("accepts a well-formed source", () => {
    expect(checkMapSource(islandSource())).toBeNull();
  });

  it("refuses sizes, tiles, names and nations out of bounds", () => {
    const s = islandSource();
    expect(checkMapSource({ ...s, width: 198 })).toBe(
      "size not a multiple of 4",
    );
    expect(
      checkMapSource({
        ...s,
        width: 100,
        height: 100,
        tiles: s.tiles.slice(0, 10_000),
      }),
    ).toBe("map too small");
    expect(checkMapSource({ ...s, width: 2000, height: 2000 })).toBe(
      "map too large",
    );
    expect(checkMapSource({ ...s, tiles: s.tiles.slice(1) })).toBe(
      "tiles do not match size",
    );
    const bad = s.tiles.slice();
    bad[0] = 31;
    expect(checkMapSource({ ...s, tiles: bad })).toBe("bad tile");
    expect(checkMapSource({ ...s, name: "   " })).toBe("bad name");
    expect(checkMapSource({ ...s, name: "x".repeat(41) })).toBe("bad name");
    expect(
      checkMapSource({ ...s, nations: [{ name: "A", x: 200, y: 0 }] }),
    ).toBe("nation outside the map");
    expect(
      checkMapSource({ ...s, nations: [{ name: "A", x: 1.5, y: 0 }] }),
    ).toBe("bad nation");
    expect(
      checkMapSource({
        ...s,
        nations: Array.from({ length: 65 }, () => ({ name: "A", x: 1, y: 1 })),
      }),
    ).toBe("too many nations");
  });

  it("draws water, void and land as the generator reads them", () => {
    const s = islandSource();
    s.tiles[1] = SOURCE_VOID;
    const img = sourceImage(s);
    expect([...img.rgba.subarray(0, 4)]).toEqual([0, 0, 106, 255]);
    expect([...img.rgba.subarray(4, 8)]).toEqual([0, 0, 0, 255]);
    const land = (40 * 200 + 40) * 4;
    expect([...img.rgba.subarray(land, land + 4)]).toEqual([
      1,
      0,
      140 + 2 * ((40 + 40) % 31),
      255,
    ]);
  });

  it("builds the map, drops nations on removed land and is stable", async () => {
    const s = islandSource();
    const built = await buildCommunityMap(s);
    expect(built.droppedNations).toBe(1);
    expect(built.manifest.name).toBe("Island");
    expect(built.manifest.nations.map((n) => n.name)).toEqual(["Center"]);
    expect(built.id).toMatch(/^[0-9a-f]{64}$/);
    expect(built.generated.map.data).toEqual(
      generateMap(sourceImage(s)).map.data,
    );
    expect((await buildCommunityMap(islandSource())).id).toBe(built.id);
  });

  it("packs and unpacks an upload", () => {
    const tiles = new Uint8Array([1, 2, 3, 250]);
    const header = {
      name: "Map",
      width: 200,
      height: 200,
      nations: [{ name: "N", x: 1, y: 2 }],
    };
    const out = unpackUpload(packUpload(header, tiles));
    expect(out?.header).toEqual(header);
    expect([...out!.tiles]).toEqual([1, 2, 3, 250]);
  });

  it("refuses broken uploads", () => {
    expect(unpackUpload(new Uint8Array(2))).toBeNull();
    const huge = new Uint8Array(8);
    new DataView(huge.buffer).setUint32(0, 1000);
    expect(unpackUpload(huge)).toBeNull();
    const json = new TextEncoder().encode('{"name":1}');
    const bytes = new Uint8Array(4 + json.length);
    new DataView(bytes.buffer).setUint32(0, json.length);
    bytes.set(json, 4);
    expect(unpackUpload(bytes)).toBeNull();
  });
});

describe("community map uploads on the game server", () => {
  function upload(s: MapSource, tiles = zlib.gzipSync(s.tiles)) {
    return packUpload(
      { name: s.name, width: s.width, height: s.height, nations: s.nations },
      new Uint8Array(tiles),
    );
  }

  it("builds the same map the editor would", async () => {
    const s = islandSource();
    const result = await buildFromUpload(upload(s));
    if ("error" in result) throw new Error(result.error);
    expect(result.built.id).toBe((await buildCommunityMap(s)).id);
    expect(zlib.gunzipSync(result.gzSource)).toEqual(Buffer.from(s.tiles));
  });

  it("refuses broken tiles, bad sources and profane names", async () => {
    const s = islandSource();
    expect(await buildFromUpload(new Uint8Array(3))).toEqual({
      error: "bad upload",
    });
    expect(await buildFromUpload(upload(s, Buffer.from([1, 2, 3])))).toEqual({
      error: "bad tiles",
    });
    expect(await buildFromUpload(upload({ ...s, width: 202 }))).toEqual({
      error: "size not a multiple of 4",
    });
    expect(await buildFromUpload(upload({ ...s, name: "fuck" }))).toEqual({
      error: "name_refused",
    });
  });
});

describe("community map files", () => {
  it("come from the map server, read when needed", () => {
    const id = "a".repeat(64);
    let base = "https://one.example/";
    setCustomMapServer(() => base);
    expect(customMapFiles(id)?.mapBin).toBe(
      `https://one.example/community-maps/${id}/map.bin`,
    );
    base = "https://two.example";
    expect(customMapFiles(id)?.manifest).toBe(
      `https://two.example/community-maps/${id}/manifest.json`,
    );
    expect(customMapFiles("not-an-id")).toBeNull();
  });
});
