import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { BOAT_SPRITES } from "../../src/client/render/BoatSprites";
import {
  ATLAS_COLS,
  BOAT_MODEL_COLS,
  DEFAULT_BOAT_COLS,
  UNIT_ORDER,
  WARSHIP_MODEL_FIRST_COL,
  WARSHIP_MODEL_LAST_COL,
} from "../../src/client/render/gl/passes/UnitAtlas";
import type { PlayerView } from "../../src/client/view";
import { catalogBoatModels } from "../../src/client/WebGLFrameBuilder";
import {
  type Cosmetics,
  CosmeticsSchema,
  TRANSPORT_MODELS,
  WARSHIP_MODELS,
} from "../../src/core/CosmeticSchemas";

const CELL = 13;

const base = { product: null, rarity: "rare", priceHard: 150 } as const;

function model(effectType: string, name: string, type: string) {
  return { ...base, name, effectType, attributes: { type } };
}

function catalog(): Cosmetics {
  return CosmeticsSchema.parse({
    patterns: {},
    flags: {},
    effects: {
      warshipModel: {
        galion: model("warshipModel", "galion", "galleon"),
        sous_marin: model("warshipModel", "sous_marin", "submarine"),
      },
      transportModel: {
        jonque: model("transportModel", "jonque", "junk"),
      },
    },
  });
}

function player(effects: Record<string, string>): PlayerView {
  return {
    cosmetics: {
      effects: Object.fromEntries(
        Object.entries(effects).map(([slot, name]) => [
          slot,
          { name, effectType: slot },
        ]),
      ),
    },
  } as unknown as PlayerView;
}

/** Gray value of every pixel of a straight-alpha RGBA PNG (8-bit, color type 6). */
function readGrayAtlas(path: string): {
  width: number;
  height: number;
  gray: (x: number, y: number) => number;
} {
  const png = readFileSync(path);
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  for (let i = 8; i < png.length; ) {
    const len = png.readUInt32BE(i);
    const type = png.toString("latin1", i + 4, i + 8);
    const data = png.subarray(i + 8, i + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([data[8], data[9]]).toEqual([8, 6]);
    }
    if (type === "IDAT") idat.push(data);
    i += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x;
      const a = x >= 4 ? pixels[at - 4] : 0;
      const b = y > 0 ? pixels[at - stride] : 0;
      const c = x >= 4 && y > 0 ? pixels[at - stride - 4] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      const predictor = [
        0,
        a,
        b,
        (a + b) >> 1,
        pa <= pb && pa <= pc ? a : pb <= pc ? b : c,
      ][filter];
      pixels[at] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return {
    width,
    height,
    gray: (x, y) => {
      const at = y * stride + x * 4;
      return pixels[at + 3] === 0 ? 0 : pixels[at];
    },
  };
}

const GRAY: Record<string, number> = {
  X: 70,
  ":": 70,
  "#": 180,
  o: 130,
  B: 100,
  ".": 0,
};

describe("boat models", () => {
  it("parses the catalog's boat models and drops one this client can't draw", () => {
    const c = catalog();
    expect(c.effects?.warshipModel?.galion?.attributes.type).toBe("galleon");
    expect(c.effects?.transportModel?.jonque?.attributes.type).toBe("junk");
    expect(c.effects?.warshipModel?.sous_marin).toBeUndefined();
  });

  it("resolves the warship and transport models a player has equipped", () => {
    const c = catalog();
    expect(catalogBoatModels(c, player({ warshipModel: "galion" }))).toEqual([
      "galleon",
    ]);
    expect(
      catalogBoatModels(
        c,
        player({ warshipModel: "galion", transportModel: "jonque" }),
      ),
    ).toEqual(["galleon", "junk"]);
    // Nothing equipped, an unknown name, or a name filed under the other
    // boat's slot: the default boats.
    expect(catalogBoatModels(c, player({}))).toEqual([]);
    expect(catalogBoatModels(c, player({ warshipModel: "nope" }))).toEqual([]);
    expect(catalogBoatModels(c, player({ warshipModel: "jonque" }))).toEqual(
      [],
    );
  });

  it("gives every boat its own atlas columns, warship models in one run", () => {
    const all = [
      DEFAULT_BOAT_COLS.warship,
      DEFAULT_BOAT_COLS.transport,
      ...Object.values(BOAT_MODEL_COLS),
    ].flatMap((c) => [c.straight, c.diagonal]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every((c) => c >= 0 && c < ATLAS_COLS)).toBe(true);

    for (const m of WARSHIP_MODELS) {
      const { straight, diagonal } = BOAT_MODEL_COLS[m];
      expect(straight).toBeGreaterThanOrEqual(WARSHIP_MODEL_FIRST_COL);
      expect(diagonal).toBeLessThanOrEqual(WARSHIP_MODEL_LAST_COL);
    }
    // The run holds warship models only: the warship color effect paints it.
    expect(WARSHIP_MODEL_LAST_COL - WARSHIP_MODEL_FIRST_COL + 1).toBe(
      WARSHIP_MODELS.length * 2,
    );
    for (const m of TRANSPORT_MODELS) {
      const { straight, diagonal } = BOAT_MODEL_COLS[m];
      for (const c of [straight, diagonal]) {
        expect(
          c >= WARSHIP_MODEL_FIRST_COL && c <= WARSHIP_MODEL_LAST_COL,
        ).toBe(false);
      }
    }
    // The train effect covers the three train columns, never a boat.
    const train = UNIT_ORDER.indexOf("TrainEngine");
    expect(all.some((c) => c >= train && c <= train + 2)).toBe(false);
  });

  it("draws every boat in the atlas exactly as BoatSprites describes it", () => {
    const atlas = readGrayAtlas("resources/atlases/unit-atlas.png");
    expect(atlas.width).toBe(ATLAS_COLS * CELL);
    expect(atlas.height).toBe(CELL);
    const cols = {
      warship: DEFAULT_BOAT_COLS.warship,
      transport: DEFAULT_BOAT_COLS.transport,
      ...BOAT_MODEL_COLS,
    };
    for (const [name, sprite] of Object.entries(BOAT_SPRITES)) {
      const at = cols[name as keyof typeof cols];
      for (const heading of ["straight", "diagonal"] as const) {
        const rows = sprite[heading];
        expect(rows).toHaveLength(CELL);
        const drawn = rows.map((row, y) =>
          [...row]
            .map((ch, x) =>
              atlas.gray(at[heading] * CELL + x, y) === GRAY[ch] ? ch : "?",
            )
            .join(""),
        );
        expect(drawn, `${name} ${heading}`).toEqual(rows);
      }
    }
  });

  it("keeps each model the size of a boat: no wider than the warship", () => {
    const width = (rows: readonly string[]) =>
      Math.max(...rows.map((r) => r.replace(/^\.+|\.+$/g, "").length));
    const warship = width(BOAT_SPRITES.warship.straight);
    for (const m of [...WARSHIP_MODELS, ...TRANSPORT_MODELS]) {
      expect(width(BOAT_SPRITES[m].straight)).toBeLessThanOrEqual(warship + 2);
    }
  });
});
