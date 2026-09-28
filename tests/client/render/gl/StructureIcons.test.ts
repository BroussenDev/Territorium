/**
 * The city, the SAM launcher and the factory change look at each level they
 * are upgraded to, up to 5. On the map (StructurePass picks the icon texture
 * column) and in the HUD (cityIconFor / samLauncherIconFor / factoryIconFor
 * pick the image).
 */

import { describe, expect, it } from "vitest";
import {
  cityIconFor,
  factoryIconFor,
  samLauncherIconFor,
} from "../../../../src/client/hud/HotbarIcons";
import { structureIconColumn } from "../../../../src/client/render/gl/passes/StructurePass";
import {
  UT_CITY,
  UT_FACTORY,
  UT_PORT,
  UT_SAM_LAUNCHER,
} from "../../../../src/client/render/types/UnitType";

const ATLAS_COLS = 7;

// Each structure's atlas column, and the first texture column of its level 2
// to 5 looks, which follow the atlas in this order.
const LEVELED = [
  ["city", UT_CITY, 0, ATLAS_COLS],
  ["SAM launcher", UT_SAM_LAUNCHER, 4, ATLAS_COLS + 4],
  ["factory", UT_FACTORY, 2, ATLAS_COLS + 8],
] as const;

describe("structureIconColumn", () => {
  it.each(LEVELED)(
    "gives a %s one look per level, up to the fifth",
    (_, type, atlasCol, firstCol) => {
      // Ghosts have level 0 and show the first look.
      expect(structureIconColumn(type, atlasCol, 0)).toBe(atlasCol);
      expect(structureIconColumn(type, atlasCol, 1)).toBe(atlasCol);
      for (const level of [2, 3, 4, 5]) {
        expect(structureIconColumn(type, atlasCol, level)).toBe(
          firstCol + level - 2,
        );
      }
      // Past the last look (not reachable today), it stays on the last one.
      expect(structureIconColumn(type, atlasCol, 6)).toBe(firstCol + 3);
    },
  );

  it("keeps other structures on their atlas column", () => {
    expect(structureIconColumn(UT_PORT, 1, 1)).toBe(1);
    expect(structureIconColumn(UT_PORT, 1, 5)).toBe(1);
  });
});

describe.each([
  ["cityIconFor", cityIconFor, "City"],
  ["samLauncherIconFor", samLauncherIconFor, "SamLauncher"],
  ["factoryIconFor", factoryIconFor, "Factory"],
] as const)("%s", (_, iconFor, name) => {
  it("picks the image of the structure's level", () => {
    for (const level of [1, 2, 3, 4, 5]) {
      expect(iconFor(level)).toContain(`${name}Level${level}IconWhite.svg`);
    }
    expect(iconFor(0)).toContain(`${name}Level1IconWhite.svg`);
    expect(iconFor(6)).toContain(`${name}Level5IconWhite.svg`);
  });
});
