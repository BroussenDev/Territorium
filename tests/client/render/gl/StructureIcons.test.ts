/**
 * The city, the SAM launcher, the factory and the radar change look at each
 * level they are upgraded to (up to 5, 3 for the radar). On the map
 * (StructurePass picks the icon texture column) and in the HUD
 * (cityIconFor / samLauncherIconFor / factoryIconFor / radarIconFor pick the
 * image).
 */

import { describe, expect, it } from "vitest";
import {
  cityIconFor,
  factoryIconFor,
  radarIconFor,
  samLauncherIconFor,
} from "../../../../src/client/hud/HotbarIcons";
import { structureIconColumn } from "../../../../src/client/render/gl/passes/StructurePass";
import {
  UT_CITY,
  UT_FACTORY,
  UT_PORT,
  UT_RADAR,
  UT_SAM_LAUNCHER,
} from "../../../../src/client/render/types/UnitType";

const ATLAS_COLS = 7;

// Each structure's atlas column, the first texture column of its looks from
// level 2 on, which follow the atlas in this order, and its number of looks.
const LEVELED = [
  ["city", UT_CITY, 0, ATLAS_COLS, 5],
  ["SAM launcher", UT_SAM_LAUNCHER, 4, ATLAS_COLS + 4, 5],
  ["factory", UT_FACTORY, 2, ATLAS_COLS + 8, 5],
  ["radar", UT_RADAR, 6, ATLAS_COLS + 12, 3],
] as const;

describe("structureIconColumn", () => {
  it.each(LEVELED)(
    "gives a %s one look per level",
    (_, type, atlasCol, firstCol, levels) => {
      // Ghosts have level 0 and show the first look.
      expect(structureIconColumn(type, atlasCol, 0)).toBe(atlasCol);
      expect(structureIconColumn(type, atlasCol, 1)).toBe(atlasCol);
      for (let level = 2; level <= levels; level++) {
        expect(structureIconColumn(type, atlasCol, level)).toBe(
          firstCol + level - 2,
        );
      }
      // Past the last look (not reachable today), it stays on the last one.
      expect(structureIconColumn(type, atlasCol, levels + 1)).toBe(
        firstCol + levels - 2,
      );
    },
  );

  it("keeps other structures on their atlas column", () => {
    expect(structureIconColumn(UT_PORT, 1, 1)).toBe(1);
    expect(structureIconColumn(UT_PORT, 1, 5)).toBe(1);
  });
});

describe.each([
  ["cityIconFor", cityIconFor, "City", 5],
  ["samLauncherIconFor", samLauncherIconFor, "SamLauncher", 5],
  ["factoryIconFor", factoryIconFor, "Factory", 5],
  ["radarIconFor", radarIconFor, "Radar", 3],
] as const)("%s", (_, iconFor, name, levels) => {
  it("picks the image of the structure's level", () => {
    for (let level = 1; level <= levels; level++) {
      expect(iconFor(level)).toContain(`${name}Level${level}IconWhite.svg`);
    }
    expect(iconFor(0)).toContain(`${name}Level1IconWhite.svg`);
    expect(iconFor(levels + 1)).toContain(`${name}Level${levels}IconWhite.svg`);
  });
});
