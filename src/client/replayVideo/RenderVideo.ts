import { buildTerrainRGBA } from "../render/gl/utils/ColorUtils";
import {
  RgbColor,
  SNAPSHOT_OTHER_OWNER_INDEX,
  TerritoryRecording,
  TerritorySnapshot,
} from "./TerritorySnapshots";

/**
 * Composes the end-screen video: a 30 second, real-time recording of the
 * territory snapshots, with the logo, map name, result and a progress bar.
 * Everything is drawn on a canvas and recorded with MediaRecorder, so nothing
 * leaves the player's device.
 */

export const VIDEO_SECONDS = 30;
export const VIDEO_FPS = 30;
export const VIDEO_FRAME_COUNT = VIDEO_SECONDS * VIDEO_FPS;
/** Game ticks per second (the simulation runs at 10 Hz). */
export const VIDEO_TICKS_PER_SECOND = 10;
const VIDEO_BITRATE = 8_000_000;
const OTHER_OWNER_RGB: RgbColor = [128, 128, 128];
const BACKGROUND = "#0b1220";
const TEXT_MUTED = "rgba(255, 255, 255, 0.68)";
const PROGRESS_FILL = "#34d399";
const FONT_FAMILY = '"Territorium Display", Inter, Arial, sans-serif';

export type VideoFormat = "square" | "vertical";

export const VIDEO_SIZE: Record<
  VideoFormat,
  { width: number; height: number }
> = {
  square: { width: 1080, height: 1080 },
  vertical: { width: 1080, height: 1920 },
};

/** Which snapshots show at a given frame, and how far to blend to the next. */
export interface FrameTimeline {
  from: number;
  to: number;
  /** Weight of `to` in [0, 1]. */
  mix: number;
}

/**
 * Maps video frame `frame` onto the snapshots: the first frame is the first
 * snapshot, the last frame is the last one, and frames in between blend the
 * two neighbouring snapshots.
 */
export function frameTimeline(
  frame: number,
  frameCount: number,
  snapshotCount: number,
): FrameTimeline {
  if (snapshotCount <= 1 || frameCount <= 1) {
    return { from: 0, to: 0, mix: 0 };
  }
  const last = snapshotCount - 1;
  const clamped = Math.min(Math.max(frame, 0), frameCount - 1);
  const position = (clamped / (frameCount - 1)) * last;
  const from = Math.min(Math.floor(position), last);
  const to = Math.min(from + 1, last);
  return { from, to, mix: from === last ? 0 : position - from };
}

/** Game time as "m:ss", or "h:mm:ss" past an hour. */
export function formatGameClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function videoDateStamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "territorium-<map>-<date>.<ext>", with the map slug made file-safe. */
export function videoFileName(
  mapSlug: string,
  dateStamp: string,
  extension: string,
): string {
  const slug =
    mapSlug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "partie";
  return `territorium-${slug}-${dateStamp}.${extension}`;
}

export interface VideoRecorderFormat {
  mimeType: string;
  extension: "mp4" | "webm";
}

const RECORDER_FORMATS: VideoRecorderFormat[] = [
  { mimeType: "video/mp4;codecs=avc1", extension: "mp4" },
  { mimeType: "video/webm;codecs=vp9", extension: "webm" },
  { mimeType: "video/webm;codecs=vp8", extension: "webm" },
  { mimeType: "video/webm", extension: "webm" },
];

/** First supported container, MP4 preferred. Null when none is supported. */
export function pickRecorderFormat(
  isTypeSupported: (mimeType: string) => boolean,
): VideoRecorderFormat | null {
  return RECORDER_FORMATS.find((f) => isTypeSupported(f.mimeType)) ?? null;
}

/** Whether this browser can record a canvas to a video file. */
export function canRecordTerritoryVideo(): boolean {
  if (
    typeof MediaRecorder === "undefined" ||
    typeof HTMLCanvasElement === "undefined" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  ) {
    return false;
  }
  return pickRecorderFormat((t) => MediaRecorder.isTypeSupported(t)) !== null;
}

export type VideoOutcome = "win" | "loss" | "neutral";

/** The text and facts the video shows, already translated. */
export interface VideoMeta {
  /** Display name of the map, or null when unknown. */
  mapName: string | null;
  /** Result headline: "Victoire", "Défaite", or the game's own title. */
  title: string;
  outcome: VideoOutcome;
  /** "#3 sur 50", or null when the player had no place. */
  rankText: string | null;
  /** Label above the game clock. */
  clockLabel: string;
  /** Line under the map name. */
  tagline: string;
  /** Game duration as text, shown in the footer. */
  durationText: string;
  /** Map id, used in the download file name. */
  fileSlug: string;
  /** YYYY-MM-DD, used in the download file name and footer. */
  dateStamp: string;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VideoLayout {
  width: number;
  height: number;
  margin: number;
  logo: Box;
  mapName: { x: number; y: number; maxWidth: number; size: number };
  tagline: { x: number; y: number; size: number };
  map: Box;
  clock: { x: number; y: number; size: number };
  progress: Box;
  result: { x: number; y: number; size: number };
  footer: { y: number };
}

/** Largest box with the same aspect as `src`, centred inside `box`. */
export function fitContain(srcWidth: number, srcHeight: number, box: Box): Box {
  const scale = Math.min(box.width / srcWidth, box.height / srcHeight);
  const width = Math.round(srcWidth * scale);
  const height = Math.round(srcHeight * scale);
  return {
    x: box.x + Math.round((box.width - width) / 2),
    y: box.y + Math.round((box.height - height) / 2),
    width,
    height,
  };
}

/** Where everything sits on a frame of the given format. */
export function videoLayout(format: VideoFormat): VideoLayout {
  const { width, height } = VIDEO_SIZE[format];
  const margin = 64;
  const contentWidth = width - margin * 2;
  // The vertical format has room to spare: give the map the extra height.
  const headerTop = format === "vertical" ? Math.round(height * 0.07) : 56;
  const mapTop = format === "vertical" ? Math.round(height * 0.23) : 250;
  const bottomBlock = format === "vertical" ? Math.round(height * 0.24) : 260;
  const mapBottom = height - bottomBlock;
  const logoWidth = format === "vertical" ? 420 : 300;
  const logoHeight = Math.round((logoWidth * 64) / 403);
  const titleY = headerTop + logoHeight + (format === "vertical" ? 120 : 84);
  const mapHeight = mapBottom - mapTop;
  const clockY = mapBottom + 24;
  return {
    width,
    height,
    margin,
    logo: { x: margin, y: headerTop, width: logoWidth, height: logoHeight },
    mapName: {
      x: margin,
      y: titleY,
      maxWidth: contentWidth,
      size: format === "vertical" ? 72 : 56,
    },
    tagline: {
      x: margin,
      y: titleY + (format === "vertical" ? 96 : 66),
      size: format === "vertical" ? 34 : 28,
    },
    map: { x: margin, y: mapTop, width: contentWidth, height: mapHeight },
    clock: { x: margin, y: clockY, size: 56 },
    progress: {
      x: margin,
      y: mapBottom + 120,
      width: contentWidth,
      height: 12,
    },
    result: { x: margin, y: mapBottom + 170, size: 72 },
    footer: { y: height - 56 },
  };
}

/** Clock value at a fractional position between two snapshots. */
export function interpolatedTick(
  frames: readonly TerritorySnapshot[],
  timeline: FrameTimeline,
): number {
  const a = frames[timeline.from]?.tick ?? 0;
  const b = frames[timeline.to]?.tick ?? a;
  return a + (b - a) * timeline.mix;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("2D canvas is unavailable");
  return ctx;
}

/** Shrinks the font until `text` fits in `maxWidth`. */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  weight: number,
): number {
  let s = size;
  for (; s > 16; s -= 2) {
    ctx.font = `${weight} ${s}px ${FONT_FAMILY}`;
    if (ctx.measureText(text).width <= maxWidth) break;
  }
  return s;
}

function outcomeColor(outcome: VideoOutcome): string {
  if (outcome === "win") return "#fbbf24";
  if (outcome === "loss") return "#f87171";
  return "#ffffff";
}

/**
 * Draws the frames of one recording. The territory layer is decoded from
 * palette indices once per snapshot and cached for the few snapshots in use.
 */
export class TerritoryVideoComposer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly layout: VideoLayout;
  private readonly terrainCanvas: HTMLCanvasElement;
  private readonly decoded = new Map<number, HTMLCanvasElement>();
  private static readonly CACHE_SIZE = 4;

  constructor(
    private readonly recording: TerritoryRecording,
    private readonly meta: VideoMeta,
    format: VideoFormat,
    canvas: HTMLCanvasElement,
    private readonly logo: CanvasImageSource | null,
  ) {
    this.ctx = requireContext(canvas);
    this.layout = videoLayout(format);
    const { width, height } = recording.grid;
    this.terrainCanvas = createCanvas(width, height);
    const rgba = buildTerrainRGBA(recording.terrain, width, height);
    requireContext(this.terrainCanvas).putImageData(
      new ImageData(
        new Uint8ClampedArray(rgba.buffer as ArrayBuffer),
        width,
        height,
      ),
      0,
      0,
    );
  }

  /** Draws video frame `frame` (0 to VIDEO_FRAME_COUNT - 1). */
  drawFrame(frame: number): void {
    const { frames } = this.recording;
    const L = this.layout;
    const ctx = this.ctx;
    const timeline = frameTimeline(frame, VIDEO_FRAME_COUNT, frames.length);

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, L.width, L.height);

    if (this.logo !== null) {
      ctx.drawImage(this.logo, L.logo.x, L.logo.y, L.logo.width, L.logo.height);
    }
    this.drawMapName();
    this.drawTerritories(timeline);
    this.drawClock(timeline);
    this.drawProgress(frame);
    this.drawResult();
    this.drawFooter();
    ctx.restore();
  }

  private drawMapName(): void {
    const L = this.layout;
    const ctx = this.ctx;
    const name = this.meta.mapName ?? "";
    if (name !== "") {
      const size = fitFont(ctx, name, L.mapName.maxWidth, L.mapName.size, 800);
      ctx.font = `800 ${size}px ${FONT_FAMILY}`;
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(name, L.mapName.x, L.mapName.y);
    }
    ctx.font = `500 ${L.tagline.size}px ${FONT_FAMILY}`;
    ctx.fillStyle = TEXT_MUTED;
    ctx.fillText(this.meta.tagline, L.tagline.x, L.tagline.y);
  }

  private drawTerritories(timeline: FrameTimeline): void {
    const L = this.layout;
    const ctx = this.ctx;
    const { map } = L;
    const grid = this.recording.grid;
    const box = fitContain(grid.width, grid.height, map);
    ctx.save();
    ctx.beginPath();
    ctx.rect(map.x, map.y, map.width, map.height);
    ctx.clip();
    ctx.fillStyle = "#0e2a3f";
    ctx.fillRect(map.x, map.y, map.width, map.height);
    ctx.drawImage(this.terrainCanvas, box.x, box.y, box.width, box.height);
    ctx.drawImage(
      this.decodedLayer(timeline.from),
      box.x,
      box.y,
      box.width,
      box.height,
    );
    if (timeline.to !== timeline.from && timeline.mix > 0) {
      ctx.globalAlpha = timeline.mix;
      ctx.drawImage(
        this.decodedLayer(timeline.to),
        box.x,
        box.y,
        box.width,
        box.height,
      );
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = 2;
    ctx.strokeRect(map.x, map.y, map.width, map.height);
  }

  private drawClock(timeline: FrameTimeline): void {
    const L = this.layout;
    const ctx = this.ctx;
    const seconds =
      interpolatedTick(this.recording.frames, timeline) /
      VIDEO_TICKS_PER_SECOND;
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = `500 26px ${FONT_FAMILY}`;
    ctx.fillText(this.meta.clockLabel, L.clock.x, L.clock.y);
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${L.clock.size}px ${FONT_FAMILY}`;
    ctx.fillText(formatGameClock(seconds), L.clock.x, L.clock.y + 60);
  }

  private drawProgress(frame: number): void {
    const L = this.layout;
    const ctx = this.ctx;
    const { progress } = L;
    const fraction = Math.min(1, Math.max(0, frame / (VIDEO_FRAME_COUNT - 1)));
    ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
    ctx.fillRect(progress.x, progress.y, progress.width, progress.height);
    ctx.fillStyle = PROGRESS_FILL;
    ctx.fillRect(
      progress.x,
      progress.y,
      progress.width * fraction,
      progress.height,
    );
  }

  private drawResult(): void {
    const L = this.layout;
    const ctx = this.ctx;
    const { result } = L;
    const title = this.meta.title;
    const size = fitFont(
      ctx,
      title,
      L.width - L.margin * 2 - 360,
      result.size,
      800,
    );
    ctx.font = `800 ${size}px ${FONT_FAMILY}`;
    ctx.fillStyle = outcomeColor(this.meta.outcome);
    ctx.fillText(title, result.x, result.y);
    if (this.meta.rankText !== null) {
      ctx.textAlign = "right";
      ctx.font = `700 40px ${FONT_FAMILY}`;
      ctx.fillStyle = "#ffffff";
      ctx.fillText(this.meta.rankText, L.width - L.margin, result.y);
      ctx.textAlign = "left";
    }
  }

  private drawFooter(): void {
    const L = this.layout;
    const ctx = this.ctx;
    ctx.font = `500 26px ${FONT_FAMILY}`;
    ctx.fillStyle = TEXT_MUTED;
    ctx.fillText(this.meta.durationText, L.margin, L.footer.y);
    ctx.textAlign = "right";
    ctx.fillText("territorium.gg", L.width - L.margin, L.footer.y);
    ctx.textAlign = "left";
  }

  /** Canvas holding one snapshot's territories, decoded on first use. */
  private decodedLayer(index: number): HTMLCanvasElement {
    const cached = this.decoded.get(index);
    if (cached !== undefined) return cached;
    const { recording } = this;
    const { width, height } = recording.grid;
    const canvas = createCanvas(width, height);
    const ctx = requireContext(canvas);
    const image = ctx.createImageData(width, height);
    const data = image.data;
    const owners = recording.frames[index].owners;
    for (let i = 0; i < owners.length; i++) {
      const idx = owners[i];
      if (idx === 0) continue;
      const [r, g, b] =
        idx === SNAPSHOT_OTHER_OWNER_INDEX
          ? OTHER_OWNER_RGB
          : (recording.colors[idx] ?? OTHER_OWNER_RGB);
      const o = i * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    if (this.decoded.size >= TerritoryVideoComposer.CACHE_SIZE) {
      const oldest = this.decoded.keys().next().value;
      if (oldest !== undefined) this.decoded.delete(oldest);
    }
    this.decoded.set(index, canvas);
    return canvas;
  }
}

export interface RecordTerritoryVideoOptions {
  format: VideoFormat;
  meta: VideoMeta;
  /** Image drawn in the header, e.g. the logo. Skipped when null. */
  logo: CanvasImageSource | null;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
}

export interface RecordedVideo {
  blob: Blob;
  extension: "mp4" | "webm";
}

/** Thrown when the player cancels the recording. */
export class VideoCancelledError extends Error {
  constructor() {
    super("Video recording cancelled");
    this.name = "AbortError";
  }
}

/**
 * Records the 30 second video in real time (a frame every 1/30 s). The
 * canvas is captured frame by frame, so the pacing does not depend on how
 * fast the frames are drawn.
 */
export async function recordTerritoryVideo(
  recording: TerritoryRecording,
  options: RecordTerritoryVideoOptions,
): Promise<RecordedVideo> {
  const format = pickRecorderFormat((t) => MediaRecorder.isTypeSupported(t));
  if (format === null) throw new Error("No supported video container");
  if (options.signal?.aborted) throw new VideoCancelledError();

  const { width, height } = VIDEO_SIZE[options.format];
  const canvas = createCanvas(width, height);
  const probe = canvas.captureStream(0);
  const manual =
    typeof (probe.getVideoTracks()[0] as Partial<CanvasCaptureMediaStreamTrack>)
      ?.requestFrame === "function";
  probe.getTracks().forEach((t) => t.stop());
  const stream = canvas.captureStream(manual ? 0 : VIDEO_FPS);
  const track = stream.getVideoTracks()[0];

  const composer = new TerritoryVideoComposer(
    recording,
    options.meta,
    options.format,
    canvas,
    options.logo,
  );
  const chunks: Blob[] = [];
  const frameMs = 1000 / VIDEO_FPS;
  let recorder: MediaRecorder | null = null;
  let stopped: Promise<void> = Promise.resolve();
  const abort = () => {
    if (recorder !== null && recorder.state !== "inactive") recorder.stop();
  };
  options.signal?.addEventListener("abort", abort);
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
    });
    const active = recorder;
    active.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    stopped = new Promise<void>((resolve) => {
      active.onstop = () => resolve();
    });
    active.start(1000);
    const start = performance.now();
    for (let frame = 0; frame < VIDEO_FRAME_COUNT; frame++) {
      if (options.signal?.aborted) throw new VideoCancelledError();
      composer.drawFrame(frame);
      if (manual) {
        (track as CanvasCaptureMediaStreamTrack).requestFrame();
      }
      options.onProgress?.((frame + 1) / VIDEO_FRAME_COUNT);
      const due = start + (frame + 1) * frameMs;
      await sleep(Math.max(0, due - performance.now()));
    }
    active.stop();
    await stopped;
  } catch (error) {
    if (recorder !== null && recorder.state !== "inactive") recorder.stop();
    await stopped.catch(() => undefined);
    throw error;
  } finally {
    options.signal?.removeEventListener("abort", abort);
    stream.getTracks().forEach((t) => t.stop());
  }
  if (options.signal?.aborted) throw new VideoCancelledError();
  const blob = new Blob(chunks, {
    type: format.mimeType.split(";")[0],
  });
  return { blob, extension: format.extension };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Loads the header image. Null when it fails or takes too long. */
export function loadHeaderImage(
  url: string,
  timeoutMs = 4000,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    const timer = setTimeout(() => resolve(null), timeoutMs);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = url;
  });
}
