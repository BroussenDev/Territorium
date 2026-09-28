/**
 * The SAM launcher changes look as it is upgraded: level 1, 2, then 3 and
 * up. On the map (StructurePass picks the icon texture column) and in the
 * HUD (samLauncherIconFor picks the image).
 */

import { describe, expect, it } from "vitest";
import { samLauncherIconFor } from "../../../../src/client/hud/HotbarIcons";
import { structureIconColumn } from "../../../../src/client/render/gl/passes/StructurePass";
import {
  UT_CITY,
  UT_SAM_LAUNCHER,
} from "../../../../src/client/render/types/UnitType";

const SAM_COL = 4;
const ATLAS_COLS = 7;

describe("structureIconColumn", () => {
  it("gives a SAM launcher one look per level, up to the third", () => {
    // Ghosts have level 0 and show the first look.
    expect(structureIconColumn(UT_SAM_LAUNCHER, SAM_COL, 0)).toBe(SAM_COL);
    expect(structureIconColumn(UT_SAM_LAUNCHER, SAM_COL, 1)).toBe(SAM_COL);
    expect(structureIconColumn(UT_SAM_LAUNCHER, SAM_COL, 2)).toBe(ATLAS_COLS);
    for (const level of [3, 4, 5]) {
      expect(structureIconColumn(UT_SAM_LAUNCHER, SAM_COL, level)).toBe(
        ATLAS_COLS + 1,
      );
    }
  });

  it("keeps other structures on their atlas column", () => {
    expect(structureIconColumn(UT_CITY, 0, 1)).toBe(0);
    expect(structureIconColumn(UT_CITY, 0, 5)).toBe(0);
  });
});

describe("samLauncherIconFor", () => {
  it("picks the image of the SAM launcher's level", () => {
    expect(samLauncherIconFor(1)).toContain("SamLauncherLevel1IconWhite.svg");
    expect(samLauncherIconFor(2)).toContain("SamLauncherLevel2IconWhite.svg");
    expect(samLauncherIconFor(3)).toContain("SamLauncherLevel3IconWhite.svg");
    expect(samLauncherIconFor(5)).toContain("SamLauncherLevel3IconWhite.svg");
    expect(samLauncherIconFor(0)).toContain("SamLauncherLevel1IconWhite.svg");
  });
});
