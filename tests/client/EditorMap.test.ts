import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  EditorMap,
  fitImageSize,
  MAX_TILES,
  reliefBand,
  Terrain,
} from "../../src/client/editor/EditorMap";
import { generateMap } from "../../src/core/game/MapGenerator";
import { decodePng } from "../util/Png";

describe("the map editor's map", () => {
  it("paints discs of terrain with their relief", () => {
    const map = new EditorMap(40, 20);
    map.beginStroke();
    const area = map.paint(10, 10, 3, { terrain: Terrain.Land, relief: 25 });
    map.endStroke();
    expect(area).not.toBeNull();
    expect(map.at(10, 10)).toEqual({ terrain: Terrain.Land, relief: 25 });
    expect(map.at(20, 10).terrain).toBe(Terrain.Water);
    expect(reliefBand(map.at(10, 10).relief)).toBe("mountains");
  });

  it("undoes a whole stroke in one step, nations included", () => {
    const map = new EditorMap(40, 20);
    map.beginStroke();
    map.paint(10, 10, 4, { terrain: Terrain.Land, relief: 3 });
    map.paint(14, 10, 4, { terrain: Terrain.Land, relief: 3 });
    map.endStroke();
    map.beginStroke();
    expect(map.addNation(10, 10, "Nord")).toBe(true);
    expect(map.addNation(30, 10, "En mer")).toBe(false);
    map.endStroke();
    expect(map.nations).toHaveLength(1);

    expect(map.undo()).toBe(true);
    expect(map.nations).toHaveLength(0);
    expect(map.undo()).toBe(true);
    expect(map.landShare()).toBe(0);
    expect(map.undo()).toBe(false);
  });

  it("fills a connected area, and only that one", () => {
    const map = new EditorMap(20, 10);
    map.beginStroke();
    map.paint(5, 5, 2, { terrain: Terrain.Land, relief: 0 });
    map.endStroke();
    map.beginStroke();
    // The sea around the island becomes land; the island stays.
    const changed = map.fill(0, 0, 12);
    map.endStroke();
    expect(changed).toBeGreaterThan(150);
    expect(map.at(0, 0)).toEqual({ terrain: Terrain.Land, relief: 12 });
    expect(map.at(5, 5).relief).toBe(0);
  });

  it("keeps its drawing and nations when resized", () => {
    const map = new EditorMap(100, 60);
    map.beginStroke();
    map.paint(50, 30, 10, { terrain: Terrain.Land, relief: 5 });
    map.addNation(50, 30, "Centre");
    map.endStroke();
    const bigger = map.resized(200, 120);
    expect(bigger.at(100, 60).terrain).toBe(Terrain.Land);
    expect(bigger.nations[0]).toEqual({ name: "Centre", x: 100, y: 60 });
    expect(bigger.canUndo()).toBe(false);
  });

  it("caps imported images at the official maps' size", () => {
    const size = fitImageSize(4000, 3000);
    expect(size.width * size.height).toBeLessThanOrEqual(MAX_TILES);
    expect(size.width % 4).toBe(0);
    expect(fitImageSize(1001, 603)).toEqual({ width: 1000, height: 600 });
  });

  it("gives an official map back exactly through the editor", () => {
    // Image -> editor -> image -> generator: the same files as the official
    // map, so importing an image loses nothing.
    const file = path.join(
      __dirname,
      "../../map-generator/assets/maps/onion/image.png",
    );
    const editor = EditorMap.fromImage(decodePng(file));
    const out = generateMap(editor.toImage());
    const expected = fs.readFileSync(
      path.join(__dirname, "../../resources/maps/onion/map.bin"),
    );
    expect(out.map.data.findIndex((b, i) => b !== expected[i])).toBe(-1);
  });
});
