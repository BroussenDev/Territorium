import type { EditorNation } from "./EditorMap";

// The player's maps in the map editor, kept on this device (IndexedDB): as
// many as they like, each saved a moment after every change. Signed in, they
// are synced with the account (EditorSync.ts), so the browser and the Steam
// app show the same maps. Storage failures are silent: the editor still works
// with the map it has open.

export interface LibraryMap {
  id: string;
  name: string;
  width: number;
  height: number;
  terrain: Uint8Array;
  relief: Uint8Array;
  nations: EditorNation[];
  /** When the player last changed it. */
  updatedAt: number;
  /** The account copy's updatedAt as of the last sync; null: never synced. */
  syncedAt: number | null;
  /** Deleted here, waiting to be deleted from the account too. */
  deleted: boolean;
  /** A small picture, for the list. */
  thumbnail: string;
}

/** Changed since the last sync (or never synced). */
export const isDirty = (m: LibraryMap) =>
  m.syncedAt === null || m.updatedAt !== m.syncedAt;

const DB = "territorium-map-editor";
const MAPS = "maps";
const META = "meta";
// Version 1 kept one draft; it becomes the first map of the library.
const OLD_DRAFTS = "drafts";

export function newMapId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(MAPS)) {
        db.createObjectStore(MAPS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
      if (db.objectStoreNames.contains(OLD_DRAFTS)) {
        const tx = req.transaction!;
        const get = tx.objectStore(OLD_DRAFTS).get("current");
        get.onsuccess = () => {
          const d = get.result as
            | (Omit<LibraryMap, "id" | "updatedAt"> & { savedAt?: number })
            | undefined;
          if (d?.terrain instanceof Uint8Array) {
            const id = newMapId();
            tx.objectStore(MAPS).put({
              id,
              name: d.name,
              width: d.width,
              height: d.height,
              terrain: d.terrain,
              relief: d.relief,
              nations: d.nations ?? [],
              updatedAt: d.savedAt ?? Date.now(),
              syncedAt: null,
              deleted: false,
              thumbnail: "",
            } satisfies LibraryMap);
            tx.objectStore(META).put(id, "current");
          }
          db.deleteObjectStore(OLD_DRAFTS);
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
  return dbPromise.catch((e) => {
    dbPromise = null;
    throw e;
  });
}

async function request<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest,
): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction(store, mode);
      const req = run(tx.objectStore(store));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => resolve(undefined);
      tx.onabort = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

const valid = (m: LibraryMap | undefined): m is LibraryMap =>
  m !== undefined &&
  m.terrain instanceof Uint8Array &&
  m.terrain.length === m.width * m.height;

/** Every record, deleted ones included (for the sync). */
export async function allRecords(): Promise<LibraryMap[]> {
  const all =
    (await request<LibraryMap[]>(MAPS, "readonly", (s) => s.getAll())) ?? [];
  return all.filter(valid);
}

/** The player's maps, most recently changed first. */
export async function listMaps(): Promise<LibraryMap[]> {
  return (await allRecords())
    .filter((m) => !m.deleted)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getMap(id: string): Promise<LibraryMap | null> {
  const m = await request<LibraryMap>(MAPS, "readonly", (s) => s.get(id));
  return valid(m) && !m.deleted ? m : null;
}

export async function putMap(map: LibraryMap): Promise<void> {
  await request(MAPS, "readwrite", (s) => s.put(map));
}

/** Gone from this device for good (the sync is done with it). */
export async function forgetMap(id: string): Promise<void> {
  await request(MAPS, "readwrite", (s) => s.delete(id));
}

/** Deleted by the player: kept as a marker until the account forgets it. */
export async function deleteMap(id: string): Promise<void> {
  const m = await request<LibraryMap>(MAPS, "readonly", (s) => s.get(id));
  if (!valid(m)) return;
  if (m.syncedAt === null) await forgetMap(id);
  else
    await putMap({
      ...m,
      deleted: true,
      terrain: new Uint8Array(0),
      relief: new Uint8Array(0),
      width: 0,
      height: 0,
      thumbnail: "",
    });
}

/** Deletion markers, which `valid` hides. */
export async function deletedIds(): Promise<string[]> {
  const all =
    (await request<LibraryMap[]>(MAPS, "readonly", (s) => s.getAll())) ?? [];
  return all.filter((m) => m.deleted).map((m) => m.id);
}

export async function currentMapId(): Promise<string | null> {
  return (
    (await request<string>(META, "readonly", (s) => s.get("current"))) ?? null
  );
}

export async function setCurrentMapId(id: string): Promise<void> {
  await request(META, "readwrite", (s) => s.put(id, "current"));
}
