// The map generator: an image becomes the game's map files (map.bin and its
// 1/4 and 1/16 versions) and the thumbnail's pixels. A port of the Go tool in
// map-generator/ (map_generator.go), byte for byte the same output, so that a
// map made in the game's editor and checked on our servers is exactly the map
// the official generator would make from the same image.
//
// Pixels become terrain by their blue value:
//
// | Pixel                | Terrain     | Magnitude                    |
// | :------------------- | :---------- | :--------------------------- |
// | alpha < 20, blue 106 | Water       | distance to land (computed)  |
// | black (#000)         | Impassable  | 31 (fixed)                   |
// | blue < 140           | Land        | 0                            |
// | blue 140 - 200       | Land        | (blue - 140) / 2 (0 - 30)    |
// | blue > 200           | Land        | 30                           |
//
// Land magnitude 0-9 is plains, 10-19 highland, 20-30 mountain. Small islands
// and lakes are removed, the largest body of water is the ocean, shorelines
// are marked, and water magnitude is its distance to land.
//
// Pure computation, no dependencies: the image is decoded by the caller.

/** The smallest a body of land or lake can be; smaller ones are removed. */
export const MIN_ISLAND_SIZE = 30;
export const MIN_LAKE_SIZE = 200;

const LAND = 0;
const WATER = 1;
const IMPASSABLE = 2;

/** An image as straight (not premultiplied) 8-bit RGBA, row by row. */
export interface GeneratorImage {
  width: number;
  height: number;
  rgba: Uint8Array | Uint8ClampedArray;
}

/** One scale of a generated map: the packed tiles, as map.bin holds them. */
export interface GeneratedMapScale {
  data: Uint8Array;
  width: number;
  height: number;
  numLandTiles: number;
}

export interface GeneratedMap {
  map: GeneratedMapScale;
  map4x: GeneratedMapScale;
  map16x: GeneratedMapScale;
  /** The thumbnail's straight RGBA pixels (half the 1/4 map's size). */
  thumbnail: GeneratorImage;
}

// A terrain grid, column-major (index x * height + y) like the Go tool's
// terrain[x][y], so every scan visits tiles in the same order.
class Terrain {
  readonly type: Uint8Array;
  readonly magnitude: Float64Array;
  readonly shoreline: Uint8Array;
  readonly ocean: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const n = width * height;
    this.type = new Uint8Array(n);
    this.magnitude = new Float64Array(n);
    this.shoreline = new Uint8Array(n);
    this.ocean = new Uint8Array(n);
  }

  index(x: number, y: number): number {
    return x * this.height + y;
  }

  copyTile(from: Terrain, i: number, to: number): void {
    this.type[to] = from.type[i];
    this.magnitude[to] = from.magnitude[i];
    this.shoreline[to] = from.shoreline[i];
    this.ocean[to] = from.ocean[i];
  }
}

/**
 * Generates the map files from an image. Width and height are cut down to
 * multiples of 4 (the minimaps halve them twice). Throws when the map has no
 * land at all.
 */
export function generateMap(
  image: GeneratorImage,
  removeSmall = true,
): GeneratedMap {
  const width = image.width - (image.width % 4);
  const height = image.height - (image.height % 4);
  if (width <= 0 || height <= 0) throw new Error("Image too small");

  const terrain = new Terrain(width, height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const p = (y * image.width + x) * 4;
      const a = image.rgba[p + 3];
      // The Go tool reads premultiplied colors (image/png): same here.
      const red = premultiplied(image.rgba[p], a);
      const green = premultiplied(image.rgba[p + 1], a);
      const blue = premultiplied(image.rgba[p + 2], a);
      const i = terrain.index(x, y);
      if (a < 20 || blue === 106) {
        terrain.type[i] = WATER;
      } else if (red === 0 && green === 0 && blue === 0) {
        terrain.type[i] = IMPASSABLE;
      } else {
        terrain.type[i] = LAND;
        terrain.magnitude[i] = (Math.min(200, Math.max(140, blue)) - 140) / 2;
      }
    }
  }

  removeSmallIslands(terrain, MIN_ISLAND_SIZE, removeSmall);
  processWater(terrain, removeSmall);
  setImpassableNeighborWaterDepth(terrain);

  const terrain4x = createMiniMap(terrain);
  removeSmallIslands(terrain4x, MIN_ISLAND_SIZE / 2, removeSmall);
  processWater(terrain4x, false);
  setImpassableNeighborWaterDepth(terrain4x);

  const terrain16x = createMiniMap(terrain4x);
  processWater(terrain16x, false);
  setImpassableNeighborWaterDepth(terrain16x);

  const map = packTerrain(terrain);
  if (map.numLandTiles === 0) throw new Error("Map has 0 land tiles");
  return {
    map,
    map4x: packTerrain(terrain4x),
    map16x: packTerrain(terrain16x),
    thumbnail: createThumbnail(terrain4x, 0.5),
  };
}

// Go's color.NRGBA.RGBA(), back to 8 bits.
function premultiplied(c: number, a: number): number {
  return Math.floor((c * 0x101 * (a * 0x101)) / 0xffff) >> 8;
}

// The orthogonal neighbours inside the grid, in the Go tool's order: left,
// right, up, down.
function forNeighbors(
  t: Terrain,
  x: number,
  y: number,
  visit: (nx: number, ny: number) => boolean | void,
): void {
  if (x > 0 && visit(x - 1, y) === true) return;
  if (x < t.width - 1 && visit(x + 1, y) === true) return;
  if (y > 0 && visit(x, y - 1) === true) return;
  if (y < t.height - 1) visit(x, y + 1);
}

// The tiles of the same type connected to (x, y), breadth first. `visited`
// is shared between calls and also marks the neighbours of other types that
// were looked at, as the Go tool does.
function getArea(
  t: Terrain,
  x: number,
  y: number,
  visited: Uint8Array,
): number[] {
  const target = t.type[t.index(x, y)];
  const area: number[] = [];
  const queue: number[] = [t.index(x, y)];
  visited[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    if (t.type[i] !== target) continue;
    area.push(i);
    const cx = Math.floor(i / t.height);
    const cy = i - cx * t.height;
    forNeighbors(t, cx, cy, (nx, ny) => {
      const n = t.index(nx, ny);
      if (visited[n] === 0) {
        visited[n] = 1;
        queue.push(n);
      }
    });
  }
  return area;
}

// What a removed body becomes: the type most of its outside neighbours have
// (each counted once), ties going to water, then impassable, then land.
function majorityNeighborType(t: Terrain, body: number[]): number {
  const inBody = new Set(body);
  const seen = new Set<number>();
  const counts = [0, 0, 0];
  for (const i of body) {
    const x = Math.floor(i / t.height);
    const y = i - x * t.height;
    forNeighbors(t, x, y, (nx, ny) => {
      const n = t.index(nx, ny);
      if (inBody.has(n) || seen.has(n)) return;
      seen.add(n);
      counts[t.type[n]]++;
    });
  }
  let best = WATER;
  let bestCount = counts[WATER];
  if (counts[IMPASSABLE] > bestCount) {
    best = IMPASSABLE;
    bestCount = counts[IMPASSABLE];
  }
  if (counts[LAND] > bestCount) best = LAND;
  return best;
}

function removeSmallIslands(
  t: Terrain,
  minSize: number,
  removeSmall: boolean,
): void {
  if (!removeSmall) return;
  const visited = new Uint8Array(t.width * t.height);
  const bodies: number[][] = [];
  for (let x = 0; x < t.width; x++) {
    for (let y = 0; y < t.height; y++) {
      const i = t.index(x, y);
      if (t.type[i] !== LAND || visited[i] !== 0) continue;
      bodies.push(getArea(t, x, y, visited));
    }
  }
  for (const body of bodies) {
    if (body.length >= minSize) continue;
    const replacement = majorityNeighborType(t, body);
    for (const i of body) {
      t.type[i] = replacement;
      t.magnitude[i] = 0;
    }
  }
}

function processWater(t: Terrain, removeSmall: boolean): void {
  t.ocean.fill(0);
  const visited = new Uint8Array(t.width * t.height);
  const bodies: number[][] = [];
  for (let x = 0; x < t.width; x++) {
    for (let y = 0; y < t.height; y++) {
      const i = t.index(x, y);
      if (t.type[i] !== WATER || visited[i] !== 0) continue;
      bodies.push(getArea(t, x, y, visited));
    }
  }
  if (bodies.length === 0) return;

  // Largest first, with the Go tool's exchange sort: the order of the small
  // lakes decides which neighbours each one sees when it is filled.
  for (let i = 0; i < bodies.length - 1; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      if (bodies[j].length > bodies[i].length) {
        const swap = bodies[i];
        bodies[i] = bodies[j];
        bodies[j] = swap;
      }
    }
  }

  for (const i of bodies[0]) t.ocean[i] = 1;
  if (removeSmall) {
    for (let w = 1; w < bodies.length; w++) {
      if (bodies[w].length >= MIN_LAKE_SIZE) continue;
      const replacement = majorityNeighborType(t, bodies[w]);
      for (const i of bodies[w]) {
        t.type[i] = replacement;
        t.magnitude[i] = 0;
      }
    }
  }

  processDistToLand(t, processShore(t));
}

// Marks land next to water and water next to land as shoreline; returns the
// shoreline water tiles.
function processShore(t: Terrain): number[] {
  const shorelineWaters: number[] = [];
  for (let x = 0; x < t.width; x++) {
    for (let y = 0; y < t.height; y++) {
      const i = t.index(x, y);
      t.shoreline[i] = 0;
      const type = t.type[i];
      if (type === IMPASSABLE) continue;
      const other = type === LAND ? WATER : LAND;
      forNeighbors(t, x, y, (nx, ny) => {
        if (t.type[t.index(nx, ny)] !== other) return false;
        t.shoreline[i] = 1;
        return true;
      });
      if (type === WATER && t.shoreline[i] === 1) shorelineWaters.push(i);
    }
  }
  return shorelineWaters;
}

// Water magnitude: the distance to the nearest land, breadth first from the
// shoreline water.
function processDistToLand(t: Terrain, shorelineWaters: number[]): void {
  const visited = new Uint8Array(t.width * t.height);
  const queue = new Int32Array(t.width * t.height);
  const dist = new Int32Array(t.width * t.height);
  let tail = 0;
  for (const i of shorelineWaters) {
    queue[tail++] = i;
    visited[i] = 1;
    t.magnitude[i] = 0;
  }
  for (let head = 0; head < tail; head++) {
    const i = queue[head];
    const x = Math.floor(i / t.height);
    const y = i - x * t.height;
    const next = dist[i] + 1;
    // Down, right, up, left: the Go tool's order here.
    const visit = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= t.width || ny >= t.height) return;
      const n = t.index(nx, ny);
      if (visited[n] !== 0 || t.type[n] !== WATER) return;
      visited[n] = 1;
      t.magnitude[n] = next;
      dist[n] = next;
      queue[tail++] = n;
    };
    visit(x, y + 1);
    visit(x + 1, y);
    visit(x, y - 1);
    visit(x - 1, y);
  }
}

// Water next to impassable terrain is deep, like at the map's edge.
function setImpassableNeighborWaterDepth(t: Terrain): void {
  for (let x = 0; x < t.width; x++) {
    for (let y = 0; y < t.height; y++) {
      const i = t.index(x, y);
      if (t.type[i] !== WATER) continue;
      forNeighbors(t, x, y, (nx, ny) => {
        if (t.type[t.index(nx, ny)] !== IMPASSABLE) return false;
        t.magnitude[i] = 20;
        return true;
      });
    }
  }
}

// Half the size: each 2x2 block becomes one tile, water winning over
// impassable winning over land (narrow rivers stay for the pathfinder).
function createMiniMap(t: Terrain): Terrain {
  const mini = new Terrain(Math.floor(t.width / 2), Math.floor(t.height / 2));
  for (let x = 0; x < t.width; x++) {
    for (let y = 0; y < t.height; y++) {
      const mx = Math.floor(x / 2);
      const my = Math.floor(y / 2);
      if (mx >= mini.width || my >= mini.height) continue;
      const src = t.index(x, y);
      const dst = mini.index(mx, my);
      if (mini.type[dst] === WATER) continue;
      if (t.type[src] === WATER) {
        mini.copyTile(t, src, dst);
        continue;
      }
      if (mini.type[dst] === IMPASSABLE) continue;
      mini.copyTile(t, src, dst);
    }
  }
  return mini;
}

// map.bin: one byte per tile, row by row. Bit 7 land, bit 6 shoreline, bit 5
// ocean, bits 0-4 magnitude (water: distance / 2). Impassable is 0b10011111
// and is not counted as land.
function packTerrain(t: Terrain): GeneratedMapScale {
  const data = new Uint8Array(t.width * t.height);
  let numLandTiles = 0;
  for (let x = 0; x < t.width; x++) {
    for (let y = 0; y < t.height; y++) {
      const i = t.index(x, y);
      const out = y * t.width + x;
      const type = t.type[i];
      if (type === IMPASSABLE) {
        data[out] = 0b10011111;
        continue;
      }
      let byte = 0;
      if (type === LAND) {
        byte |= 0b10000000;
        numLandTiles++;
      }
      if (t.shoreline[i] !== 0) byte |= 0b01000000;
      if (t.ocean[i] !== 0) byte |= 0b00100000;
      const mag = type === LAND ? t.magnitude[i] : t.magnitude[i] / 2;
      byte |= Math.min(Math.ceil(mag), 31);
      data[out] = byte;
    }
  }
  return { data, width: t.width, height: t.height, numLandTiles };
}

function createThumbnail(t: Terrain, quality: number): GeneratorImage {
  const width = Math.max(1, Math.floor(t.width * quality));
  const height = Math.max(1, Math.floor(t.height * quality));
  const rgba = new Uint8Array(width * height * 4);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const sx = Math.min(Math.floor(x / quality), t.width - 1);
      const sy = Math.min(Math.floor(y / quality), t.height - 1);
      const c = thumbnailColor(t, t.index(sx, sy));
      rgba.set(c, (y * width + x) * 4);
    }
  }
  return { width, height, rgba };
}

// The thumbnail's colors (water and impassable transparent), as the Go tool
// draws them.
function thumbnailColor(t: Terrain, i: number): number[] {
  const type = t.type[i];
  const mag = t.magnitude[i];
  if (type === IMPASSABLE) return [0, 0, 0, 0];
  if (type === WATER) {
    if (t.shoreline[i] !== 0) return [100, 143, 255, 0];
    const adj = 11 - Math.min(mag / 2, 10) - 10;
    return [
      Math.trunc(Math.max(70 + adj, 0)),
      Math.trunc(Math.max(132 + adj, 0)),
      Math.trunc(Math.max(180 + adj, 0)),
      0,
    ];
  }
  if (t.shoreline[i] !== 0) return [204, 203, 158, 255];
  if (mag < 10) return [190, Math.trunc(220 - 2 * mag), 138, 255];
  if (mag < 20) {
    const adj = 2 * mag;
    return [
      Math.trunc(200 + adj),
      Math.trunc(183 + adj),
      Math.trunc(138 + adj),
      255,
    ];
  }
  const v = Math.floor(230 + mag / 2);
  return [v, v, v, 255];
}
