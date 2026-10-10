import { assetUrl } from "../AssetUrls";
import type { CustomMapRef } from "./CustomMaps";
import { GameMapType } from "./Game";
import { GameMapLoader, MapData } from "./GameMapLoader";
import { NationsCountriesFile } from "./NationsMode";
import { MapManifest } from "./TerrainMapLoader";

export class BinaryLoaderGameMapLoader implements GameMapLoader {
  private maps: Map<GameMapType, MapData>;

  constructor() {
    this.maps = new Map<GameMapType, MapData>();
  }

  private createLazyLoader<T>(importFn: () => Promise<T>): () => Promise<T> {
    let cache: Promise<T> | null = null;
    return () => {
      cache ??= importFn();
      return cache;
    };
  }

  getMapData(map: GameMapType, customMap?: CustomMapRef | null): MapData {
    if (customMap) throw new Error("Custom maps are not served here");
    const cachedMap = this.maps.get(map);
    if (cachedMap) {
      return cachedMap;
    }

    const key = Object.keys(GameMapType).find(
      (k) => GameMapType[k as keyof typeof GameMapType] === map,
    );
    const fileName = key?.toLowerCase();

    const loadBinary = (url: string) =>
      fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to load ${url}`);
          return res.arrayBuffer();
        })
        .then((buf) => new Uint8Array(buf));

    const mapAssetUrl = (path: string) => assetUrl(`maps/${fileName}/${path}`);

    const mapData = {
      mapBin: this.createLazyLoader(() => loadBinary(mapAssetUrl("map.bin"))),
      map4xBin: this.createLazyLoader(() =>
        loadBinary(mapAssetUrl("map4x.bin")),
      ),
      map16xBin: this.createLazyLoader(() =>
        loadBinary(mapAssetUrl("map16x.bin")),
      ),
      manifest: this.createLazyLoader(() =>
        fetch(mapAssetUrl("manifest.json")).then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to load ${mapAssetUrl("manifest.json")}`);
          }
          return res.json() as Promise<MapManifest>;
        }),
      ),
      webpPath: mapAssetUrl("thumbnail.webp"),
      layerPng: (layerId: string) =>
        fetch(mapAssetUrl(`${layerId}.png`))
          .then((res) => {
            if (!res.ok)
              throw new Error(
                `Failed to load ${mapAssetUrl(`${layerId}.png`)}`,
              );
            return res.blob();
          })
          .then((blob) => createImageBitmap(blob)),
      countriesBin: this.createLazyLoader(() =>
        loadBinary(mapAssetUrl("countries.bin")),
      ),
      countriesJson: this.createLazyLoader(() =>
        fetch(mapAssetUrl("countries.json")).then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to load ${mapAssetUrl("countries.json")}`);
          }
          return res.json() as Promise<NationsCountriesFile>;
        }),
      ),
    } satisfies MapData;

    this.maps.set(map, mapData);
    return mapData;
  }
}
