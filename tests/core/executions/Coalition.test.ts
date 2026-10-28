import { describe, expect, test } from "vitest";
import {
  findCoalitionTarget,
  findRunawayLeader,
} from "../../../src/core/execution/nation/NationUtils";
import { PlayerExecution } from "../../../src/core/execution/PlayerExecution";
import { GameMode, PlayerInfo, PlayerType } from "../../../src/core/game/Game";
import { COALITION_PERCENT_TILES } from "../../../src/core/game/NationsMode";
import { setup } from "../../util/Setup";

async function landGame(variant?: "nations") {
  const game = await setup("big_plains", {
    gameMode: GameMode.FFA,
    ...(variant ? { gameVariant: variant } : {}),
  });
  const add = (id: string, type: PlayerType) => {
    game.addPlayer(new PlayerInfo(id, type, null, id));
    return game.player(id);
  };
  const giveShare = (p: ReturnType<typeof add>, percent: number) => {
    const target = Math.ceil((game.numLandTiles() * percent) / 100);
    let n = 0;
    game.map().forEachTile((tile) => {
      if (n >= target || !game.map().isLand(tile) || game.hasOwner(tile)) {
        return;
      }
      p.conquer(tile);
      n++;
    });
  };
  return { game, add, giveShare };
}

describe("Nations mode coalition", () => {
  test("forms against the side holding the coalition share, nations mode only", async () => {
    const { game, add, giveShare } = await landGame("nations");
    const leader = add("leader", PlayerType.Human);
    const nation = add("nation", PlayerType.Nation);
    giveShare(nation, 5);
    giveShare(leader, COALITION_PERCENT_TILES - 2);
    expect(findCoalitionTarget(game)).toBeNull();
    giveShare(leader, 3);
    expect(findCoalitionTarget(game)).toBe(leader);
    // The nations' attacks and nukes go for it, as for a runaway leader.
    expect(findRunawayLeader(game)).toBe(leader);
  });

  test("never forms outside nations mode", async () => {
    const { game, add, giveShare } = await landGame();
    const leader = add("leader", PlayerType.Human);
    giveShare(leader, 60);
    expect(findCoalitionTarget(game)).toBeNull();
  });

  test("ignores bots, which are no side", async () => {
    const { game, add, giveShare } = await landGame("nations");
    const bot = add("bot", PlayerType.Bot);
    giveShare(bot, 60);
    expect(findCoalitionTarget(game)).toBeNull();
  });
});

describe("Final phase growth", () => {
  test("the same faster troop and gold growth for every side", async () => {
    const grow = async (finalPhase: boolean) => {
      const game = await setup("big_plains", {
        gameMode: GameMode.FFA,
        overtime: { enabled: true },
        infiniteTroops: false,
      });
      game.addPlayer(new PlayerInfo("p", PlayerType.Human, null, "p"));
      const p = game.player("p");
      let n = 0;
      game.map().forEachTile((tile) => {
        if (n >= 200 || !game.map().isLand(tile)) return;
        p.conquer(tile);
        n++;
      });
      const exec = new PlayerExecution(p);
      exec.init(game, 0);
      game.elapsedGameSeconds = () => (finalPhase ? 95 * 60 : 60 * 60);
      const troops = p.troops();
      const gold = p.gold();
      exec.tick(1);
      return { troops: p.troops() - troops, gold: p.gold() - gold };
    };
    const normal = await grow(false);
    const final = await grow(true);
    // Troops are whole numbers: within one of half again.
    expect(
      Math.abs(final.troops - (normal.troops * 150) / 100),
    ).toBeLessThanOrEqual(1);
    expect(final.troops).toBeGreaterThan(normal.troops);
    expect(final.gold).toBe((normal.gold * 150n) / 100n);
  });
});
