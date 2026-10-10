import { z } from "zod";
import { packUpload } from "../core/game/CommunityMaps";
import { getApiBase } from "./ApiBase";
import { getAuthHeader } from "./Auth";
import { ClientEnv } from "./ClientEnv";
import type { EditorMap } from "./editor/EditorMap";

// The community maps gallery and publishing (the API's community-maps
// routes; a published map is built by our game server, CommunityMapUpload).

export const CommunityMapSchema = z.object({
  id: z.string(),
  name: z.string(),
  author: z.string().nullable(),
  authorPublicId: z.string().nullable(),
  width: z.number(),
  height: z.number(),
  nations: z.number(),
  landTiles: z.number(),
  plays: z.number(),
  status: z.enum(["pending", "approved", "rejected"]),
  reason: z.string().nullable(),
  createdAt: z.number(),
  approvedAt: z.number().nullable(),
  workshopId: z.string().nullable().optional(),
});
export type CommunityMap = z.infer<typeof CommunityMapSchema>;

const PageSchema = z.object({
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  maps: z.array(CommunityMapSchema),
});
export type CommunityMapPage = z.infer<typeof PageSchema>;

export const MAP_REPORT_REASONS = [
  "offensive",
  "copyright",
  "broken",
  "other",
] as const;
export type MapReportReason = (typeof MAP_REPORT_REASONS)[number];

export function communityMapThumbnail(id: string): string {
  return `${getApiBase()}/community-maps/${id}/thumbnail.png`;
}

/** The gallery: approved maps, newest or most played first. */
export async function listCommunityMaps(opts: {
  sort: "new" | "popular";
  page: number;
  q: string;
}): Promise<CommunityMapPage | null> {
  try {
    const qs = new URLSearchParams({
      sort: opts.sort,
      page: String(opts.page),
      q: opts.q,
    });
    const res = await fetch(`${getApiBase()}/community-maps?${qs}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const parsed = PageSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The signed-in player's maps, whatever their status; null when signed out. */
export async function myCommunityMaps(): Promise<CommunityMap[] | null> {
  const auth = await getAuthHeader();
  if (auth === "") return null;
  try {
    const res = await fetch(`${getApiBase()}/community-maps/mine`, {
      headers: { Authorization: auth },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const parsed = z.array(CommunityMapSchema).safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function reportCommunityMap(
  id: string,
  reason: MapReportReason,
): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/community-maps/${id}/report`, {
      method: "POST",
      headers: {
        Authorization: await getAuthHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteCommunityMap(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${getApiBase()}/community-maps/${id}`, {
      method: "DELETE",
      headers: { Authorization: await getAuthHeader() },
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type PublishResult =
  | {
      ok: true;
      map: CommunityMap;
      droppedNations: number;
      /** What was sent: a Steam Workshop item carries the same. */
      upload: Uint8Array;
    }
  | { ok: false; error: string };

/**
 * Sends the editor's map to be published: what was drawn, compressed; our
 * game server builds the map and passes it on for review.
 */
export async function publishCommunityMap(
  map: EditorMap,
  name: string,
): Promise<PublishResult> {
  const auth = await getAuthHeader();
  if (auth === "") return { ok: false, error: "sign_in" };
  const source = map.toSource(name);
  const gz = new Uint8Array(
    await new Response(
      new Blob([source.tiles.slice()])
        .stream()
        .pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer(),
  );
  const body = packUpload(
    {
      name: source.name,
      width: source.width,
      height: source.height,
      nations: source.nations,
    },
    gz,
  );
  let base: string;
  try {
    base = ClientEnv.serverHttpBase();
  } catch {
    base = "";
  }
  try {
    const res = await fetch(`${base}/api/community-maps`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": "application/octet-stream",
      },
      body: new Blob([body]),
      signal: AbortSignal.timeout(60_000),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 201 || res.status === 200) {
      const parsed = CommunityMapSchema.safeParse(json);
      if (parsed.success) {
        return {
          ok: true,
          map: parsed.data,
          droppedNations: Number(json.droppedNations ?? 0),
          upload: body,
        };
      }
    }
    if (res.status === 409) return { ok: false, error: "already_published" };
    if (res.status === 413) return { ok: false, error: "too_large" };
    return { ok: false, error: String(json?.error ?? "unavailable") };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
