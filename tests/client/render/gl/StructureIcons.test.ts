/**
 * The SAM launcher changes look at each level it is upgraded to, up to 5.
 * On the map (StructurePass picks the icon texture column) and in the
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
  it("gives a SAM launcher one look per level, up to the fifth", () => {
    // Ghosts have level 0 and show the first look.
    expect(structureIconColumn(UT_SAM_LAUNCHER, SAM_COL, 0)).toBe(SAM_COL);
    expect(structureIconColumn(UT_SAM_LAUNCHER, SAM_COL, 1)).toBe(SAM_COL);
    for (const level of [2, 3, 4, 5]) {
      expect(structureIconColumn(UT_SAM_LAUNCHER, SAM_COL, level)).toBe(
        ATLAS_COLS + level - 2,
      );
    }
    // Past the last look (not reachable today), it stays on the last one.
    expect(structureIconColumn(UT_SAM_LAUNCHER, SAM_COL, 6)).toBe(
      ATLAS_COLS + 3,
    );
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
    expect(samLauncherIconFor(4)).toContain("SamLauncherLevel4IconWhite.svg");
    expect(samLauncherIconFor(5)).toContain("SamLauncherLevel5IconWhite.svg");
    expect(samLauncherIconFor(6)).toContain("SamLauncherLevel5IconWhite.svg");
    expect(samLauncherIconFor(0)).toContain("SamLauncherLevel1IconWhite.svg");
  });
});
