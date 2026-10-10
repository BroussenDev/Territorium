import {
  type MapSource,
  packUpload,
  SOURCE_VOID,
  SOURCE_WATER,
  unpackUpload,
} from "../../core/game/CommunityMaps";

// A map as it travels: the upload format our servers take
// (core/game/CommunityMaps.ts), its tiles gzipped. The editor syncs a
// player's maps in it, and a Steam Workshop item carries it.

async function through(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const out = new Response(bytes.slice()).body!.pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function packSource(
  source: MapSource,
): Promise<Uint8Array<ArrayBuffer>> {
  return packUpload(
    {
      name: source.name,
      width: source.width,
      height: source.height,
      nations: source.nations,
    },
    await through(source.tiles, new CompressionStream("gzip")),
  );
}

/** The map in packed bytes; null when they are not one. */
export async function unpackSource(
  bytes: Uint8Array,
): Promise<MapSource | null> {
  const upload = unpackUpload(bytes);
  if (upload === null) return null;
  try {
    const tiles = await through(upload.tiles, new DecompressionStream("gzip"));
    const { width, height } = upload.header;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0 ||
      tiles.length !== width * height
    ) {
      return null;
    }
    return { ...upload.header, tiles };
  } catch {
    return null;
  }
}

/** A small picture of a map: water blue, void black, land by relief. */
export function previewOf(s: MapSource, maxWidth = 320): string {
  const scale = Math.max(1, Math.ceil(s.width / maxWidth));
  const w = Math.max(1, Math.floor(s.width / scale));
  const h = Math.max(1, Math.floor(s.height / scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx === null) return "";
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = s.tiles[y * scale * s.width + x * scale];
      let rgb: [number, number, number];
      if (t === SOURCE_WATER) rgb = [44, 98, 146];
      else if (t === SOURCE_VOID) rgb = [12, 12, 12];
      else if (t < 10) rgb = [190, 220, 140];
      else if (t < 20) rgb = [230, 214, 170];
      else rgb = [240, 240, 240];
      img.data.set([...rgb, 255], (y * w + x) * 4);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}
