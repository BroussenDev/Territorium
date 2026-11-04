/**
 * What the running game tells the bug report: a snapshot of the match and a
 * picture of the map. ClientGameRunner registers a source when a game starts
 * and drops it when the game stops; outside a game there is none, and the
 * report simply carries less.
 */

export const SCREENSHOT_MAX_WIDTH = 1280;
export const SCREENSHOT_MAX_BYTES = 400 * 1024;

export interface BugGameState {
  gameID: string | null;
  /** Map name as the game config names it. */
  map: string | null;
  /** "Free For All" or "Team". */
  mode: string | null;
  /** "Singleplayer", "Public" or "Private". */
  gameType: string | null;
  multiplayer: boolean;
  replay: boolean;
  tick: number;
  /** Game time since the spawn phase ended, in seconds. */
  elapsedSeconds: number;
  spectator: boolean;
  alive: boolean;
  tiles: number;
  /** Average frames per second over the last moments, 0 when unknown. */
  fps: number;
  /** The graphics card the browser reports, when it says. */
  gpu: string | null;
  quality: string | null;
}

export interface BugGameSource {
  snapshot(): BugGameState;
  /** A copy of the next drawn frame of the map, or null. */
  captureFrame(): Promise<HTMLCanvasElement | null>;
}

let source: BugGameSource | null = null;

export function setBugGameSource(next: BugGameSource | null): void {
  source = next;
}

export function bugGameSource(): BugGameSource | null {
  return source;
}

/** Rolling frame rate over the last `size` frames; cheap enough per frame. */
export class FpsSampler {
  private readonly stamps: number[] = [];
  constructor(private readonly size = 90) {}

  record(nowMs: number): void {
    this.stamps.push(nowMs);
    if (this.stamps.length > this.size) this.stamps.shift();
  }

  fps(): number {
    if (this.stamps.length < 2) return 0;
    const span = this.stamps[this.stamps.length - 1] - this.stamps[0];
    if (span <= 0) return 0;
    return Math.round(((this.stamps.length - 1) * 1000) / span);
  }
}

/** The size a picture of `width`x`height` is sent at: never wider than max. */
export function screenshotSize(
  width: number,
  height: number,
  maxWidth = SCREENSHOT_MAX_WIDTH,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  if (width <= maxWidth) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxWidth / width;
  return {
    width: maxWidth,
    height: Math.max(1, Math.round(height * scale)),
  };
}

const QUALITIES = [0.82, 0.7, 0.58, 0.46, 0.36];
const SCALES = [1, 0.8, 0.64, 0.5];

/**
 * Re-encodes until the picture fits: quality steps first, then a smaller
 * picture. `encode` draws and encodes at the given scale and quality (null
 * when the browser can't); the result is null if nothing fits.
 */
export async function encodeWithinLimit(
  encode: (scale: number, quality: number) => Promise<Blob | null>,
  maxBytes = SCREENSHOT_MAX_BYTES,
): Promise<Blob | null> {
  for (const scale of SCALES) {
    for (const quality of QUALITIES) {
      const blob = await encode(scale, quality);
      if (blob === null) return null;
      if (blob.size <= maxBytes) return blob;
    }
  }
  return null;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * The map picture as a WebP (JPEG where the browser can't make one), at most
 * 1280px wide and 400 KB.
 */
export async function screenshotBlob(
  canvas: HTMLCanvasElement,
): Promise<Blob | null> {
  const base = screenshotSize(canvas.width, canvas.height);
  if (base.width === 0) return null;
  const scratch = document.createElement("canvas");
  const encode = async (scale: number, quality: number) => {
    scratch.width = Math.max(1, Math.round(base.width * scale));
    scratch.height = Math.max(1, Math.round(base.height * scale));
    const ctx = scratch.getContext("2d");
    if (ctx === null) return null;
    ctx.drawImage(canvas, 0, 0, scratch.width, scratch.height);
    const webp = await canvasToBlob(scratch, "image/webp", quality);
    if (webp !== null && webp.type === "image/webp") return webp;
    return canvasToBlob(scratch, "image/jpeg", quality);
  };
  return encodeWithinLimit(encode);
}

/** A blob as a data URL, the form the report is sent in. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
