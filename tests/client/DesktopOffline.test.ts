import { afterEach, describe, expect, it, vi } from "vitest";
import {
  desktopOffline,
  offlineCopy,
  rememberForOffline,
} from "../../src/client/DesktopOffline";

function shell(bundled: boolean) {
  const store = new Map<string, string>();
  const bridge = {
    offline: {
      bundled,
      status: vi.fn(async () => ({ active: bundled, staying: false })),
      stay: vi.fn(async () => {}),
      goOnline: vi.fn(async () => false),
    },
    offlineCache: {
      save: vi.fn(async (key: string, value: string | null) => {
        if (value === null) store.delete(key);
        else store.set(key, value);
      }),
      load: vi.fn(async (key: string) => store.get(key) ?? null),
    },
  };
  (window as unknown as { openfrontDesktop?: unknown }).openfrontDesktop =
    bridge;
  return { bridge, store };
}

afterEach(() => {
  delete (window as unknown as { openfrontDesktop?: unknown })
    .openfrontDesktop;
});

describe("offline solo in the Steam app", () => {
  it("has no offline controls on the web or on the online site", () => {
    expect(desktopOffline()).toBeNull();
    shell(false);
    expect(desktopOffline()).toBeNull();
  });

  it("offers them on the app's bundled build", () => {
    shell(true);
    expect(desktopOffline()).not.toBeNull();
  });

  it("keeps what the online game saw, for the offline game only", async () => {
    const online = shell(false);
    rememberForOffline("profile", { player: { publicId: "p1" } });
    expect(online.store.get("profile")).toBe('{"player":{"publicId":"p1"}}');
    // Online, the copy is never read back.
    expect(await offlineCopy("profile")).toBeNull();

    const offline = shell(true);
    offline.store.set("profile", online.store.get("profile")!);
    expect(await offlineCopy("profile")).toEqual({
      player: { publicId: "p1" },
    });
    // The offline game never overwrites the online copy.
    rememberForOffline("profile", { player: { publicId: "other" } });
    expect(offline.bridge.offlineCache.save).not.toHaveBeenCalled();
  });

  it("forgets the copy on sign-out, and survives a broken one", async () => {
    const online = shell(false);
    rememberForOffline("profile", { a: 1 });
    rememberForOffline("profile", null);
    expect(online.store.has("profile")).toBe(false);

    const offline = shell(true);
    offline.store.set("cosmetics", "{not json");
    expect(await offlineCopy("cosmetics")).toBeNull();
  });
});
