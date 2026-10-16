import { NationExecution } from "../src/core/execution/NationExecution";
import {
  Difficulty,
  Nation,
  PlayerInfo,
  PlayerType,
} from "../src/core/game/Game";
import { setup } from "./util/Setup";

async function attackRates(difficulty: Difficulty): Promise<number[]> {
  const game = await setup("plains", { difficulty });
  return Array.from({ length: 30 }, (_, i) => {
    const exec = new NationExecution(
      `game${i}`,
      new Nation(
        undefined,
        new PlayerInfo(`n${i}`, PlayerType.Nation, null, `n${i}`),
      ),
    );
    exec.init(game);
    return (exec as unknown as { attackRate: number }).attackRate;
  });
}

describe("Nation reaction speed", () => {
  it("acts more often the higher the difficulty, Impossible every ~2 seconds", async () => {
    const hard = await attackRates(Difficulty.Hard);
    const impossible = await attackRates(Difficulty.Impossible);
    expect(Math.max(...impossible)).toBeLessThan(Math.min(...hard));
    for (const rate of impossible) {
      expect(rate).toBeGreaterThanOrEqual(18);
      expect(rate).toBeLessThan(24);
    }
  });
});
