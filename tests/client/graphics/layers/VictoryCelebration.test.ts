import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../../src/client/hud/layers/VictoryCelebration";
import {
  celebratedPlayer,
  type VictoryCelebration,
} from "../../../../src/client/hud/layers/VictoryCelebration";
import { PlayerType } from "../../../../src/core/game/Game";
import { GameUpdateType } from "../../../../src/core/game/GameUpdates";

const CATALOG = {
  effects: {
    victory: {
      joy: {
        name: "joy",
        effectType: "victory",
        attributes: { type: "fireworks", colors: ["#facc15"], density: 2 },
        product: null,
        rarity: "epic",
      },
    },
  },
};

vi.mock("../../../../src/client/Cosmetics", () => ({
  fetchCosmetics: vi.fn(async () => CATALOG),
}));

function player(
  clientID: string,
  opts: { team?: string; tiles?: number; victory?: string; bot?: boolean },
) {
  return {
    clientID: () => clientID,
    team: () => opts.team ?? null,
    numTilesOwned: () => opts.tiles ?? 0,
    type: () => (opts.bot ? PlayerType.Bot : PlayerType.Human),
    cosmetics: opts.victory
      ? { effects: { victory: { name: opts.victory, effectType: "victory" } } }
      : {},
  };
}

function gameWith(
  players: ReturnType<typeof player>[],
  me: string | null = null,
) {
  let updates: Record<number, unknown[]> = {};
  const byId = new Map(players.map((p) => [p.clientID(), p]));
  return {
    game: {
      players: () => players,
      playerByClientID: (id: string) => byId.get(id) ?? null,
      myPlayer: () => (me ? (byId.get(me) ?? null) : null),
      updatesSinceLastTick: () => updates,
    } as any,
    win(winner: unknown) {
      updates = {
        [GameUpdateType.Win]: [{ type: GameUpdateType.Win, winner }],
      };
    },
  };
}

describe("celebratedPlayer", () => {
  it("picks the winning player only when they own a victory effect", () => {
    const { game } = gameWith([
      player("alice", { victory: "joy" }),
      player("bob", {}),
    ]);
    expect(celebratedPlayer(game, ["player", "alice"])?.clientID()).toBe(
      "alice",
    );
    expect(celebratedPlayer(game, ["player", "bob"])).toBeNull();
    expect(celebratedPlayer(game, ["nation", "France"])).toBeNull();
    expect(celebratedPlayer(game, undefined)).toBeNull();
  });

  it("prefers your own effect in a team win, else the biggest teammate's", () => {
    const players = [
      player("me", { team: "Red", tiles: 10, victory: "joy" }),
      player("big", { team: "Red", tiles: 90, victory: "joy" }),
      player("mid", { team: "Red", tiles: 50, victory: "joy" }),
      player("huge", { team: "Red", tiles: 500 }),
      player("foe", { team: "Blue", tiles: 999, victory: "joy" }),
    ];
    const mine = gameWith(players, "me").game;
    expect(celebratedPlayer(mine, ["team", "Red"])?.clientID()).toBe("me");

    const watching = gameWith(players, "foe").game;
    expect(celebratedPlayer(watching, ["team", "Red"])?.clientID()).toBe("big");
  });
});

describe("VictoryCelebration", () => {
  let layer: VictoryCelebration;
  let getContext: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    const ctx = new Proxy(
      {},
      {
        get: (_, key) =>
          key === "createLinearGradient"
            ? () => ({ addColorStop: () => {} })
            : () => {},
        set: () => true,
      },
    );
    getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockReturnValue(ctx as any);
    layer = document.createElement("victory-celebration") as VictoryCelebration;
    document.body.appendChild(layer);
  });

  afterEach(() => {
    layer.remove();
    getContext.mockRestore();
  });

  const settle = async () => {
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    await layer.updateComplete;
  };

  it("plays the winner's celebration over the screen once the game ends", async () => {
    const { game, win } = gameWith([player("alice", { victory: "joy" })]);
    layer.game = game;
    layer.tick();
    await settle();
    expect(layer.querySelector("[data-victory-celebration]")).toBeNull();

    win(["player", "alice"]);
    layer.tick();
    await settle();
    const canvas = layer.querySelector("[data-victory-celebration]");
    expect(canvas).not.toBeNull();
    expect(canvas?.classList.contains("pointer-events-none")).toBe(true);
  });

  it("stays dark when the winner has no victory effect", async () => {
    const { game, win } = gameWith([player("bob", {})]);
    layer.game = game;
    win(["player", "bob"]);
    layer.tick();
    await settle();
    expect(layer.querySelector("[data-victory-celebration]")).toBeNull();
  });
});
