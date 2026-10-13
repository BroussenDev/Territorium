import { AttackExecution } from "../src/core/execution/AttackExecution";
import { Game, Player, PlayerInfo, PlayerType } from "../src/core/game/Game";
import { NEIGHBOR_SAMPLE_TICKS } from "../src/core/game/GameImpl";
import { setup } from "./util/Setup";

// TGS-103 (server/Tgs.ts) reads, from the end-of-game stats, how long each
// pair of human players shared a border and whether they ever attacked each
// other. The simulation keeps those numbers.

let game: Game;
let alice: Player;
let bob: Player;

function human(name: string, clientID: string): PlayerInfo {
  return new PlayerInfo(name, PlayerType.Human, clientID, name);
}

function neighbor(of: Player, other: Player) {
  return game
    .stats()
    .getPlayerStats(of)
    ?.neighbors?.find((n) => n.client === other.clientID());
}

function run(ticks: number) {
  for (let i = 0; i < ticks; i++) game.executeNextTick();
}

describe("human neighbours for TGS-103", () => {
  beforeEach(async () => {
    game = await setup("plains", { infiniteTroops: true }, [
      human("alice", "AAAAAAAA"),
      human("bob", "BBBBBBBB"),
    ]);
    alice = game.player("alice");
    bob = game.player("bob");
    // Side by side: a shared border.
    for (let x = 0; x < 5; x++) {
      alice.conquer(game.ref(x, 0));
      bob.conquer(game.ref(x, 1));
    }
  });

  it("counts the time two humans share a border, on both of them", () => {
    run(NEIGHBOR_SAMPLE_TICKS * 4);

    const fromAlice = neighbor(alice, bob);
    const fromBob = neighbor(bob, alice);
    expect(fromAlice?.ticks).toBeGreaterThanOrEqual(NEIGHBOR_SAMPLE_TICKS * 3);
    expect(fromAlice?.attacks).toBe(0);
    expect(fromAlice?.allied).toBe(0);
    expect(fromBob).toEqual(fromAlice && { ...fromAlice, client: "AAAAAAAA" });
  });

  it("counts an attack between them, whoever started it", () => {
    run(NEIGHBOR_SAMPLE_TICKS);
    game.addExecution(new AttackExecution(50, bob, alice.id()));
    run(2);

    expect(neighbor(alice, bob)?.attacks).toBe(1);
    expect(neighbor(bob, alice)?.attacks).toBe(1);
  });

  it("does not count players far apart", async () => {
    game = await setup("plains", { infiniteTroops: true }, [
      human("alice", "AAAAAAAA"),
      human("bob", "BBBBBBBB"),
    ]);
    alice = game.player("alice");
    bob = game.player("bob");
    alice.conquer(game.ref(0, 0));
    bob.conquer(game.ref(40, 40));
    run(NEIGHBOR_SAMPLE_TICKS * 3);

    expect(neighbor(alice, bob)).toBeUndefined();
  });
});
