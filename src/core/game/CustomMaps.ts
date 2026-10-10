import { z } from "zod";
import type { GeneratedMap } from "./MapGenerator";
import type { MapManifest, Nation } from "./TerrainMapLoader";

// Maps made by players (the map editor), next to the official ones that ship
// with the game. A game played on one names it in its config by its id: the
// SHA-256 of its files, so every client checks it plays the very same map.
// Where the files come from depends on the page: a map just made in the
// editor is in memory (blob URLs), a published one will come from our
// servers. Games on them are never counted in the official maps' stats.

export const CustomMapRefSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{64}$/),
  name: z.string().trim().min(1).max(40),
});
export type CustomMapRef = z.infer<typeof CustomMapRefSchema>;

/** Where one custom map's files can be fetched. */
export interface CustomMapFileUrls {
  mapBin: string;
  map4xBin: string;
  map16xBin: string;
  manifest: string;
  thumbnail: string;
}

const files = new Map<string, CustomMapFileUrls>();

/** Makes a custom map's files available to the game on this page. */
export function registerCustomMapFiles(
  id: string,
  urls: CustomMapFileUrls,
): void {
  files.set(id, urls);
}

export function customMapFiles(id: string): CustomMapFileUrls | null {
  return files.get(id) ?? null;
}

/** A nation placed in the editor: full-scale tile coordinates. */
export interface CustomMapNation {
  name: string;
  x: number;
  y: number;
}

/** The manifest of a generated map, as the official maps' manifest.json. */
export function customMapManifest(
  name: string,
  generated: GeneratedMap,
  nations: readonly CustomMapNation[],
): MapManifest {
  const meta = (s: GeneratedMap["map"]) => ({
    width: s.width,
    height: s.height,
    num_land_tiles: s.numLandTiles,
  });
  return {
    name,
    map: meta(generated.map),
    map4x: meta(generated.map4x),
    map16x: meta(generated.map16x),
    nations: nations.map(
      (n): Nation => ({ name: n.name, coordinates: [n.x, n.y] }),
    ),
  };
}

/**
 * The map's id: the SHA-256 (hex) of its three map files and its manifest,
 * in that order, each preceded by its length.
 */
export async function customMapId(
  generated: GeneratedMap,
  manifest: MapManifest,
): Promise<string> {
  const parts = [
    generated.map.data,
    generated.map4x.data,
    generated.map16x.data,
    new TextEncoder().encode(JSON.stringify(manifest)),
  ];
  const total = parts.reduce((n, p) => n + 4 + p.length, 0);
  const all = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    new DataView(all.buffer).setUint32(at, p.length);
    all.set(p, at + 4);
    at += 4 + p.length;
  }
  const digest = await crypto.subtle.digest("SHA-256", all);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
