import { resolveTribeNameData } from "../src/core/execution/utils/TribeNames";
import { GameMapType, PlayerType } from "../src/core/game/Game";
import { PseudoRandom } from "../src/core/PseudoRandom";
import { createRandomName } from "../src/core/Util";

describe("resolveTribeNameData", () => {
  test("returns default theme when called with no arguments", () => {
    const data = resolveTribeNameData();
    expect(data.prefixes.length).toBeGreaterThan(0);
    expect(data.suffixes.length).toBeGreaterThan(0);
    expect(data.customTribes).toBeUndefined();
    // Territorium's own French names: a realm, then what it belongs to.
    expect(data.prefixes).toContain("Royaume");
    expect(data.prefixes).toContain("Empire");
    expect(data.suffixes).toContain("du Loup");
    expect(data.suffixes).toContain("d'Or");
  });

  test("returns default theme when called with undefined", () => {
    const data = resolveTribeNameData(undefined);
    expect(data.prefixes.length).toBeGreaterThan(0);
    expect(data.suffixes.length).toBeGreaterThan(0);
  });

  test("returns default theme for a map with no theme or customTribes", () => {
    // Most maps in Maps.gen.ts have no theme/customTribes defined.
    const data = resolveTribeNameData(GameMapType.World);
    expect(data.prefixes.length).toBeGreaterThan(0);
    expect(data.suffixes.length).toBeGreaterThan(0);
    expect(data.customTribes).toBeUndefined();
  });

  test("returns data for every valid GameMapType without throwing", () => {
    for (const mapType of Object.values(GameMapType)) {
      const data = resolveTribeNameData(mapType);
      expect(data.prefixes.length).toBeGreaterThan(0);
      expect(data.suffixes.length).toBeGreaterThan(0);
    }
  });

  test("all default theme prefixes and suffixes are non-empty strings", () => {
    const data = resolveTribeNameData();
    for (const prefix of data.prefixes) {
      expect(prefix.length).toBeGreaterThan(0);
    }
    for (const suffix of data.suffixes) {
      expect(suffix.length).toBeGreaterThan(0);
    }
  });

  test("prefix + suffix combinations produce valid tribe names", () => {
    const data = resolveTribeNameData();
    const random = new PseudoRandom(42);
    for (let i = 0; i < 50; i++) {
      const prefixIndex = random.nextInt(0, data.prefixes.length);
      const suffixIndex = random.nextInt(0, data.suffixes.length);
      const name = `${data.prefixes[prefixIndex]} ${data.suffixes[suffixIndex]}`;
      expect(name.length).toBeGreaterThan(0);
      expect(name).toContain(" ");
    }
  });
});

describe("TribeNameData consistency", () => {
  test("default theme has no duplicate prefixes", () => {
    const data = resolveTribeNameData();
    const unique = new Set(data.prefixes);
    expect(unique.size).toBe(data.prefixes.length);
  });

  test("default theme has no duplicate suffixes", () => {
    const data = resolveTribeNameData();
    const unique = new Set(data.suffixes);
    expect(unique.size).toBe(data.suffixes.length);
  });
});

describe("tribeNameThemes.json", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const themes = require("../resources/tribeNameThemes.json");

  test("default theme exists", () => {
    expect(themes.default).toBeDefined();
    expect(themes.default.prefixes).toBeInstanceOf(Array);
    expect(themes.default.suffixes).toBeInstanceOf(Array);
  });

  test("all themes have non-empty prefixes and suffixes", () => {
    for (const [, theme] of Object.entries(themes)) {
      const t = theme as { prefixes: string[]; suffixes: string[] };
      expect(t.prefixes.length).toBeGreaterThan(0);
      expect(t.suffixes.length).toBeGreaterThan(0);
    }
  });

  test("all theme entries are non-empty strings", () => {
    for (const [, theme] of Object.entries(themes)) {
      const t = theme as { prefixes: string[]; suffixes: string[] };
      for (const prefix of t.prefixes) {
        expect(prefix.length).toBeGreaterThan(0);
      }
      for (const suffix of t.suffixes) {
        expect(suffix.length).toBeGreaterThan(0);
      }
    }
  });

  test("at least 3 themes are defined", () => {
    expect(Object.keys(themes).length).toBeGreaterThanOrEqual(3);
  });
});

describe("createRandomName (deterministic)", () => {
  test("returns null for non-human players", () => {
    expect(createRandomName("test", PlayerType.Bot)).toBeNull();
  });

  test("returns a deterministic name for human players", () => {
    const name1 = createRandomName("Alice", PlayerType.Human);
    const name2 = createRandomName("Alice", PlayerType.Human);
    expect(name1).toBe(name2);
    expect(name1).toBeTruthy();
    expect(name1).toContain("👤");
  });

  test("different names produce different random names (usually)", () => {
    const name1 = createRandomName("Alice", PlayerType.Human);
    const name2 = createRandomName("Bob", PlayerType.Human);
    // They could theoretically collide, but with thousands of combinations it's unlikely.
    // We just verify both are valid.
    expect(name1).toBeTruthy();
    expect(name2).toBeTruthy();
  });
});

describe("Territorium bot names", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const themes = require("../resources/tribeNameThemes.json") as Record<
    string,
    { prefixes: string[]; suffixes: string[] }
  >;

  test("read as a realm followed by its complement", () => {
    const data = resolveTribeNameData();
    expect(`${data.prefixes[1]} ${data.suffixes[4]}`).toBe("Royaume du Loup");
  });

  test("every complement starts with de/du/des/d' or is a call sign", () => {
    const callSigns = new Set(themes.vs.suffixes.filter((s) => !/ /.test(s)));
    for (const theme of Object.values(themes)) {
      for (const suffix of theme.suffixes) {
        if (callSigns.has(suffix)) continue;
        expect(suffix).toMatch(/^(de |du |des |d'|de l'|de la )/);
      }
    }
  });

  test("names stay short enough for the map and the leaderboard", () => {
    for (const theme of Object.values(themes)) {
      const longestHead = Math.max(...theme.prefixes.map((p) => p.length));
      const longestTail = Math.max(...theme.suffixes.map((s) => s.length));
      expect(longestHead + 1 + longestTail).toBeLessThanOrEqual(40);
    }
  });
});
