import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LibraryMap } from "../../src/client/editor/EditorLibrary";
import { EditorMap, Terrain } from "../../src/client/editor/EditorMap";
import { packSource, unpackSource } from "../../src/client/editor/MapPack";

// One device's library, in memory (the real one is IndexedDB).
const device = vi.hoisted(() => ({
  maps: new Map<string, LibraryMap>(),
  next: 0,
}));

vi.mock("../../src/client/editor/EditorLibrary", () => ({
  isDirty: (m: LibraryMap) => m.syncedAt === null || m.updatedAt !== m.syncedAt,
  newMapId: () => `copy-${String(++device.next).padStart(4, "0")}`,
  allRecords: async () => [...device.maps.values()].map((m) => ({ ...m })),
  putMap: async (m: LibraryMap) => void device.maps.set(m.id, { ...m }),
  forgetMap: async (id: string) => void device.maps.delete(id),
}));
const auth = vi.hoisted(() => ({ header: "Bearer t" }));
vi.mock("../../src/client/Auth", () => ({
  getAuthHeader: async () => auth.header,
}));
vi.mock("../../src/client/ApiBase", () => ({
  getApiBase: () => "https://api.test",
}));
vi.mock("../../src/client/editor/MapPack", async (orig) => ({
  ...(await orig<typeof import("../../src/client/editor/MapPack")>()),
  previewOf: () => "preview",
}));

const { syncLibrary } = await import("../../src/client/editor/EditorSync");

// The account's maps on the API.
let server: Map<
  string,
  { data: Uint8Array; updatedAt: number; workshopId?: string | null }
>;
let tooLarge: Set<string>;

function fakeFetch(url: string, init: RequestInit = {}) {
  const path = url.replace("https://api.test/editor-maps", "");
  const id = decodeURIComponent(path.slice(1).split("?")[0]);
  const method = init.method ?? "GET";
  if (path === "" && method === "GET") {
    return new Response(
      JSON.stringify(
        [...server].map(([id, m]) => ({
          id,
          name: "n",
          width: 1,
          height: 1,
          updatedAt: m.updatedAt,
          workshopId: m.workshopId ?? null,
        })),
      ),
    );
  }
  if (method === "GET") {
    const m = server.get(id)!;
    return new Response(m.data.slice(), {
      headers: { "X-Updated-At": String(m.updatedAt) },
    });
  }
  if (method === "DELETE") {
    server.delete(id);
    return new Response("{}");
  }
  if (tooLarge.has(id)) return new Response("{}", { status: 413 });
  const params = new URL(url).searchParams;
  const at = Number(params.get("updatedAt"));
  return (init.body as Blob).arrayBuffer().then((b) => {
    server.set(id, {
      data: new Uint8Array(b),
      updatedAt: at,
      workshopId: params.get("workshopId"),
    });
    return new Response(JSON.stringify({ id, updatedAt: at }));
  });
}

function record(
  id: string,
  name: string,
  updatedAt: number,
  syncedAt: number | null,
): LibraryMap {
  const map = new EditorMap(8, 4);
  map.terrain[0] = Terrain.Land;
  map.relief[0] = 12;
  return {
    id,
    name,
    width: 8,
    height: 4,
    terrain: map.terrain,
    relief: map.relief,
    nations: [{ name: "N", x: 0, y: 0 }],
    updatedAt,
    syncedAt,
    deleted: false,
    thumbnail: "",
  };
}

async function onServer(name: string, updatedAt: number) {
  const r = record("x", name, 0, null);
  return {
    data: await packSource(EditorMap.fromData(r).toSource(name)),
    updatedAt,
  };
}

beforeEach(() => {
  device.maps.clear();
  device.next = 0;
  server = new Map();
  tooLarge = new Set();
  auth.header = "Bearer t";
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

describe("map editor sync", () => {
  it("does nothing signed out", async () => {
    auth.header = "";
    device.maps.set("map-0001", record("map-0001", "A", 10, null));
    expect((await syncLibrary()).state).toBe("signed-out");
    expect(server.size).toBe(0);
  });

  it("sends new maps and fetches the account's", async () => {
    device.maps.set("map-0001", record("map-0001", "Here", 10, null));
    server.set("map-0002", await onServer("There", 20));
    const report = await syncLibrary();
    expect(report.state).toBe("synced");
    expect(report.changed).toEqual(["map-0002"]);
    expect(server.get("map-0001")?.updatedAt).toBe(10);
    expect(device.maps.get("map-0001")?.syncedAt).toBe(10);
    const there = device.maps.get("map-0002")!;
    expect(there.name).toBe("There");
    expect(there.syncedAt).toBe(20);
    expect(there.relief[0]).toBe(12);
    expect(there.nations).toEqual([{ name: "N", x: 0, y: 0 }]);
    // Nothing more to do the next time.
    const again = await syncLibrary();
    expect(again.changed).toEqual([]);
  });

  it("carries the Workshop item a map was published as", async () => {
    device.maps.set("map-0001", {
      ...record("map-0001", "Mine", 10, null),
      workshopId: "3816860584",
    });
    await syncLibrary();
    expect(server.get("map-0001")?.workshopId).toBe("3816860584");
    // Another device gets it with the map.
    device.maps.clear();
    await syncLibrary();
    expect(device.maps.get("map-0001")?.workshopId).toBe("3816860584");
  });

  it("follows changes and deletions made elsewhere", async () => {
    device.maps.set("map-0001", record("map-0001", "Old", 10, 10));
    device.maps.set("map-0002", record("map-0002", "Gone", 10, 10));
    server.set("map-0001", await onServer("New", 30));
    const report = await syncLibrary();
    expect(report.changed).toEqual(["map-0001"]);
    expect(device.maps.get("map-0001")?.name).toBe("New");
    expect(report.deleted).toEqual(["map-0002"]);
    expect(device.maps.has("map-0002")).toBe(false);
  });

  it("deletes from the account what was deleted here", async () => {
    server.set("map-0001", await onServer("A", 10));
    device.maps.set("map-0001", {
      ...record("map-0001", "A", 10, 10),
      deleted: true,
    });
    await syncLibrary();
    expect(server.has("map-0001")).toBe(false);
    expect(device.maps.has("map-0001")).toBe(false);
  });

  it("keeps both versions of a map changed on two devices", async () => {
    device.maps.set("map-0001", record("map-0001", "Mine", 40, 10));
    server.set("map-0001", await onServer("Theirs", 30));
    const report = await syncLibrary();
    expect(report.conflicts).toEqual(["Mine"]);
    expect(device.maps.get("map-0001")?.name).toBe("Theirs");
    const copy = device.maps.get("copy-0001")!;
    expect(copy.name).toBe("Mine");
    expect(server.has("copy-0001")).toBe(true);
  });

  it("keeps a map too large to sync on this device", async () => {
    device.maps.set("map-0001", record("map-0001", "Huge", 10, null));
    tooLarge.add("map-0001");
    const report = await syncLibrary();
    expect(report.tooLarge).toEqual(["Huge"]);
    expect(device.maps.get("map-0001")?.syncedAt).toBeNull();
  });
});

describe("map packing", () => {
  it("brings back what was drawn", async () => {
    const map = new EditorMap(6, 3);
    map.terrain[1] = Terrain.Land;
    map.relief[1] = 25;
    map.terrain[2] = Terrain.Void;
    map.nations = [{ name: "Here", x: 1, y: 0 }];
    const source = await unpackSource(await packSource(map.toSource("Mine")));
    const back = EditorMap.fromSource(source!);
    expect(source!.name).toBe("Mine");
    expect([...back.terrain]).toEqual([...map.terrain]);
    expect(back.relief[1]).toBe(25);
    expect(back.nations).toEqual(map.nations);
  });

  it("refuses bytes that are not a map", async () => {
    expect(await unpackSource(new Uint8Array([1, 2, 3, 4, 5]))).toBeNull();
  });
});
