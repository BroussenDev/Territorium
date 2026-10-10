import {
  type CustomMapRef,
  customMapId,
  customMapManifest,
  registerCustomMapFiles,
} from "../../core/game/CustomMaps";
import { generateMap } from "../../core/game/MapGenerator";
import { EditorMap, Terrain } from "./EditorMap";

// Turns the editor's map into a map the game can play: the generator's files
// (the same work the official maps go through, small islands and lakes
// removed), its id, and blob URLs registered for this page and its game
// worker (core/game/CustomMaps.ts).

export interface PreparedMap {
  ref: CustomMapRef;
  thumbnail: string;
  /** Nations dropped because their tile did not survive as land. */
  droppedNations: number;
}

let previousUrls: string[] = [];

export async function prepareCustomMap(
  map: EditorMap,
  name: string,
): Promise<PreparedMap> {
  const generated = generateMap(map.toImage());
  // A nation must stand on land in the generated map: a tiny island it was
  // placed on may have been removed.
  // Land: bit 7 set, and not the impassable marker (0b10011111).
  const land = (x: number, y: number) => {
    const b = generated.map.data[y * generated.map.width + x];
    return (b & 0x80) !== 0 && b !== 0b10011111;
  };
  const nations = map.nations.filter(
    (n) =>
      n.x < generated.map.width &&
      n.y < generated.map.height &&
      map.at(n.x, n.y).terrain === Terrain.Land &&
      land(n.x, n.y),
  );
  const manifest = customMapManifest(name, generated, nations);
  const id = await customMapId(generated, manifest);

  for (const url of previousUrls) URL.revokeObjectURL(url);
  const blob = (data: BlobPart, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    previousUrls.push(url);
    return url;
  };
  previousUrls = [];
  const bin = "application/octet-stream";
  const thumbnail = blob(
    await thumbnailWebp(generated.thumbnail),
    "image/webp",
  );
  registerCustomMapFiles(id, {
    mapBin: blob(generated.map.data, bin),
    map4xBin: blob(generated.map4x.data, bin),
    map16xBin: blob(generated.map16x.data, bin),
    manifest: blob(JSON.stringify(manifest), "application/json"),
    thumbnail,
  });
  return {
    ref: { id, name },
    thumbnail,
    droppedNations: map.nations.length - nations.length,
  };
}

async function thumbnailWebp(image: {
  width: number;
  height: number;
  rgba: Uint8Array | Uint8ClampedArray;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(image.rgba), image.width, image.height),
    0,
    0,
  );
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("thumbnail failed"))),
      "image/webp",
      0.6,
    ),
  );
}
