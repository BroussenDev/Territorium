import { html, nothing, svg } from "lit";
import { customElement, query, state } from "lit/decorators.js";
import { publishCommunityMap } from "./CommunityMapsApi";
import { BaseModal } from "./components/BaseModal";
import { betaTag } from "./components/ui/BetaTag";
import { modalHeader } from "./components/ui/ModalHeader";
import {
  currentMapId,
  deleteMap,
  getMap,
  type LibraryMap,
  listMaps,
  newMapId,
  putMap,
  setCurrentMapId,
} from "./editor/EditorLibrary";
import "./editor/EditorLibraryDialog";
import { type EditorSyncStatus, syncBadge } from "./editor/EditorLibraryDialog";
import {
  EditorMap,
  fitImageSize,
  MAX_NATIONS,
  MAX_RELIEF,
  type PaintTool,
  reliefBand,
  Terrain,
} from "./editor/EditorMap";
import { prepareCustomMap } from "./editor/EditorPlay";
import { syncLibrary } from "./editor/EditorSync";
import { previewOf } from "./editor/MapPack";
import type { SinglePlayerModal } from "./SinglePlayerModal";
import { showToast, translateText } from "./Utils";
import { publishToWorkshop, workshop } from "./Workshop";

// The map editor (its own page): paint water, land with its relief and void
// tiles, place nations, import an image, and try the map in a solo game. The
// player keeps as many maps as they like ("My creations", EditorLibrary.ts),
// saved as they draw and, signed in, synced with their account so the browser
// and the Steam app show the same. Publishing happens in the Steam app only:
// maps go to our gallery and to the Steam Workshop.

type Tool = "water" | "land" | "void" | "fill" | "nation";

const SIZES = {
  small: { width: 1000, height: 600 },
  medium: { width: 1600, height: 960 },
  large: { width: 2000, height: 1200 },
} as const;
type SizeKey = keyof typeof SIZES | "image";

const MIN_BRUSH = 1;
const MAX_BRUSH = 120;
const DRAFT_DELAY_MS = 1500;
// The account copy follows a little after the last change.
const SYNC_DELAY_MS = 5000;
const STEAM_STORE_URL = "https://store.steampowered.com/app/5369890/";

// Editor colours: the thumbnail palette for land, a calm sea, void as the
// background the game paints it with.
const WATER: [number, number, number] = [44, 98, 146];
const WATER_SHORE: [number, number, number] = [72, 132, 182];
const VOID: [number, number, number] = [6, 10, 12];
const LAND_SHORE: [number, number, number] = [204, 203, 158];

function landColour(relief: number): [number, number, number] {
  if (relief < 10) return [190, 220 - 2 * relief, 138];
  if (relief < 20)
    return [200 + 2 * relief, 183 + 2 * relief, 138 + 2 * relief];
  const g = Math.floor(230 + relief / 2);
  return [g, g, g];
}

@customElement("map-editor-modal")
export class MapEditorModal extends BaseModal {
  protected routerName = "map-editor";

  @state() private map = new EditorMap(SIZES.medium.width, SIZES.medium.height);
  @state() private mapName = "";
  @state() private tool: Tool = "land";
  @state() private brush = 16;
  @state() private relief = 4;
  @state() private sizeKey: SizeKey = "medium";
  @state() private grid = false;
  @state() private busy = false;
  @state() private libraryOpen = false;
  @state() private libraryMaps: LibraryMap[] = [];
  @state() private sync: EditorSyncStatus = "local";
  @state() private steamOnly = false;
  // The Workshop item the open map was published as: publishing updates it.
  @state() private workshopId: string | null = null;
  @state() private publishing: "ask" | "sending" | null = null;
  @state() private cursor: { x: number; y: number } | null = null;
  // Bumped on every change, so the side panel re-reads the map.
  @state() private revision = 0;

  @query("canvas[data-editor-map]") private canvas?: HTMLCanvasElement;
  @query("input[data-editor-import]") private fileInput?: HTMLInputElement;

  // The map's pixels at one per tile, drawn scaled onto the canvas.
  private off: HTMLCanvasElement | null = null;
  private image: ImageData | null = null;
  // View: CSS pixels per tile and the map's top-left corner, in CSS pixels.
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private fitted = false;
  private painting = false;
  private panning: { x: number; y: number } | null = null;
  private spaceDown = false;
  private lastPaint: { x: number; y: number } | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private draftLoaded = false;
  // The open map's id in the library.
  private currentId = "";

  constructor() {
    super();
    this.id = "page-map-editor";
  }

  createRenderRoot() {
    return this;
  }

  protected override async onOpen(): Promise<void> {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("visibilitychange", this.onVisibility);
    if (!this.draftLoaded) {
      this.draftLoaded = true;
      const id = await currentMapId();
      let saved =
        (id !== null ? await getMap(id) : null) ?? (await listMaps())[0];
      // Nothing here yet: the account may have maps from another device.
      if (saved === undefined) {
        this.sync = "syncing";
        this.sync = (await syncLibrary()).state;
        saved = (await listMaps())[0];
      }
      if (saved !== undefined && saved !== null) this.show(saved);
      else this.startMap(sampleMap(), true);
    }
    await this.updateComplete;
    this.attachCanvas();
    void this.syncNow();
  }

  private onVisibility = () => {
    if (document.visibilityState === "visible") void this.syncNow();
  };

  /** Opens a map of the library in the editor. */
  private show(saved: LibraryMap): void {
    this.currentId = saved.id;
    this.workshopId = saved.workshopId ?? null;
    this.map = EditorMap.fromData(saved);
    this.mapName = saved.name;
    this.sizeKey = this.sizeOf(saved.width, saved.height);
    this.rebuildImage();
    this.fitted = false;
    this.revision++;
    void setCurrentMapId(saved.id);
    if (this.canvas) this.attachCanvas();
  }

  /** Starts a new map in the library and opens it. */
  private startMap(map: EditorMap, sample = false): void {
    this.currentId = newMapId();
    this.workshopId = null;
    this.map = map;
    this.mapName = translateText(
      sample ? "map_editor.sample_name" : "map_editor.default_name",
    );
    this.sizeKey = this.sizeOf(map.width, map.height);
    this.rebuildImage();
    this.fitted = false;
    void setCurrentMapId(this.currentId);
    this.changed();
    void this.flushDraft();
    if (this.canvas) this.attachCanvas();
  }

  protected override onClose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    void this.flushDraft();
    this.libraryOpen = false;
    this.steamOnly = false;
  }

  private sizeOf(width: number, height: number): SizeKey {
    for (const [key, s] of Object.entries(SIZES)) {
      if (s.width === width && s.height === height) return key as SizeKey;
    }
    return "image";
  }

  // ---- Canvas -------------------------------------------------------------

  private attachCanvas(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    this.resizeObserver?.disconnect();
    this.resizeObserver = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (!this.fitted) this.fit();
      this.draw();
    });
    this.resizeObserver.observe(canvas);
  }

  private fit(): void {
    const canvas = this.canvas;
    if (!canvas || canvas.clientWidth === 0) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    this.scale = Math.min(w / this.map.width, h / this.map.height) * 0.96;
    this.ox = (w - this.map.width * this.scale) / 2;
    this.oy = (h - this.map.height * this.scale) / 2;
    this.fitted = true;
  }

  private zoomAt(factor: number, cx: number, cy: number): void {
    const next = Math.max(0.05, Math.min(24, this.scale * factor));
    const k = next / this.scale;
    this.ox = cx - (cx - this.ox) * k;
    this.oy = cy - (cy - this.oy) * k;
    this.scale = next;
    this.draw();
  }

  private rebuildImage(): void {
    this.off = document.createElement("canvas");
    this.off.width = this.map.width;
    this.off.height = this.map.height;
    this.image = new ImageData(this.map.width, this.map.height);
    this.repaint(0, 0, this.map.width - 1, this.map.height - 1);
    this.fitted = false;
    this.fit();
  }

  // Recolours a region (and the ring around it, whose shores may change).
  private repaint(x0: number, y0: number, x1: number, y1: number): void {
    const map = this.map;
    const img = this.image;
    if (!img || !this.off) return;
    x0 = Math.max(0, x0 - 1);
    y0 = Math.max(0, y0 - 1);
    x1 = Math.min(map.width - 1, x1 + 1);
    y1 = Math.min(map.height - 1, y1 + 1);
    const t = map.terrain;
    const w = map.width;
    const touches = (i: number, x: number, y: number, kind: number) =>
      (x > 0 && t[i - 1] === kind) ||
      (x < w - 1 && t[i + 1] === kind) ||
      (y > 0 && t[i - w] === kind) ||
      (y < map.height - 1 && t[i + w] === kind);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * w + x;
        let c: [number, number, number];
        if (t[i] === Terrain.Void) c = VOID;
        else if (t[i] === Terrain.Water) {
          c = touches(i, x, y, Terrain.Land) ? WATER_SHORE : WATER;
        } else {
          c = touches(i, x, y, Terrain.Water)
            ? LAND_SHORE
            : landColour(map.relief[i]);
        }
        const o = i * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    this.off
      .getContext("2d")!
      .putImageData(img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  private draw(): void {
    const canvas = this.canvas;
    if (!canvas || !this.off) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(
      this.scale * dpr,
      0,
      0,
      this.scale * dpr,
      this.ox * dpr,
      this.oy * dpr,
    );
    ctx.imageSmoothingEnabled = this.scale < 1;
    ctx.drawImage(this.off, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const toScreen = (x: number, y: number) => ({
      x: this.ox + x * this.scale,
      y: this.oy + y * this.scale,
    });
    if (this.grid) {
      ctx.strokeStyle = "rgba(0,0,0,0.18)";
      ctx.lineWidth = 1;
      const step = 50;
      for (let gx = 0; gx <= this.map.width; gx += step) {
        const a = toScreen(gx, 0);
        const b = toScreen(gx, this.map.height);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (let gy = 0; gy <= this.map.height; gy += step) {
        const a = toScreen(0, gy);
        const b = toScreen(this.map.width, gy);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    for (const n of this.map.nations) {
      const p = toScreen(n.x + 0.5, n.y + 0.5);
      drawFlag(ctx, p.x, p.y, n.name);
    }
    if (this.cursor && this.paintsTerrain()) {
      const p = toScreen(this.cursor.x + 0.5, this.cursor.y + 0.5);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(
        p.x,
        p.y,
        Math.max(2, (this.brush / 2) * this.scale),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  private paintsTerrain(): boolean {
    return (
      this.tool === "water" || this.tool === "land" || this.tool === "void"
    );
  }

  // ---- Input --------------------------------------------------------------

  private tileAt(e: { clientX: number; clientY: number }) {
    const rect = this.canvas!.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left - this.ox) / this.scale);
    const y = Math.floor((e.clientY - rect.top - this.oy) / this.scale);
    return this.map.inside(x, y) ? { x, y } : null;
  }

  private paintTool(): PaintTool {
    if (this.tool === "water") return { terrain: Terrain.Water };
    if (this.tool === "void") return { terrain: Terrain.Void };
    return { terrain: Terrain.Land, relief: this.relief };
  }

  private paintAt(tile: { x: number; y: number }): void {
    // Strokes between two pointer events, so a fast drag leaves no gaps.
    const from = this.lastPaint ?? tile;
    const steps = Math.max(
      1,
      Math.ceil(
        Math.hypot(tile.x - from.x, tile.y - from.y) /
          Math.max(1, this.brush / 4),
      ),
    );
    let box: { x0: number; y0: number; x1: number; y1: number } | null = null;
    for (let s = 1; s <= steps; s++) {
      const x = from.x + ((tile.x - from.x) * s) / steps + 0.5;
      const y = from.y + ((tile.y - from.y) * s) / steps + 0.5;
      const area = this.map.paint(x, y, this.brush / 2, this.paintTool());
      if (area === null) continue;
      box = box
        ? {
            x0: Math.min(box.x0, area.x0),
            y0: Math.min(box.y0, area.y0),
            x1: Math.max(box.x1, area.x1),
            y1: Math.max(box.y1, area.y1),
          }
        : area;
    }
    this.lastPaint = tile;
    if (box) this.repaint(box.x0, box.y0, box.x1, box.y1);
  }

  private onPointerDown = (e: PointerEvent) => {
    const canvas = this.canvas!;
    if (e.button === 1 || (e.button === 0 && this.spaceDown)) {
      this.panning = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    const tile = this.tileAt(e);
    if (!tile) return;
    if (e.button === 2) {
      this.pick(tile);
      return;
    }
    if (e.button !== 0) return;
    if (this.tool === "nation") {
      this.map.beginStroke();
      const placed = this.map.addNation(
        tile.x,
        tile.y,
        translateText("map_editor.nation_default", {
          n: this.map.nations.length + 1,
        }),
      );
      this.map.endStroke();
      if (!placed) {
        showToast(
          translateText(
            this.map.nations.length >= MAX_NATIONS
              ? "map_editor.nations_full"
              : "map_editor.nation_on_land",
            { max: MAX_NATIONS },
          ),
          "red",
        );
        return;
      }
      this.changed();
      return;
    }
    this.map.beginStroke();
    if (this.tool === "fill") {
      this.map.fill(tile.x, tile.y, this.relief);
      this.map.endStroke();
      this.repaint(0, 0, this.map.width - 1, this.map.height - 1);
      this.changed();
      return;
    }
    this.painting = true;
    this.lastPaint = null;
    canvas.setPointerCapture(e.pointerId);
    this.paintAt(tile);
    this.draw();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.panning) {
      this.ox += e.clientX - this.panning.x;
      this.oy += e.clientY - this.panning.y;
      this.panning = { x: e.clientX, y: e.clientY };
      this.draw();
      return;
    }
    const tile = this.tileAt(e);
    this.cursor = tile;
    if (this.painting && tile) this.paintAt(tile);
    this.draw();
  };

  private onPointerUp = () => {
    this.panning = null;
    if (!this.painting) return;
    this.painting = false;
    this.lastPaint = null;
    this.map.endStroke();
    this.changed();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rect = this.canvas!.getBoundingClientRect();
      this.zoomAt(
        e.deltaY < 0 ? 1.15 : 1 / 1.15,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
      return;
    }
    const step = Math.max(1, Math.round(this.brush * 0.12));
    this.brush = Math.max(
      MIN_BRUSH,
      Math.min(MAX_BRUSH, this.brush + (e.deltaY < 0 ? step : -step)),
    );
    this.draw();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.isModalOpen) return;
    const typing = (e.target as HTMLElement | null)?.closest?.("input");
    if (e.code === "Space" && !typing) {
      this.spaceDown = true;
      e.preventDefault();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !typing) {
      e.preventDefault();
      this.undo();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "Space") this.spaceDown = false;
  };

  private pick(tile: { x: number; y: number }): void {
    const here = this.map.at(tile.x, tile.y);
    if (here.terrain === Terrain.Land) {
      this.tool = "land";
      this.relief = here.relief;
    } else {
      this.tool = here.terrain === Terrain.Water ? "water" : "void";
    }
  }

  // ---- Actions ------------------------------------------------------------

  private changed(): void {
    this.revision++;
    this.draw();
    if (this.draftTimer !== null) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => void this.flushDraft(), DRAFT_DELAY_MS);
  }

  /** Saves the open map now if it changed; resolves once it is saved. */
  private flushDraft(): Promise<void> {
    if (this.draftTimer === null) return Promise.resolve();
    clearTimeout(this.draftTimer);
    this.draftTimer = null;
    const id = this.currentId;
    const name =
      this.mapName.trim() || translateText("map_editor.default_name");
    const source = this.map.toSource(name);
    const record = {
      id,
      name,
      width: this.map.width,
      height: this.map.height,
      terrain: this.map.terrain.slice(),
      relief: this.map.relief.slice(),
      nations: this.map.nations.map((n) => ({ ...n })),
      updatedAt: Date.now(),
      deleted: false,
      thumbnail: previewOf(source),
    };
    const saved = getMap(id).then((prev) =>
      putMap({
        ...record,
        syncedAt: prev?.syncedAt ?? null,
        workshopId: prev?.workshopId ?? null,
      }),
    );
    if (this.syncTimer !== null) clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => void this.syncNow(), SYNC_DELAY_MS);
    return saved;
  }

  /** Syncs the library with the account, then follows what changed. */
  private async syncNow(): Promise<void> {
    if (this.syncTimer !== null) clearTimeout(this.syncTimer);
    this.syncTimer = null;
    await this.flushDraft();
    // Saving just now scheduled this very sync.
    if (this.syncTimer !== null) clearTimeout(this.syncTimer);
    this.syncTimer = null;
    if (this.sync !== "signed-out") this.sync = "syncing";
    const report = await syncLibrary();
    this.sync = report.state;
    for (const name of report.conflicts) {
      showToast(
        translateText("map_editor.sync_conflict", { name }),
        "red",
        8000,
      );
    }
    for (const name of report.tooLarge) {
      showToast(
        translateText("map_editor.sync_too_large", { name }),
        "red",
        8000,
      );
    }
    if (report.full) {
      showToast(translateText("map_editor.sync_full"), "red", 8000);
    }
    // The open map changed or went elsewhere: follow, unless it is being edited.
    if (this.draftTimer === null) {
      if (report.deleted.includes(this.currentId)) {
        const next = (await listMaps())[0];
        if (next) this.show(next);
        else this.startMap(this.blankMap());
        showToast(translateText("map_editor.deleted_elsewhere"), "red");
      } else if (report.changed.includes(this.currentId)) {
        const fresh = await getMap(this.currentId);
        if (fresh) this.show(fresh);
      }
    }
    if (this.libraryOpen) this.libraryMaps = await listMaps();
  }

  private async save(): Promise<void> {
    this.changed();
    await this.flushDraft();
    showToast(translateText("map_editor.saved"), "green");
    void this.syncNow();
  }

  private async openLibrary(): Promise<void> {
    await this.flushDraft();
    this.libraryMaps = await listMaps();
    this.libraryOpen = true;
    void this.syncNow();
  }

  private async openMap(id: string): Promise<void> {
    await this.flushDraft();
    const saved = await getMap(id);
    if (saved === null) return;
    this.show(saved);
    this.libraryOpen = false;
  }

  private async duplicateMap(id: string): Promise<void> {
    await this.flushDraft();
    const saved = await getMap(id);
    if (saved === null) return;
    await putMap({
      ...saved,
      id: newMapId(),
      name: translateText("map_editor.copy_name", { name: saved.name }).slice(
        0,
        40,
      ),
      updatedAt: Date.now(),
      syncedAt: null,
    });
    this.libraryMaps = await listMaps();
    void this.syncNow();
  }

  private async removeMap(id: string): Promise<void> {
    if (id === this.currentId && this.draftTimer !== null) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
    }
    await deleteMap(id);
    this.libraryMaps = await listMaps();
    if (id === this.currentId) {
      const next = this.libraryMaps[0];
      if (next) this.show(next);
      else {
        this.startMap(this.blankMap());
        await this.flushDraft();
        this.libraryMaps = await listMaps();
      }
    }
    void this.syncNow();
  }

  private blankMap(): EditorMap {
    const s = this.sizeKey === "image" ? SIZES.medium : SIZES[this.sizeKey];
    return new EditorMap(s.width, s.height);
  }

  private undo(): void {
    if (!this.map.undo()) {
      showToast(translateText("map_editor.nothing_to_undo"), "red");
      return;
    }
    this.repaint(0, 0, this.map.width - 1, this.map.height - 1);
    this.changed();
  }

  private setSize(key: SizeKey): void {
    if (key === "image") return;
    const s = SIZES[key];
    this.map = this.map.resized(s.width, s.height);
    this.sizeKey = key;
    this.rebuildImage();
    this.changed();
  }

  private async newMap(): Promise<void> {
    await this.flushDraft();
    this.libraryOpen = false;
    this.startMap(this.blankMap());
  }

  private async importImage(file: File): Promise<void> {
    try {
      const bitmap = await createImageBitmap(file);
      const size = fitImageSize(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      const data = ctx.getImageData(0, 0, size.width, size.height);
      this.map = EditorMap.fromImage({
        width: size.width,
        height: size.height,
        rgba: data.data,
      });
      this.sizeKey = this.sizeOf(size.width, size.height);
      this.rebuildImage();
      this.changed();
      if (size.width !== bitmap.width || size.height !== bitmap.height) {
        showToast(
          translateText("map_editor.image_resized", {
            w: size.width,
            h: size.height,
          }),
          "green",
        );
      }
    } catch (err) {
      console.error("map editor: import failed", err);
      showToast(translateText("map_editor.import_failed"), "red");
    }
  }

  private async testSolo(): Promise<void> {
    if (this.busy) return;
    if (this.map.landShare() === 0) {
      showToast(translateText("map_editor.check_no_land"), "red");
      return;
    }
    this.busy = true;
    // Let the "preparing" overlay paint before the generator runs.
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    try {
      const name =
        this.mapName.trim() || translateText("map_editor.default_name");
      const prepared = await prepareCustomMap(this.map, name);
      if (prepared.droppedNations > 0) {
        showToast(
          translateText("map_editor.nations_dropped", {
            n: prepared.droppedNations,
          }),
          "red",
          6000,
        );
      }
      void this.flushDraft();
      const solo = document.querySelector(
        "single-player-modal",
      ) as SinglePlayerModal | null;
      solo?.openWithCustomMap(prepared.ref, prepared.thumbnail);
    } catch (err) {
      console.error("map editor: preparing the map failed", err);
      showToast(translateText("map_editor.prepare_failed"), "red");
    } finally {
      this.busy = false;
    }
  }

  private async publish(): Promise<void> {
    if (this.publishing === "sending") return;
    this.publishing = "sending";
    try {
      const name =
        this.mapName.trim() || translateText("map_editor.default_name");
      const result = await publishCommunityMap(this.map, name);
      if (result.ok) {
        let message =
          result.map.status === "approved"
            ? "map_editor.publish_already_live"
            : "map_editor.published";
        let color: "green" | "red" = "green";
        // In the Steam app, on the Workshop too (once per version): a new
        // version of the item this map was published as before.
        if (workshop() !== null && !result.map.workshopId) {
          const ws = await publishToWorkshop({
            mapId: result.map.id,
            name: result.map.name,
            upload: result.upload,
            update: this.workshopId,
            description: translateText("map_editor.workshop_description", {
              w: result.map.width,
              h: result.map.height,
              nations: result.map.nations,
            }),
          });
          if (!ws.ok) {
            message = "map_editor.workshop_failed";
            color = "red";
          } else {
            message = ws.needsAgreement
              ? "map_editor.workshop_agreement"
              : ws.updated
                ? "map_editor.updated_workshop"
                : "map_editor.published_workshop";
            await this.rememberWorkshopItem(ws.id);
          }
        }
        this.publishing = null;
        showToast(translateText(message), color, 8000);
        return;
      }
      const known: Record<string, string> = {
        sign_in: "sign_in",
        too_many_pending: "too_many_pending",
        too_many_maps: "too_many_maps",
        name_refused: "name_refused",
        already_published: "already_published",
        too_large: "too_large",
        "map too large": "too_large",
        "map too small": "too_small",
        banned: "banned",
        too_many: "too_many",
        steam_only: "steam_only",
      };
      this.publishing = null;
      showToast(
        translateText(
          `map_editor.publish_error_${known[result.error] ?? "generic"}`,
        ),
        "red",
        6000,
      );
    } catch {
      this.publishing = null;
      showToast(translateText("map_editor.publish_error_generic"), "red");
    }
  }

  /** Links the open map to its Workshop item, on every device. */
  private async rememberWorkshopItem(id: string): Promise<void> {
    this.workshopId = id;
    await this.flushDraft();
    const saved = await getMap(this.currentId);
    if (saved !== null && saved.workshopId !== id) {
      await putMap({ ...saved, workshopId: id, updatedAt: Date.now() });
    }
    void this.syncNow();
  }

  private renderSteamOnlyDialog() {
    if (!this.steamOnly) return nothing;
    return html`<div
      class="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-steam-only-title"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) this.steamOnly = false;
      }}
    >
      <div
        class="w-full max-w-md rounded-lg border border-white/10 bg-[#0a1512] p-5 flex flex-col gap-3 text-white"
      >
        <h3 id="editor-steam-only-title" class="font-display text-xl font-bold">
          ${translateText("map_editor.steam_only_title")}
        </h3>
        <p class="text-sm text-white/80">
          ${translateText("map_editor.steam_only_body")}
        </p>
        <p class="text-sm text-white/60">
          ${translateText("map_editor.steam_only_sync")}
        </p>
        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <button
            class="rounded-md border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/5"
            @click=${() => (this.steamOnly = false)}
          >
            ${translateText("map_editor.steam_only_close")}
          </button>
          <a
            class="inline-flex items-center gap-2 rounded-md bg-[linear-gradient(160deg,#10b981,#059669_60%,#047857)] px-4 py-2 text-sm font-bold text-white hover:brightness-110"
            href=${STEAM_STORE_URL}
            target="_blank"
            rel="noopener"
          >
            ${ICON_PUBLISH} ${translateText("map_editor.steam_only_open")}
          </a>
        </div>
      </div>
    </div>`;
  }

  private renderPublishDialog() {
    if (this.publishing === null) return nothing;
    return html`<div
      class="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        class="w-full max-w-md rounded-lg border border-white/10 bg-[#0a1512] p-5 flex flex-col gap-3 text-white"
      >
        <h3 class="font-display text-xl font-bold">
          ${translateText(
            this.workshopId
              ? "map_editor.update_title"
              : "map_editor.publish_title",
          )}
        </h3>
        <p class="text-sm text-white/80">
          ${translateText(
            this.workshopId
              ? "map_editor.update_intro"
              : "map_editor.publish_intro",
            {
              name:
                this.mapName.trim() || translateText("map_editor.default_name"),
            },
          )}
        </p>
        <ul class="list-disc pl-5 text-sm text-white/65 flex flex-col gap-1">
          <li>${translateText("map_editor.publish_rule_review")}</li>
          <li>${translateText("map_editor.publish_rule_content")}</li>
          <li>${translateText("map_editor.publish_rule_play")}</li>
          ${workshop() !== null
            ? html`<li>
                ${translateText("map_editor.publish_rule_workshop")}
              </li>`
            : nothing}
        </ul>
        <div class="flex justify-end gap-2 pt-2">
          <button
            class="rounded-md border border-white/10 px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/5"
            ?disabled=${this.publishing === "sending"}
            @click=${() => (this.publishing = null)}
          >
            ${translateText("map_editor.publish_cancel")}
          </button>
          <button
            class="inline-flex items-center gap-2 rounded-md bg-[linear-gradient(160deg,#10b981,#059669_60%,#047857)] px-4 py-2 text-sm font-bold text-white hover:brightness-110 disabled:opacity-60"
            ?disabled=${this.publishing === "sending"}
            @click=${() => void this.publish()}
          >
            ${this.publishing === "sending"
              ? html`<span
                  class="size-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                ></span>`
              : ICON_PUBLISH}
            ${translateText("map_editor.publish_send")}
          </button>
        </div>
      </div>
    </div>`;
  }

  // ---- Rendering ----------------------------------------------------------

  protected renderBody() {
    void this.revision;
    const map = this.map;
    const share = Math.round(map.landShare() * 100);
    const checks: Array<[boolean, string]> = [
      [
        share > 0,
        translateText(
          share > 0 ? "map_editor.check_has_land" : "map_editor.check_no_land",
        ),
      ],
      [
        share >= 15 && share <= 85,
        translateText(
          share < 15
            ? "map_editor.check_little_land"
            : share > 85
              ? "map_editor.check_little_water"
              : "map_editor.check_balance_ok",
        ),
      ],
      [
        map.nations.length >= 2,
        translateText(
          map.nations.length >= 2
            ? "map_editor.check_nations_ok"
            : "map_editor.check_nations_hint",
        ),
      ],
    ];
    const band = reliefBand(this.relief);
    return html`
      <div class="flex flex-col h-full min-h-0">
        ${modalHeader({
          title: html`<span class="inline-flex items-center gap-3"
            >${translateText("map_editor.title")} ${betaTag()}</span
          >`,
          onBack: () => this.close(),
          ariaLabel: translateText("common.back"),
          rightContent: this.renderActions(),
        })}
        <div
          class="flex-1 min-h-0 grid gap-3 p-3 lg:grid-cols-[76px_minmax(0,1fr)_280px] grid-rows-[auto_minmax(320px,1fr)_auto] lg:grid-rows-1"
        >
          ${this.renderTools()}
          <section
            class="relative min-h-0 rounded-lg border border-white/10 bg-[#0a1512] overflow-hidden"
            aria-label=${translateText("map_editor.map")}
          >
            <canvas
              data-editor-map
              class="block w-full h-full touch-none ${this.panning ||
              this.spaceDown
                ? "cursor-grab"
                : "cursor-crosshair"}"
              @pointerdown=${this.onPointerDown}
              @pointermove=${this.onPointerMove}
              @pointerup=${this.onPointerUp}
              @pointercancel=${this.onPointerUp}
              @pointerleave=${() => {
                this.cursor = null;
                this.draw();
              }}
              @wheel=${this.onWheel}
              @contextmenu=${(e: Event) => e.preventDefault()}
            ></canvas>
            <div class="absolute right-2 top-2 flex gap-1.5">
              ${this.iconButton("zoom_in", ICON_ZOOM_IN, () => {
                const c = this.canvas!;
                this.zoomAt(1.4, c.clientWidth / 2, c.clientHeight / 2);
              })}
              ${this.iconButton("zoom_out", ICON_ZOOM_OUT, () => {
                const c = this.canvas!;
                this.zoomAt(1 / 1.4, c.clientWidth / 2, c.clientHeight / 2);
              })}
              ${this.iconButton("zoom_fit", ICON_FIT, () => {
                this.fit();
                this.draw();
              })}
              ${this.iconButton(
                "grid",
                ICON_GRID,
                () => {
                  this.grid = !this.grid;
                  this.draw();
                },
                this.grid,
              )}
            </div>
            <div
              class="absolute left-2 bottom-2 flex gap-2 pointer-events-none text-xs tabular-nums"
            >
              <span
                class="rounded-md border border-white/10 bg-black/70 px-2 py-1 text-white/60"
              >
                ${translateText("map_editor.tile")}
                <b class="text-white"
                  >${this.cursor
                    ? `${this.cursor.x}, ${this.cursor.y}`
                    : "—"}</b
                >
              </span>
              <span
                class="rounded-md border border-white/10 bg-black/70 px-2 py-1 text-white/60"
              >
                ${translateText("map_editor.terrain")}
                <b class="text-white">${this.terrainLabel()}</b>
              </span>
            </div>
            ${this.busy
              ? html`<div
                  class="absolute inset-0 grid place-items-center bg-black/60 text-white font-display font-bold"
                >
                  <span class="flex items-center gap-3">
                    <span
                      class="size-6 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin"
                    ></span>
                    ${translateText("map_editor.preparing")}
                  </span>
                </div>`
              : nothing}
          </section>
          <aside
            class="min-h-0 overflow-y-auto custom-scrollbar rounded-lg border border-white/10 bg-[#0a1512] p-4 flex flex-col gap-5 text-sm"
          >
            <section class="flex flex-col gap-3">
              <h3
                class="font-display font-bold text-xs uppercase tracking-[0.08em] text-white/55"
              >
                ${translateText("map_editor.brush")}
              </h3>
              <label class="flex flex-col gap-1.5">
                <span class="flex justify-between text-xs text-white/60">
                  ${translateText("map_editor.brush_size")}
                  <b class="text-white tabular-nums"
                    >${translateText("map_editor.tiles", { n: this.brush })}</b
                  >
                </span>
                <input
                  id="map-editor-brush"
                  type="range"
                  min=${MIN_BRUSH}
                  max=${MAX_BRUSH}
                  .value=${String(this.brush)}
                  class="accent-emerald-500"
                  @input=${(e: Event) =>
                    (this.brush = Number((e.target as HTMLInputElement).value))}
                />
              </label>
              <label
                class="flex flex-col gap-1.5 ${this.tool === "land" ||
                this.tool === "fill"
                  ? ""
                  : "opacity-45"}"
              >
                <span class="flex justify-between text-xs text-white/60">
                  ${translateText("map_editor.relief")}
                  <b class="text-white"
                    >${translateText(`map_editor.${band}`)} · ${this.relief}</b
                  >
                </span>
                <input
                  id="map-editor-relief"
                  type="range"
                  min="0"
                  max=${MAX_RELIEF}
                  .value=${String(this.relief)}
                  class="accent-emerald-500"
                  @input=${(e: Event) =>
                    (this.relief = Number(
                      (e.target as HTMLInputElement).value,
                    ))}
                />
                <span
                  class="grid grid-cols-[10fr_10fr_11fr] text-[11px] text-white/50"
                >
                  <span class="border-t-[3px] border-[#bedc8a] pt-1"
                    >${translateText("map_editor.plains")}</span
                  >
                  <span class="border-t-[3px] border-[#e6cfa4] pt-1"
                    >${translateText("map_editor.hills")}</span
                  >
                  <span class="border-t-[3px] border-[#f0f0f0] pt-1"
                    >${translateText("map_editor.mountains")}</span
                  >
                </span>
              </label>
            </section>

            <section class="flex flex-col gap-3">
              <h3
                class="font-display font-bold text-xs uppercase tracking-[0.08em] text-white/55"
              >
                ${translateText("map_editor.map")}
              </h3>
              <label class="flex flex-col gap-1.5 text-xs text-white/60">
                ${translateText("map_editor.dimensions")}
                <select
                  id="map-editor-size"
                  class="rounded-md border border-white/10 bg-black/40 px-2 py-2 text-sm text-white"
                  @change=${(e: Event) =>
                    this.setSize(
                      (e.target as HTMLSelectElement).value as SizeKey,
                    )}
                >
                  ${(Object.keys(SIZES) as Array<keyof typeof SIZES>).map(
                    (k) =>
                      html`<option value=${k} ?selected=${this.sizeKey === k}>
                        ${translateText(`map_editor.size_${k}`, {
                          w: SIZES[k].width.toLocaleString(),
                          h: SIZES[k].height.toLocaleString(),
                        })}
                      </option>`,
                  )}
                  ${this.sizeKey === "image"
                    ? html`<option value="image" selected>
                        ${translateText("map_editor.size_image", {
                          w: map.width.toLocaleString(),
                          h: map.height.toLocaleString(),
                        })}
                      </option>`
                    : nothing}
                </select>
              </label>
              <div class="grid grid-cols-2 gap-2">
                <div class="rounded-md border border-white/10 bg-black/30 p-2">
                  <b class="block font-display text-lg tabular-nums"
                    >${share} %</b
                  >
                  <span class="text-[11px] text-white/55"
                    >${translateText("map_editor.land_share")}</span
                  >
                </div>
                <div class="rounded-md border border-white/10 bg-black/30 p-2">
                  <b class="block font-display text-lg tabular-nums"
                    >${map.nations.length}</b
                  >
                  <span class="text-[11px] text-white/55"
                    >${translateText("map_editor.nations_placed")}</span
                  >
                </div>
              </div>
            </section>

            <section class="flex flex-col gap-2">
              <h3
                class="font-display font-bold text-xs uppercase tracking-[0.08em] text-white/55"
              >
                ${translateText("map_editor.checks")}
              </h3>
              <ul class="flex flex-col gap-1.5 text-[13px]">
                ${checks.map(
                  ([ok, text]) =>
                    html`<li
                      class="flex gap-2 items-start ${ok
                        ? "text-emerald-300"
                        : "text-amber-300"}"
                    >
                      ${ok ? ICON_OK : ICON_WARN} <span>${text}</span>
                    </li>`,
                )}
              </ul>
            </section>

            <section class="flex flex-col gap-2">
              <h3
                class="font-display font-bold text-xs uppercase tracking-[0.08em] text-white/55"
              >
                ${translateText("map_editor.nations")}
              </h3>
              ${map.nations.length === 0
                ? html`<p class="text-[13px] text-white/55">
                    ${translateText("map_editor.nation_hint")}
                  </p>`
                : html`<ul class="flex flex-col gap-1.5">
                    ${map.nations.map(
                      (n, i) =>
                        html`<li
                          class="grid grid-cols-[18px_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2 py-1.5"
                        >
                          ${ICON_FLAG_SMALL}
                          <input
                            id=${`map-editor-nation-${i}`}
                            class="min-w-0 bg-transparent font-semibold text-white outline-none"
                            maxlength="24"
                            .value=${n.name}
                            aria-label=${translateText(
                              "map_editor.nation_name",
                            )}
                            @change=${(e: Event) => {
                              this.map.beginStroke();
                              this.map.renameNation(
                                i,
                                (e.target as HTMLInputElement).value,
                              );
                              this.map.endStroke();
                              this.changed();
                            }}
                          />
                          <span class="text-[11px] text-white/45 tabular-nums"
                            >${n.x}, ${n.y}</span
                          >
                          <button
                            class="text-white/40 hover:text-red-300"
                            aria-label=${translateText(
                              "map_editor.remove_nation",
                            )}
                            title=${translateText("map_editor.remove_nation")}
                            @click=${() => {
                              this.map.beginStroke();
                              this.map.removeNation(i);
                              this.map.endStroke();
                              this.changed();
                            }}
                          >
                            ${ICON_CROSS}
                          </button>
                        </li>`,
                    )}
                  </ul>`}
            </section>

            <p
              class="rounded-md border border-dashed border-white/10 bg-black/20 p-2.5 text-xs leading-relaxed text-white/55"
            >
              ${translateText("map_editor.note_small")}
            </p>
          </aside>
        </div>
        <footer
          class="flex flex-wrap justify-between gap-2 px-4 pb-3 text-xs text-white/45"
        >
          <span>${translateText("map_editor.controls")}</span>
          <button
            class="hover:text-white"
            title=${translateText("map_editor.sync_now")}
            @click=${() => void this.syncNow()}
          >
            ${syncBadge(this.sync)}
          </button>
        </footer>
      </div>
      <input
        data-editor-import
        type="file"
        accept="image/png,image/jpeg,image/webp"
        class="hidden"
        @change=${(e: Event) => {
          const input = e.target as HTMLInputElement;
          const file = input.files?.[0];
          input.value = "";
          if (file) void this.importImage(file);
        }}
      />
      ${this.renderPublishDialog()} ${this.renderSteamOnlyDialog()}
      ${this.libraryOpen
        ? html`<editor-library-dialog
            .maps=${this.libraryMaps}
            .currentId=${this.currentId}
            .sync=${this.sync}
            @close-library=${() => (this.libraryOpen = false)}
            @new-map=${() => void this.newMap()}
            @open-map=${(e: CustomEvent<string>) => void this.openMap(e.detail)}
            @duplicate-map=${(e: CustomEvent<string>) =>
              void this.duplicateMap(e.detail)}
            @delete-map=${(e: CustomEvent<string>) =>
              void this.removeMap(e.detail)}
            @sync-now=${() => void this.syncNow()}
          ></editor-library-dialog>`
        : nothing}
    `;
  }

  private terrainLabel(): string {
    if (!this.cursor) return "—";
    const here = this.map.at(this.cursor.x, this.cursor.y);
    if (here.terrain === Terrain.Water)
      return translateText("map_editor.water");
    if (here.terrain === Terrain.Void) return translateText("map_editor.void");
    return translateText(`map_editor.${reliefBand(here.relief)}`);
  }

  private renderActions() {
    const button =
      "inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-45 disabled:cursor-not-allowed";
    return html`<div class="flex flex-wrap gap-2">
      <input
        id="map-editor-name"
        class="min-w-0 w-48 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm font-semibold text-white"
        maxlength="40"
        .value=${this.mapName}
        aria-label=${translateText("map_editor.name")}
        @input=${(e: Event) => {
          this.mapName = (e.target as HTMLInputElement).value;
          this.changed();
        }}
      />
      <button class=${button} @click=${() => void this.openLibrary()}>
        ${ICON_LIBRARY} ${translateText("map_editor.library")}
      </button>
      <button class=${button} @click=${() => void this.newMap()}>
        ${ICON_NEW} ${translateText("map_editor.new_map")}
      </button>
      <button class=${button} @click=${() => void this.save()}>
        ${ICON_SAVE} ${translateText("map_editor.save")}
      </button>
      <button
        class=${button}
        ?disabled=${!this.map.canUndo()}
        aria-label=${translateText("map_editor.undo")}
        title=${translateText("map_editor.undo")}
        @click=${() => this.undo()}
      >
        ${ICON_UNDO}
      </button>
      <button class=${button} @click=${() => this.fileInput?.click()}>
        ${ICON_IMAGE} ${translateText("map_editor.import")}
      </button>
      <button
        class="inline-flex items-center gap-2 rounded-md bg-[linear-gradient(160deg,#10b981,#059669_60%,#047857)] px-4 py-2 text-sm font-bold text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.2)] hover:brightness-110 disabled:opacity-60"
        ?disabled=${this.busy}
        @click=${() => void this.testSolo()}
      >
        ${ICON_PLAY} ${translateText("map_editor.test_solo")}
      </button>
      <button
        class=${button}
        aria-label=${translateText("community_maps.title")}
        title=${translateText("community_maps.title")}
        @click=${() => window.showPage?.("page-community-maps")}
      >
        ${ICON_GALLERY}
      </button>
      <button
        class=${button}
        @click=${() => {
          // Publishing goes through the Steam Workshop: the Steam app.
          if (workshop() === null) {
            this.steamOnly = true;
            return;
          }
          if (this.map.landShare() === 0) {
            showToast(translateText("map_editor.check_no_land"), "red");
            return;
          }
          this.publishing = "ask";
        }}
      >
        ${ICON_PUBLISH}
        ${translateText(
          this.workshopId && workshop() !== null
            ? "map_editor.update"
            : "map_editor.publish",
        )}
      </button>
    </div>`;
  }

  private renderTools() {
    const tool = (key: Tool, label: string, icon: unknown) =>
      html`<button
        class="flex flex-col items-center justify-center gap-1 rounded-md border px-1 py-2 text-[11px] font-semibold flex-1 lg:flex-none ${this
          .tool === key
          ? "border-emerald-800 bg-emerald-500/10 text-emerald-300"
          : "border-transparent text-white/80 hover:bg-white/5"}"
        aria-pressed=${this.tool === key}
        @click=${() => {
          this.tool = key;
          this.draw();
        }}
      >
        ${icon} ${label}
      </button>`;
    const swatch = (colour: string) =>
      html`<span
        class="size-[22px] rounded-md border border-white/15"
        style="background:${colour}"
      ></span>`;
    return html`<nav
      class="flex lg:flex-col gap-1.5 rounded-lg border border-white/10 bg-[#0a1512] p-2"
      aria-label=${translateText("map_editor.tools")}
    >
      ${tool("water", translateText("map_editor.water"), swatch("#2c6292"))}
      ${tool("land", translateText("map_editor.land"), swatch("#bedc8a"))}
      ${tool("void", translateText("map_editor.void_short"), swatch("#06090b"))}
      <div class="hidden lg:block h-px bg-white/10 my-1"></div>
      ${tool("fill", translateText("map_editor.fill"), ICON_FILL)}
      ${tool("nation", translateText("map_editor.nation"), ICON_FLAG)}
    </nav>`;
  }

  private iconButton(
    key: string,
    icon: unknown,
    onClick: () => void,
    pressed = false,
  ) {
    return html`<button
      class="grid size-9 place-items-center rounded-md border ${pressed
        ? "border-emerald-700 bg-emerald-500/15 text-emerald-300"
        : "border-white/10 bg-black/60 text-white/80 hover:text-white"}"
      aria-label=${translateText(`map_editor.${key}`)}
      title=${translateText(`map_editor.${key}`)}
      aria-pressed=${pressed}
      @click=${onClick}
    >
      ${icon}
    </button>`;
  }
}

// A flag on a pole at a nation's tile, with its name.
function drawFlag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
): void {
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#04120c";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 24);
  ctx.stroke();
  ctx.fillStyle = "#059669";
  ctx.beginPath();
  ctx.moveTo(x, y - 24);
  ctx.lineTo(x + 16, y - 19.5);
  ctx.lineTo(x, y - 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.font = "700 13px 'Territorium Display', Inter, Arial, sans-serif";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(4,18,12,0.85)";
  ctx.strokeText(name, x + 20, y - 15);
  ctx.fillStyle = "#e8f1ee";
  ctx.fillText(name, x + 20, y - 15);
  ctx.restore();
}

// The map the editor opens on the first time: an archipelago to start from.
function sampleMap(): EditorMap {
  const { width, height } = SIZES.medium;
  const map = new EditorMap(width, height);
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const blobs = Array.from({ length: 9 }, () => ({
    x: width * (0.1 + rand() * 0.8),
    y: height * (0.12 + rand() * 0.76),
    rx: width * (0.05 + rand() * 0.12),
    ry: height * (0.07 + rand() * 0.14),
  }));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = -Infinity;
      for (const b of blobs) {
        v = Math.max(v, 1 - ((x - b.x) / b.rx) ** 2 - ((y - b.y) / b.ry) ** 2);
      }
      // Ragged coasts on the islands only, never specks out at sea.
      if (v > -0.15) v += Math.sin(x * 0.04) * Math.cos(y * 0.035) * 0.12;
      if (v > 0.05) {
        const i = y * width + x;
        map.terrain[i] = Terrain.Land;
        map.relief[i] = Math.max(
          0,
          Math.min(MAX_RELIEF, Math.round((v - 0.05) * 22)),
        );
      }
    }
  }
  return map;
}

const ICON_LIBRARY = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  ${svg`<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="14" y="4" width="7" height="7" rx="1"/><rect x="3" y="15" width="7" height="5" rx="1"/><rect x="14" y="15" width="7" height="5" rx="1"/>`}
</svg>`;
const ICON_SAVE = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  ${svg`<path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2Z"/><path d="M8 3v5h7V3M8 21v-6h8v6"/>`}
</svg>`;
const ICON_UNDO = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  ${svg`<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>`}
</svg>`;
const ICON_IMAGE = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  ${svg`<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>`}
</svg>`;
const ICON_PLAY = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="currentColor"
>
  ${svg`<path d="M7 4v16l13-8z"/>`}
</svg>`;
const ICON_GALLERY = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  ${svg`<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>`}
</svg>`;
const ICON_PUBLISH = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  ${svg`<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>`}
</svg>`;
const ICON_NEW = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  ${svg`<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M12 11v6M9 14h6"/>`}
</svg>`;
const ICON_FILL = html`<svg
  class="size-6"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linejoin="round"
>
  ${svg`<path d="m4 11 7-7 8 8-7 7z"/><path d="M4 11h15"/><path d="M20 15s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4z" fill="currentColor"/>`}
</svg>`;
const ICON_FLAG = html`<svg
  class="size-6"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
>
  ${svg`<path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6"/>`}
</svg>`;
const ICON_FLAG_SMALL = html`<svg
  class="size-[18px]"
  viewBox="0 0 24 24"
  fill="none"
  stroke="#34d399"
  stroke-width="1.8"
  stroke-linecap="round"
>
  ${svg`<path d="M6 21V4"/><path d="M6 4h11l-2 4 2 4H6" fill="#059669"/>`}
</svg>`;
const ICON_CROSS = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  ${svg`<path d="M6 6l12 12M18 6 6 18"/>`}
</svg>`;
const ICON_OK = html`<svg
  class="size-[15px] shrink-0 mt-0.5"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.4"
  stroke-linecap="round"
>
  ${svg`<path d="m5 12 5 5 9-10"/>`}
</svg>`;
const ICON_WARN = html`<svg
  class="size-[15px] shrink-0 mt-0.5"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2.2"
  stroke-linecap="round"
>
  ${svg`<path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/>`}
</svg>`;
const ICON_ZOOM_IN = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  ${svg`<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M11 8v6M8 11h6"/>`}
</svg>`;
const ICON_ZOOM_OUT = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  ${svg`<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>`}
</svg>`;
const ICON_FIT = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  ${svg`<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>`}
</svg>`;
const ICON_GRID = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
>
  ${svg`<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>`}
</svg>`;
