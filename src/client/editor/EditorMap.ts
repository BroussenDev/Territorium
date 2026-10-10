import {
  type MapSource,
  SOURCE_VOID,
  SOURCE_WATER,
} from "../../core/game/CommunityMaps";
import type { GeneratorImage } from "../../core/game/MapGenerator";

// The map being drawn in the map editor: one terrain value per tile, at the
// map's full size, plus the nations placed on it. Painting records what each
// stroke changed, so it can be undone. toImage() hands the map to the map
// generator (core/game/MapGenerator.ts) in the image format the official maps
// are drawn in, so an editor map and an image map are made the same way.

export enum Terrain {
  Water = 0,
  Land = 1,
  Void = 2,
}

/** Land relief, as the game reads it: 0-9 plains, 10-19 hills, 20-30 mountains. */
export const MAX_RELIEF = 30;

/** The largest map the editor makes, in tiles (the official maps' limit). */
export const MAX_TILES = 3_000_000;

export const MAX_NATIONS = 64;

export interface EditorNation {
  name: string;
  x: number;
  y: number;
}

export type PaintTool =
  | { terrain: Terrain.Water }
  | { terrain: Terrain.Void }
  | { terrain: Terrain.Land; relief: number };

// What one stroke changed: the tiles and their values before it.
interface Change {
  tiles: number[];
  terrain: number[];
  relief: number[];
  nations: EditorNation[] | null;
}

const UNDO_STEPS = 50;

export class EditorMap {
  terrain: Uint8Array;
  relief: Uint8Array;
  nations: EditorNation[] = [];
  private undoStack: Change[] = [];
  private stroke: Change | null = null;
  private touched: Uint8Array;

  constructor(
    public width: number,
    public height: number,
  ) {
    this.terrain = new Uint8Array(width * height);
    this.relief = new Uint8Array(width * height);
    this.touched = new Uint8Array(width * height);
  }

  static fromData(data: {
    width: number;
    height: number;
    terrain: Uint8Array;
    relief: Uint8Array;
    nations: EditorNation[];
  }): EditorMap {
    const map = new EditorMap(data.width, data.height);
    map.terrain.set(data.terrain);
    map.relief.set(data.relief);
    map.nations = data.nations.map((n) => ({ ...n }));
    return map;
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  at(x: number, y: number): { terrain: Terrain; relief: number } {
    const i = y * this.width + x;
    return { terrain: this.terrain[i], relief: this.relief[i] };
  }

  /** Starts a stroke: everything until endStroke() undoes in one step. */
  beginStroke(): void {
    this.stroke = { tiles: [], terrain: [], relief: [], nations: null };
  }

  endStroke(): void {
    const s = this.stroke;
    this.stroke = null;
    if (s === null) return;
    for (const i of s.tiles) this.touched[i] = 0;
    if (s.tiles.length === 0 && s.nations === null) return;
    this.undoStack.push(s);
    if (this.undoStack.length > UNDO_STEPS) this.undoStack.shift();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Undoes the last stroke; returns whether there was one. */
  undo(): boolean {
    const s = this.undoStack.pop();
    if (s === undefined) return false;
    for (let k = s.tiles.length - 1; k >= 0; k--) {
      this.terrain[s.tiles[k]] = s.terrain[k];
      this.relief[s.tiles[k]] = s.relief[k];
    }
    if (s.nations !== null) this.nations = s.nations;
    return true;
  }

  private set(i: number, terrain: number, relief: number): void {
    if (this.terrain[i] === terrain && this.relief[i] === relief) return;
    const s = this.stroke;
    if (s !== null && this.touched[i] === 0) {
      this.touched[i] = 1;
      s.tiles.push(i);
      s.terrain.push(this.terrain[i]);
      s.relief.push(this.relief[i]);
    }
    this.terrain[i] = terrain;
    this.relief[i] = relief;
  }

  private rememberNations(): void {
    if (this.stroke !== null && this.stroke.nations === null) {
      this.stroke.nations = this.nations.map((n) => ({ ...n }));
    }
  }

  /**
   * Paints a disc of `radius` tiles; returns the changed area (or null when
   * nothing changed).
   */
  paint(
    cx: number,
    cy: number,
    radius: number,
    tool: PaintTool,
  ): { x0: number; y0: number; x1: number; y1: number } | null {
    const terrain = tool.terrain;
    const relief =
      tool.terrain === Terrain.Land
        ? Math.max(0, Math.min(MAX_RELIEF, Math.round(tool.relief)))
        : 0;
    const r = Math.max(0.5, radius);
    const x0 = Math.max(0, Math.floor(cx - r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + r));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + r));
    if (x0 > x1 || y0 > y1) return null;
    const r2 = r * r;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy > r2) continue;
        this.set(y * this.width + x, terrain, relief);
      }
    }
    return { x0, y0, x1, y1 };
  }

  /**
   * Fills the connected area of the same terrain under (x, y): land becomes
   * water, water and void become land at `relief`. Returns how many tiles
   * changed.
   */
  fill(x: number, y: number, relief: number): number {
    if (!this.inside(x, y)) return 0;
    const start = y * this.width + x;
    const from = this.terrain[start];
    const to = from === Terrain.Land ? Terrain.Water : Terrain.Land;
    const toRelief = to === Terrain.Land ? relief : 0;
    const seen = new Uint8Array(this.width * this.height);
    const stack = [start];
    let changed = 0;
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (seen[i] !== 0 || this.terrain[i] !== from) continue;
      seen[i] = 1;
      this.set(i, to, toRelief);
      changed++;
      const tx = i % this.width;
      if (tx > 0) stack.push(i - 1);
      if (tx < this.width - 1) stack.push(i + 1);
      if (i >= this.width) stack.push(i - this.width);
      if (i < this.width * (this.height - 1)) stack.push(i + this.width);
    }
    return changed;
  }

  /** Places a nation on land; false when the tile isn't land or it's full. */
  addNation(x: number, y: number, name: string): boolean {
    if (!this.inside(x, y) || this.nations.length >= MAX_NATIONS) return false;
    if (this.terrain[y * this.width + x] !== Terrain.Land) return false;
    this.rememberNations();
    this.nations = [...this.nations, { name, x, y }];
    return true;
  }

  removeNation(index: number): void {
    this.rememberNations();
    this.nations = this.nations.filter((_, i) => i !== index);
  }

  renameNation(index: number, name: string): void {
    const trimmed = name.trim().slice(0, 24);
    if (trimmed === "") return;
    this.rememberNations();
    this.nations = this.nations.map((n, i) =>
      i === index ? { ...n, name: trimmed } : n,
    );
  }

  /** The same drawing at another size (nearest tile); clears the undo. */
  resized(width: number, height: number): EditorMap {
    const map = new EditorMap(width, height);
    for (let y = 0; y < height; y++) {
      const sy = Math.min(
        this.height - 1,
        Math.floor((y * this.height) / height),
      );
      for (let x = 0; x < width; x++) {
        const sx = Math.min(
          this.width - 1,
          Math.floor((x * this.width) / width),
        );
        map.terrain[y * width + x] = this.terrain[sy * this.width + sx];
        map.relief[y * width + x] = this.relief[sy * this.width + sx];
      }
    }
    map.nations = this.nations.map((n) => ({
      name: n.name,
      x: Math.min(width - 1, Math.floor((n.x * width) / this.width)),
      y: Math.min(height - 1, Math.floor((n.y * height) / this.height)),
    }));
    return map;
  }

  /** Share of the map that is land, 0 to 1. */
  landShare(): number {
    let land = 0;
    for (let i = 0; i < this.terrain.length; i++) {
      if (this.terrain[i] === Terrain.Land) land++;
    }
    return land / this.terrain.length;
  }

  /**
   * The map as the generator's image: water blue 106, void black, land blue
   * 140 + 2 x relief (red and green never both 0, so land is never void).
   */
  toImage(): GeneratorImage {
    const rgba = new Uint8Array(this.width * this.height * 4);
    for (let i = 0; i < this.terrain.length; i++) {
      const o = i * 4;
      rgba[o + 3] = 255;
      if (this.terrain[i] === Terrain.Water) {
        rgba[o + 2] = 106;
      } else if (this.terrain[i] === Terrain.Land) {
        rgba[o] = 1;
        rgba[o + 2] = 140 + 2 * this.relief[i];
      }
    }
    return { width: this.width, height: this.height, rgba };
  }

  /** What was drawn, as it is published (core/game/CommunityMaps.ts). */
  toSource(name: string): MapSource {
    const tiles = new Uint8Array(this.width * this.height);
    for (let i = 0; i < tiles.length; i++) {
      tiles[i] =
        this.terrain[i] === Terrain.Water
          ? SOURCE_WATER
          : this.terrain[i] === Terrain.Void
            ? SOURCE_VOID
            : this.relief[i];
    }
    return {
      name,
      width: this.width,
      height: this.height,
      tiles,
      nations: this.nations.map((n) => ({ ...n })),
    };
  }

  /** Back from a source (a map synced or from the Workshop). */
  static fromSource(source: MapSource): EditorMap {
    const map = new EditorMap(source.width, source.height);
    for (let i = 0; i < source.tiles.length; i++) {
      const t = source.tiles[i];
      if (t === SOURCE_WATER) map.terrain[i] = Terrain.Water;
      else if (t === SOURCE_VOID) map.terrain[i] = Terrain.Void;
      else {
        map.terrain[i] = Terrain.Land;
        map.relief[i] = Math.min(t, MAX_RELIEF);
      }
    }
    map.nations = source.nations
      .filter((n) => map.inside(n.x, n.y))
      .slice(0, MAX_NATIONS)
      .map((n) => ({ name: n.name, x: n.x, y: n.y }));
    return map;
  }

  /** An image read the way the generator reads it (alpha, then blue). */
  static fromImage(image: GeneratorImage): EditorMap {
    const map = new EditorMap(image.width, image.height);
    for (let i = 0; i < image.width * image.height; i++) {
      const o = i * 4;
      const a = image.rgba[o + 3];
      const [r, g, b] = [image.rgba[o], image.rgba[o + 1], image.rgba[o + 2]];
      if (a < 20 || b === 106) {
        map.terrain[i] = Terrain.Water;
      } else if (r === 0 && g === 0 && b === 0) {
        map.terrain[i] = Terrain.Void;
      } else {
        map.terrain[i] = Terrain.Land;
        // Rounded up as the generator packs it: the same map either way.
        map.relief[i] = Math.ceil((Math.min(200, Math.max(140, b)) - 140) / 2);
      }
    }
    return map;
  }
}

/** The relief band of a value: plains, hills or mountains. */
export function reliefBand(relief: number): "plains" | "hills" | "mountains" {
  return relief < 10 ? "plains" : relief < 20 ? "hills" : "mountains";
}

/** A size for an image of w x h: multiples of 4, at most MAX_TILES. */
export function fitImageSize(
  w: number,
  h: number,
): { width: number; height: number } {
  const scale = Math.min(1, Math.sqrt(MAX_TILES / (w * h)));
  return {
    width: Math.max(4, Math.floor((w * scale) / 4) * 4),
    height: Math.max(4, Math.floor((h * scale) / 4) * 4),
  };
}
