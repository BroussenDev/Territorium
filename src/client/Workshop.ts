import { checkMapSource, type MapSource } from "../core/game/CommunityMaps";
import { getApiBase } from "./ApiBase";
import { getAuthHeader } from "./Auth";
import { previewOf, unpackSource } from "./editor/MapPack";

// Community maps on the Steam Workshop, in the Steam app (its workshop.rs).
// A map the player publishes goes to our servers first (they wait there for
// review), then to the Workshop with the same upload, as map.territorium.
// Maps the player subscribed to are installed by Steam and played in solo
// straight away; one our moderators reject is banned from the Workshop by
// our servers.

export const WORKSHOP_URL = "https://steamcommunity.com/app/5369890/workshop/";
const AGREEMENT_URL =
  "https://steamcommunity.com/sharedfiles/workshoplegalagreement";

export const workshopItemUrl = (id: string) =>
  `https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`;

interface WorkshopBridge {
  publish(item: {
    title: string;
    description: string;
    data: string;
    preview: string;
  }): Promise<{
    ok: boolean;
    id?: string | null;
    needsAgreement?: boolean;
    error?: string | null;
  }>;
  items(): Promise<{
    maps: { id: string; data: string; updated: number }[];
    downloading: number;
  }>;
  remove(id: string): Promise<boolean>;
}

function desktop(): {
  workshop?: Partial<WorkshopBridge>;
  steam?: { openOverlayUrl?: (url: string) => Promise<boolean> };
} | null {
  if (typeof window === "undefined") return null;
  const d = (window as { openfrontDesktop?: unknown }).openfrontDesktop;
  return typeof d === "object" && d !== null
    ? (d as ReturnType<typeof desktop>)
    : null;
}

/** The Steam app's Workshop, when this is the Steam app and it has one. */
export function workshop(): WorkshopBridge | null {
  const w = desktop()?.workshop;
  return typeof w?.publish === "function" &&
    typeof w.items === "function" &&
    typeof w.remove === "function"
    ? (w as WorkshopBridge)
    : null;
}

/** Opens a page in the Steam overlay; false outside the Steam app. */
export function openInSteamOverlay(url: string): boolean {
  const open = desktop()?.steam?.openOverlayUrl;
  if (typeof open !== "function") return false;
  void open(url);
  return true;
}

export function toBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

export function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type WorkshopPublish =
  | { ok: true; id: string; needsAgreement: boolean }
  | { ok: false };

/**
 * Publishes a map our servers took (`mapId`) on the Workshop: the same
 * upload, and its thumbnail as the preview. Our servers are told the item.
 */
export async function publishToWorkshop(opts: {
  mapId: string;
  name: string;
  upload: Uint8Array;
  description: string;
}): Promise<WorkshopPublish> {
  const w = workshop();
  if (w === null) return { ok: false };
  const preview = await workshopPreview(
    `${getApiBase()}/community-maps/${opts.mapId}/thumbnail.png`,
  ).catch(() => null);
  if (preview === null) return { ok: false };
  const result = await w.publish({
    title: opts.name,
    description: opts.description,
    data: toBase64(opts.upload),
    preview: toBase64(preview),
  });
  if (!result.ok || !result.id) return { ok: false };
  const needsAgreement = result.needsAgreement === true;
  try {
    await fetch(`${getApiBase()}/community-maps/${opts.mapId}/workshop`, {
      method: "POST",
      headers: {
        Authorization: await getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workshopId: result.id }),
    });
  } catch {
    // The item is on the Workshop all the same.
  }
  if (needsAgreement) openInSteamOverlay(AGREEMENT_URL);
  return { ok: true, id: result.id, needsAgreement };
}

/** The map's thumbnail on a 16:9 PNG (Steam's previews stay under 1 MB). */
async function workshopPreview(src: string): Promise<Uint8Array> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = src;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2c6292";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(
    canvas.width / img.naturalWidth,
    canvas.height / img.naturalHeight,
  );
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (blob === null) throw new Error("preview failed");
  return new Uint8Array(await blob.arrayBuffer());
}

export interface WorkshopMap {
  workshopId: string;
  source: MapSource;
  /** A small picture of the map, drawn from its tiles. */
  preview: string;
}

/** Reads a Workshop item's map file; null when it is not a valid map. */
export async function readWorkshopMap(
  data: Uint8Array,
): Promise<MapSource | null> {
  const source = await unpackSource(data);
  return source !== null && checkMapSource(source) === null ? source : null;
}

/** The maps the player subscribed to that Steam has installed. */
export async function subscribedWorkshopMaps(): Promise<{
  maps: WorkshopMap[];
  downloading: number;
} | null> {
  const w = workshop();
  if (w === null) return null;
  const items = await w.items();
  const maps: WorkshopMap[] = [];
  for (const item of items.maps) {
    const source = await readWorkshopMap(fromBase64(item.data));
    if (source === null) continue;
    maps.push({
      workshopId: item.id,
      source,
      preview: previewOf(source),
    });
  }
  return { maps, downloading: items.downloading };
}
