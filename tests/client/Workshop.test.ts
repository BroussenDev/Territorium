import { afterEach, describe, expect, it, vi } from "vitest";
import zlib from "zlib";
import {
  fromBase64,
  readWorkshopMap,
  toBase64,
  workshop,
} from "../../src/client/Workshop";
import { packUpload, SOURCE_WATER } from "../../src/core/game/CommunityMaps";

function upload(width = 200, height = 200) {
  const tiles = new Uint8Array(width * height).fill(SOURCE_WATER);
  for (let i = 0; i < 1000; i++) tiles[20_000 + i] = 3;
  return packUpload(
    { name: "Isle", width, height, nations: [{ name: "A", x: 10, y: 100 }] },
    new Uint8Array(zlib.gzipSync(tiles)),
  );
}

afterEach(() => {
  delete (window as { openfrontDesktop?: unknown }).openfrontDesktop;
});

describe("Steam Workshop maps", () => {
  it("reads back the upload a Workshop item carries", async () => {
    const source = await readWorkshopMap(fromBase64(toBase64(upload())));
    expect(source?.name).toBe("Isle");
    expect(source?.width).toBe(200);
    expect(source?.tiles[20_000]).toBe(3);
    expect(source?.nations).toEqual([{ name: "A", x: 10, y: 100 }]);
  });

  it("refuses files that are not a valid map", async () => {
    expect(await readWorkshopMap(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(await readWorkshopMap(upload(202, 200))).toBeNull();
  });

  it("round-trips large files through base64", () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 7) % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it("is only there in a Steam app that has it", () => {
    expect(workshop()).toBeNull();
    (window as { openfrontDesktop?: unknown }).openfrontDesktop = {
      workshop: { publish: vi.fn(), items: vi.fn() },
    };
    expect(workshop()).toBeNull();
    (window as { openfrontDesktop?: unknown }).openfrontDesktop = {
      workshop: { publish: vi.fn(), items: vi.fn(), remove: vi.fn() },
    };
    expect(workshop()).not.toBeNull();
  });
});
