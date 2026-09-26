import { describe, expect, it } from "vitest";
import en from "../../resources/lang/en.json";
import fr from "../../resources/lang/fr.json";
import { LOADING_TIPS } from "../../src/client/GameStartingModal";

describe("GameStartingModal tips", () => {
  it("has English and French text for every tip", () => {
    for (const tip of LOADING_TIPS) {
      expect(en.game_starting_modal.tips[tip], tip).toBeTruthy();
      expect(fr.game_starting_modal.tips[tip], tip).toBeTruthy();
    }
  });

  it("has no text left over for a tip that is not shown", () => {
    expect(Object.keys(en.game_starting_modal.tips).sort()).toEqual(
      [...LOADING_TIPS].sort(),
    );
  });
});
