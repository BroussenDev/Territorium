import { z } from "zod";
import { getApiBase } from "../ApiBase";
import { getAuthHeader } from "../Auth";
import {
  allRecords,
  forgetMap,
  isDirty,
  type LibraryMap,
  newMapId,
  putMap,
} from "./EditorLibrary";
import { EditorMap } from "./EditorMap";
import { packSource, previewOf, unpackSource } from "./MapPack";

// Syncs the editor's maps on this device with the ones kept on the account
// (the API's editor-maps), so the browser and the Steam app show the same.
// The newest change wins; a map changed both here and elsewhere since the
// last sync is kept twice (the copy from here under a new id). A map synced
// before and gone from the account was deleted elsewhere: it goes here too.

const RemoteSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    width: z.number(),
    height: z.number(),
    updatedAt: z.number(),
    workshopId: z.string().nullable().optional(),
  }),
);

export type SyncState = "signed-out" | "synced" | "error";

export interface SyncReport {
  state: SyncState;
  /** Maps whose content changed here (downloaded or replaced). */
  changed: string[];
  /** Maps deleted here because they were deleted elsewhere. */
  deleted: string[];
  /** Names of maps kept twice after a conflict. */
  conflicts: string[];
  /** Names of maps too large to sync (they stay on this device). */
  tooLarge: string[];
  /** The account holds as many maps as it can. */
  full: boolean;
}

let running: Promise<SyncReport> | null = null;

/** Syncs now (or joins the sync already running). */
export function syncLibrary(): Promise<SyncReport> {
  running ??= run().finally(() => (running = null));
  return running;
}

async function run(): Promise<SyncReport> {
  const report: SyncReport = {
    state: "synced",
    changed: [],
    deleted: [],
    conflicts: [],
    tooLarge: [],
    full: false,
  };
  try {
    // Inside the try: a failing auth read is a sync error, not a rejection.
    const auth = await getAuthHeader();
    if (auth === "") return { ...report, state: "signed-out" };
    const base = `${getApiBase()}/editor-maps`;
    const call = (path: string, init: RequestInit = {}) =>
      fetch(`${base}${path}`, {
        ...init,
        headers: { Authorization: auth, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(30_000),
      });

    const res = await call("");
    if (res.status === 401) return { ...report, state: "signed-out" };
    if (!res.ok) return { ...report, state: "error" };
    const parsed = RemoteSchema.safeParse(await res.json());
    if (!parsed.success) return { ...report, state: "error" };
    const remote = new Map(parsed.data.map((r) => [r.id, r]));
    const local = new Map((await allRecords()).map((m) => [m.id, m]));

    const download = async (
      id: string,
      updatedAt: number,
      workshopId: string | null,
    ) => {
      const r = await call(`/${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error(`download ${r.status}`);
      const source = await unpackSource(new Uint8Array(await r.arrayBuffer()));
      if (source === null) return;
      const map = EditorMap.fromSource(source);
      await putMap({
        id,
        name: source.name,
        width: map.width,
        height: map.height,
        terrain: map.terrain,
        relief: map.relief,
        nations: map.nations,
        updatedAt,
        syncedAt: updatedAt,
        deleted: false,
        thumbnail: previewOf(source),
        workshopId,
      });
      report.changed.push(id);
    };

    const upload = async (m: LibraryMap) => {
      const source = EditorMap.fromData(m).toSource(m.name);
      const body = await packSource(source);
      const r = await call(
        `/${encodeURIComponent(m.id)}?updatedAt=${m.updatedAt}${
          m.workshopId ? `&workshopId=${m.workshopId}` : ""
        }`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: new Blob([body]),
        },
      );
      if (r.status === 413) {
        report.tooLarge.push(m.name);
        return;
      }
      if (r.status === 429) {
        const why = await r.json().catch(() => ({}));
        if (why?.reason === "too_many") report.full = true;
        return;
      }
      if (!r.ok) throw new Error(`upload ${r.status}`);
      const { updatedAt } = (await r.json()) as { updatedAt: number };
      await putMap({ ...m, updatedAt, syncedAt: updatedAt });
    };

    // Deleted here: deleted from the account, then forgotten.
    for (const m of local.values()) {
      if (!m.deleted) continue;
      if (remote.has(m.id)) {
        const r = await call(`/${encodeURIComponent(m.id)}`, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`delete ${r.status}`);
        remote.delete(m.id);
      }
      await forgetMap(m.id);
      local.delete(m.id);
    }

    for (const r of remote.values()) {
      const m = local.get(r.id);
      if (m === undefined) {
        await download(r.id, r.updatedAt, r.workshopId ?? null);
      } else if (r.updatedAt !== m.syncedAt) {
        if (isDirty(m)) {
          // Changed on both sides: ours goes on as a copy (a map of its own,
          // which publishing would make a new Workshop item).
          const copy: LibraryMap = {
            ...m,
            id: newMapId(),
            syncedAt: null,
            workshopId: null,
          };
          await putMap(copy);
          local.set(copy.id, copy);
          report.conflicts.push(m.name);
        }
        await download(r.id, r.updatedAt, r.workshopId ?? m.workshopId ?? null);
        local.delete(r.id);
      }
    }

    for (const m of local.values()) {
      if (remote.has(m.id) && !isDirty(m)) continue;
      if (!remote.has(m.id) && m.syncedAt !== null && !isDirty(m)) {
        // Synced before, gone now: deleted on another device.
        await forgetMap(m.id);
        report.deleted.push(m.id);
        continue;
      }
      await upload(m);
    }
    return report;
  } catch (err) {
    console.warn("map editor: sync failed", err);
    return { ...report, state: "error" };
  }
}
