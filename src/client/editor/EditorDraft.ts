import type { EditorNation } from "./EditorMap";

// The map being drawn is kept on this device (IndexedDB), so closing the
// page or the game never loses it. One draft; saved a moment after each
// change. Failures are silent: the editor works without it.

export interface Draft {
  name: string;
  width: number;
  height: number;
  terrain: Uint8Array;
  relief: Uint8Array;
  nations: EditorNation[];
  savedAt: number;
}

const DB = "territorium-map-editor";
const STORE = "drafts";
const KEY = "current";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB unavailable"));
  });
}

export async function loadDraft(): Promise<Draft | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        const d = req.result as Draft | undefined;
        resolve(
          d !== undefined &&
            d.terrain instanceof Uint8Array &&
            d.terrain.length === d.width * d.height
            ? d
            : null,
        );
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveDraft(draft: Draft): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(draft, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Private window or storage blocked: the editor still works.
  }
}
