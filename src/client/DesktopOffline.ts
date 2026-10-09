// Offline solo in the Steam app (its offline.rs): when territorium.gg can't
// be reached, the app opens the game's own build from the disk. There the
// player can keep playing offline (no more checks for the site, now and at
// the next launches) or go back online, and the game shows the inventory and
// catalog the online game last left with the app.
//
// The copy is for display only: offline games are never recorded, and every
// purchase or reward still goes through the API.

interface OfflineBridge {
  bundled: boolean;
  status(): Promise<{ active: boolean; staying: boolean }>;
  stay(): Promise<void>;
  goOnline(): Promise<boolean>;
}

interface OfflineCacheBridge {
  save(key: OfflineCacheKey, value: string | null): Promise<void>;
  load(key: OfflineCacheKey): Promise<string | null>;
}

export type OfflineCacheKey = "cosmetics" | "profile";

function bridge(): {
  offline?: Partial<OfflineBridge>;
  offlineCache?: Partial<OfflineCacheBridge>;
} | null {
  if (typeof window === "undefined") return null;
  const desktop = (window as { openfrontDesktop?: unknown }).openfrontDesktop;
  return typeof desktop === "object" && desktop !== null
    ? (desktop as {
        offline?: Partial<OfflineBridge>;
        offlineCache?: Partial<OfflineCacheBridge>;
      })
    : null;
}

/** The Steam app's offline controls, on its bundled build only. */
export function desktopOffline(): OfflineBridge | null {
  const offline = bridge()?.offline;
  if (
    offline?.bundled !== true ||
    typeof offline.status !== "function" ||
    typeof offline.stay !== "function" ||
    typeof offline.goOnline !== "function"
  ) {
    return null;
  }
  return offline as OfflineBridge;
}

function cache(): OfflineCacheBridge | null {
  const c = bridge()?.offlineCache;
  return typeof c?.save === "function" && typeof c.load === "function"
    ? (c as OfflineCacheBridge)
    : null;
}

/**
 * Online in the Steam app: leaves a copy of `value` (as the API sent it) for
 * the offline game; null forgets it.
 */
export function rememberForOffline(key: OfflineCacheKey, value: unknown): void {
  if (desktopOffline() !== null) return;
  const c = cache();
  if (c === null) return;
  void c.save(key, value === null ? null : JSON.stringify(value));
}

/** On the bundled build: the copy the online game left, or null. */
export async function offlineCopy(key: OfflineCacheKey): Promise<unknown> {
  if (desktopOffline() === null) return null;
  const c = cache();
  if (c === null) return null;
  try {
    const raw = await c.load(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}
