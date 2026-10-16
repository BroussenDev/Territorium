import { describe, expect, it } from "vitest";
import {
  commitGold,
  uncommittedGold,
} from "../src/core/execution/nation/NationUtils";
import { Game, Player } from "../src/core/game/Game";

// A nation's orders of one tick are paid on the next, so each decision of the
// tick must see the gold the earlier ones took.
function fakes(gold: bigint) {
  let tick = 100;
  const game = { ticks: () => tick } as unknown as Game;
  const player = { gold: () => gold } as unknown as Player;
  return { game, player, nextTick: () => tick++ };
}

describe("committed gold", () => {
  it("takes this tick's orders off the spendable gold", () => {
    const { game, player } = fakes(1_000n);
    expect(uncommittedGold(game, player)).toBe(1_000n);
    commitGold(game, player, 300n);
    commitGold(game, player, 200n);
    expect(uncommittedGold(game, player)).toBe(500n);
  });

  it("forgets them on the next tick, once they are paid", () => {
    const { game, player, nextTick } = fakes(1_000n);
    commitGold(game, player, 800n);
    nextTick();
    expect(uncommittedGold(game, player)).toBe(1_000n);
  });

  it("keeps each nation's orders apart", () => {
    const { game, player } = fakes(1_000n);
    const other = { gold: () => 1_000n } as unknown as Player;
    commitGold(game, player, 900n);
    expect(uncommittedGold(game, other)).toBe(1_000n);
  });
});
