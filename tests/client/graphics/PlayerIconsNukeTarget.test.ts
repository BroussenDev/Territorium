import { describe, expect, it } from "vitest";
import { getPlayerIcons } from "../../../src/client/hud/PlayerIcons";
import type { GameView, PlayerView } from "../../../src/client/view";

// Replays hand back an unowned tile's owner as a stand-in that answers
// isPlayer() but has no id(). A nuke aimed at such a tile must not be
// treated as aimed at the local player.
describe("getPlayerIcons nuke target on unowned tiles", () => {
  function makeGame(owner: unknown, nukeTarget: number) {
    const myPlayer = {
      id: () => "me",
      isRequestingAllianceWith: () => false,
      transitiveTargets: () => [],
      hasEmbargo: () => false,
      smallID: () => 1,
    };
    const nuke = {
      isActive: () => true,
      targetTile: () => nukeTarget,
    };
    const enemy = {
      id: () => "enemy",
      cosmetics: {},
      inDoomsdayClock: () => false,
      isDisconnected: () => false,
      isRequestingAllianceWith: () => false,
      outgoingEmojis: () => [],
      hasEmbargoAgainst: () => false,
      units: () => [nuke],
    };
    const game = {
      myPlayer: () => myPlayer,
      owner: () => owner,
      ticks: () => 0,
    } as unknown as GameView;
    return { game, enemy: enemy as unknown as PlayerView };
  }

  it("does not read an id from an unowned stand-in", () => {
    const stand = { isPlayer: () => false };
    const { game, enemy } = makeGame(stand, 42);
    const icons = getPlayerIcons({
      game,
      player: enemy,
      firstPlace: null,
    });
    const nuke = icons.find((i) => i.id === "nuke");
    expect(nuke).toBeDefined();
    expect(nuke?.src).toContain("NukeIconWhite");
  });

  it("flags a nuke aimed at the local player's own tile", () => {
    const me = { isPlayer: () => true, id: () => "me" };
    const { game, enemy } = makeGame(me, 42);
    const icons = getPlayerIcons({ game, player: enemy, firstPlace: null });
    const nuke = icons.find((i) => i.id === "nuke");
    expect(nuke?.src).toContain("NukeIconRed");
  });
});
