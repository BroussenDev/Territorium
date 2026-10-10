import {
  buildCommunityMap,
  type MapSource,
} from "../../core/game/CommunityMaps";
import {
  type CustomMapRef,
  registerCustomMapFiles,
} from "../../core/game/CustomMaps";
import type { EditorMap } from "./EditorMap";

// Turns the editor's map into a map the game can play, the way our servers
// build a published one (core/game/CommunityMaps.ts): the generator's files,
// small islands and lakes removed, its id, and blob URLs registered for this
// page and its game worker.

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
  return prepareMapSource(map.toSource(name));
}

/** The same for a map as it travels (a Steam Workshop item's file). */
export async function prepareMapSource(
  source: MapSource,
): Promise<PreparedMap> {
  const built = await buildCommunityMap(source);
  const generated = built.generated;

  for (const url of previousUrls) URL.revokeObjectURL(url);
  previousUrls = [];
  const blob = (data: BlobPart, type: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    previousUrls.push(url);
    return url;
  };
  const bin = "application/octet-stream";
  const thumbnail = blob(
    await thumbnailWebp(generated.thumbnail),
    "image/webp",
  );
  registerCustomMapFiles(built.id, {
    mapBin: blob(generated.map.data, bin),
    map4xBin: blob(generated.map4x.data, bin),
    map16xBin: blob(generated.map16x.data, bin),
    manifest: blob(JSON.stringify(built.manifest), "application/json"),
    thumbnail,
  });
  return {
    ref: { id: built.id, name: built.manifest.name },
    thumbnail,
    droppedNations: built.droppedNations,
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
