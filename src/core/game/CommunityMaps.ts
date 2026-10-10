import {
  customMapId,
  customMapManifest,
  type CustomMapNation,
} from "./CustomMaps";
import {
  generateMap,
  type GeneratedMap,
  type GeneratorImage,
} from "./MapGenerator";
import type { MapManifest } from "./TerrainMapLoader";

// A map as drawn in the map editor, the way it travels to our servers to be
// published: one byte per tile, its nations and its name. Our game server
// builds the map from it with the same generator the client used (so nobody
// can upload hand-made files), and the API keeps it for moderation and the
// community maps gallery.

/** One byte per tile: land relief 0-30, or these two. */
export const SOURCE_WATER = 255;
export const SOURCE_VOID = 254;
export const MAX_SOURCE_RELIEF = 30;

export const MIN_MAP_SIDE = 200;
export const MAX_MAP_TILES = 3_000_000;
export const MAX_MAP_NATIONS = 64;
export const MAX_MAP_NAME = 40;
export const MAX_NATION_NAME = 24;

export interface MapSource {
  name: string;
  width: number;
  height: number;
  /** Row by row: relief 0-30 for land, SOURCE_WATER, SOURCE_VOID. */
  tiles: Uint8Array;
  nations: CustomMapNation[];
}

export interface BuiltMap {
  generated: GeneratedMap;
  manifest: MapManifest;
  id: string;
  /** Nations left out: their tile did not survive as land. */
  droppedNations: number;
}

/** Why a source is refused, or null when it is fine. */
export function checkMapSource(s: MapSource): string | null {
  if (!Number.isInteger(s.width) || !Number.isInteger(s.height)) {
    return "bad size";
  }
  if (s.width % 4 !== 0 || s.height % 4 !== 0)
    return "size not a multiple of 4";
  if (s.width < MIN_MAP_SIDE || s.height < MIN_MAP_SIDE) return "map too small";
  if (s.width * s.height > MAX_MAP_TILES) return "map too large";
  if (s.tiles.length !== s.width * s.height) return "tiles do not match size";
  for (let i = 0; i < s.tiles.length; i++) {
    const t = s.tiles[i];
    if (t > MAX_SOURCE_RELIEF && t !== SOURCE_WATER && t !== SOURCE_VOID) {
      return "bad tile";
    }
  }
  const name = s.name.trim();
  if (name.length === 0 || name.length > MAX_MAP_NAME) return "bad name";
  if (s.nations.length > MAX_MAP_NATIONS) return "too many nations";
  for (const n of s.nations) {
    const nn = n.name.trim();
    if (nn.length === 0 || nn.length > MAX_NATION_NAME)
      return "bad nation name";
    if (!Number.isInteger(n.x) || !Number.isInteger(n.y)) return "bad nation";
    if (n.x < 0 || n.y < 0 || n.x >= s.width || n.y >= s.height) {
      return "nation outside the map";
    }
  }
  return null;
}

/**
 * The image the generator reads for a source: water blue 106, void black,
 * land blue 140 + 2 x relief (red never 0, so land is never void).
 */
export function sourceImage(s: MapSource): GeneratorImage {
  const rgba = new Uint8Array(s.width * s.height * 4);
  for (let i = 0; i < s.tiles.length; i++) {
    const o = i * 4;
    const t = s.tiles[i];
    rgba[o + 3] = 255;
    if (t === SOURCE_WATER) rgba[o + 2] = 106;
    else if (t !== SOURCE_VOID) {
      rgba[o] = 1;
      rgba[o + 2] = 140 + 2 * t;
    }
  }
  return { width: s.width, height: s.height, rgba };
}

/** The map built from a source, its manifest and its id. */
export async function buildCommunityMap(s: MapSource): Promise<BuiltMap> {
  const generated = generateMap(sourceImage(s));
  const w = generated.map.width;
  // A nation must stand on land in the generated map (bit 7 set, not the
  // impassable marker): a tiny island it stood on may have been removed.
  const nations = s.nations
    .map((n) => ({ name: n.name.trim(), x: n.x, y: n.y }))
    .filter((n) => {
      const b = generated.map.data[n.y * w + n.x];
      return (b & 0x80) !== 0 && b !== 0b10011111;
    });
  const manifest = customMapManifest(s.name.trim(), generated, nations);
  return {
    generated,
    manifest,
    id: await customMapId(generated, manifest),
    droppedNations: s.nations.length - nations.length,
  };
}

// The upload: [uint32 length][JSON header][tiles], the tiles compressed by
// the sender (gzip) and inflated by the receiver.

export interface MapSourceHeader {
  name: string;
  width: number;
  height: number;
  nations: CustomMapNation[];
}

export function packUpload(
  header: MapSourceHeader,
  tiles: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(4 + json.length + tiles.length);
  new DataView(out.buffer).setUint32(0, json.length);
  out.set(json, 4);
  out.set(tiles, 4 + json.length);
  return out;
}

export function unpackUpload(
  bytes: Uint8Array,
): { header: MapSourceHeader; tiles: Uint8Array } | null {
  if (bytes.length < 4) return null;
  const len = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
  if (len > 64 * 1024 || 4 + len > bytes.length) return null;
  try {
    const h = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + len)));
    if (
      typeof h?.name !== "string" ||
      typeof h.width !== "number" ||
      typeof h.height !== "number" ||
      !Array.isArray(h.nations) ||
      !h.nations.every(
        (n: unknown) =>
          typeof (n as CustomMapNation)?.name === "string" &&
          typeof (n as CustomMapNation).x === "number" &&
          typeof (n as CustomMapNation).y === "number",
      )
    ) {
      return null;
    }
    return {
      header: {
        name: h.name,
        width: h.width,
        height: h.height,
        nations: h.nations.map((n: CustomMapNation) => ({
          name: n.name,
          x: n.x,
          y: n.y,
        })),
      },
      tiles: bytes.slice(4 + len),
    };
  } catch {
    return null;
  }
}
