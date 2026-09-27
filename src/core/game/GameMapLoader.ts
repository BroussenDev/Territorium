import { GameMapType } from "./Game";
import { NationsCountriesFile } from "./NationsMode";
import { MapManifest } from "./TerrainMapLoader";

export interface GameMapLoader {
  getMapData(map: GameMapType): MapData;
}

export interface MapData {
  mapBin: () => Promise<Uint8Array>;
  map4xBin: () => Promise<Uint8Array>;
  map16xBin: () => Promise<Uint8Array>;
  manifest: () => Promise<MapManifest>;
  webpPath: string;
  /** Load a map layer PNG by layer id. Returns an ImageBitmap. */
  layerPng: (layerId: string) => Promise<ImageBitmap>;
  /** Nations mode data, only shipped with the giant world map. */
  countriesBin?: () => Promise<Uint8Array>;
  countriesJson?: () => Promise<NationsCountriesFile>;
}
