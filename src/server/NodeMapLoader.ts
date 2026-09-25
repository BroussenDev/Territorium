import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { AssetManifest } from "../core/AssetUrls";
import { GameMapType } from "../core/game/Game";
import { GameMapLoader, MapData } from "../core/game/GameMapLoader";
import { MapManifest } from "../core/game/TerrainMapLoader";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Loads maps from disk for simulations run on the server (SoloVerifier.ts).
// A dev checkout reads resources/maps/<map>/. The production image drops
// that folder: its maps are the hashed copies in static/_assets, found
// through static/asset-manifest.json.
export class NodeMapLoader implements GameMapLoader {
  private manifest: AssetManifest | null = null;

  constructor(
    private resourcesDir = path.join(ROOT, "resources/maps"),
    private staticDir = path.join(ROOT, "static"),
  ) {}

  private assetManifest(): AssetManifest {
    if (this.manifest === null) {
      const file = path.join(this.staticDir, "asset-manifest.json");
      this.manifest = fs.existsSync(file)
        ? (JSON.parse(fs.readFileSync(file, "utf8")) as AssetManifest)
        : {};
    }
    return this.manifest;
  }

  private filePath(dir: string, name: string): string {
    const local = path.join(this.resourcesDir, dir, name);
    if (fs.existsSync(local)) return local;
    const hashed = this.assetManifest()[`maps/${dir}/${name}`];
    if (hashed === undefined) {
      throw new Error(`map file not found: ${dir}/${name}`);
    }
    return path.join(this.staticDir, decodeURIComponent(hashed));
  }

  getMapData(map: GameMapType): MapData {
    const key = Object.keys(GameMapType).find(
      (k) => GameMapType[k as keyof typeof GameMapType] === map,
    );
    if (key === undefined) {
      throw new Error(`unknown map: ${map}`);
    }
    const dir = key.toLowerCase();
    const readBin = (name: string) => async () =>
      new Uint8Array(fs.readFileSync(this.filePath(dir, name)));
    return {
      mapBin: readBin("map.bin"),
      map4xBin: readBin("map4x.bin"),
      map16xBin: readBin("map16x.bin"),
      manifest: async () =>
        JSON.parse(
          fs.readFileSync(this.filePath(dir, "manifest.json"), "utf8"),
        ) as MapManifest,
      webpPath: "",
      layerPng: async () => {
        throw new Error("the server never renders map layers");
      },
    };
  }
}
