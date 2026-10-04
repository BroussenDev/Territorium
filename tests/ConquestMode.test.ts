import { ObjectiveExecution } from "../src/core/execution/ObjectiveExecution";
import { WinCheckExecution } from "../src/core/execution/WinCheckExecution";
import { Game, Player, PlayerType } from "../src/core/game/Game";
import { GameUpdateType } from "../src/core/game/GameUpdates";
import {
  CONQUEST_HOLD_SECONDS,
  CONQUEST_OBJECTIVES,
  conquestMajority,
  conquestSecondsLeft,
  forEachTileInZone,
  OBJECTIVE_CAPTURE_SECONDS,
  ObjectiveState,
} from "../src/core/game/Objectives";
import { playerInfo, setup } from "./util/Setup";

const SEED = 4242;

function takeZone(game: Game, player: Player, objective: ObjectiveState) {
  forEachTileInZone(game.map(), objective.tile, objective.radius, (tile) => {
    if (game.isLand(tile)) player.conquer(tile);
  });
}

function runSeconds(game: Game, seconds: number) {
  for (let i = 0; i < seconds * 10; i++) game.executeNextTick();
}

/** Takes `count` zones for `player` and waits until they are captured. */
function capture(game: Game, player: Player, zones: ObjectiveState[]) {
  zones.forEach((zone) => takeZone(game, player, zone));
  runSeconds(game, OBJECTIVE_CAPTURE_SECONDS + 1);
}

async function build() {
  const names = ["a", "b"];
  const game = await setup(
    "big_plains",
    { gameVariant: "conquest" },
    names.map((n) => playerInfo(n, PlayerType.Human)),
  );
  game.addExecution(new ObjectiveExecution(SEED));
  game.addExecution(new WinCheckExecution());
  game.executeNextTick();
  runSeconds(game, game.config().objectiveRevealDelay() / 10);
  const [a, b] = names.map((n) => game.player(n));
  // A home tile in a corner keeps each player alive.
  a.conquer(game.ref(0, 0));
  b.conquer(game.ref(1, 0));
  return { game, a, b, zones: game.objectives() };
}

describe("conquest rules", () => {
  it("needs a strict majority of the objectives", () => {
    expect(conquestMajority(5)).toBe(3);
    expect(conquestMajority(4)).toBe(3);
  });

  it("counts down from three minutes once the majority is taken", () => {
    const state = { holder: 1, team: null, since: 100 };
    expect(conquestSecondsLeft(state, 100)).toBe(CONQUEST_HOLD_SECONDS);
    expect(conquestSecondsLeft(state, 160)).toBe(CONQUEST_HOLD_SECONDS - 60);
    expect(conquestSecondsLeft(state, 10_000)).toBe(0);
    expect(conquestSecondsLeft(null, 100)).toBeNull();
  });
});

describe("conquest mode", () => {
  it("turns the objectives on, with five of them, after 30 seconds", async () => {
    const { game, zones } = await build();
    expect(game.config().isConquestMode()).toBe(true);
    expect(game.config().objectives()).toBe(true);
    expect(game.config().objectiveRevealDelay()).toBe(30 * 10);
    expect(zones).toHaveLength(CONQUEST_OBJECTIVES);
  });

  it("wins after holding the majority for three minutes", async () => {
    const { game, a, zones } = await build();
    capture(game, a, zones.slice(0, 3));
    expect(game.getWinner()).toBeNull();

    runSeconds(game, CONQUEST_HOLD_SECONDS - 10);
    expect(game.getWinner()).toBeNull();
    runSeconds(game, 15);
    expect(game.getWinner()).toBe(a);
  });

  it("tells everyone and sends the countdown start", async () => {
    const { game, a, zones } = await build();
    zones.slice(0, 3).forEach((zone) => takeZone(game, a, zone));
    let sent: unknown = undefined;
    let told = 0;
    for (let i = 0; i < (OBJECTIVE_CAPTURE_SECONDS + 1) * 10; i++) {
      const updates = game.executeNextTick();
      for (const u of updates[GameUpdateType.Objectives]) {
        if (u.conquest) sent = u.conquest;
      }
      told += updates[GameUpdateType.DisplayEvent].filter(
        (m) => m.message === "events_display.conquest_taken",
      ).length;
    }
    expect(told).toBe(1);
    expect(sent).toMatchObject({ holder: a.smallID(), team: null });
  });

  it("stops the countdown when the majority is lost, and restarts it", async () => {
    const { game, a, b, zones } = await build();
    capture(game, a, zones.slice(0, 3));
    runSeconds(game, CONQUEST_HOLD_SECONDS - 30);

    // b takes one of a's zones: a holds 2 of 5, no majority any more.
    capture(game, b, [zones[0]]);
    runSeconds(game, 60);
    expect(game.getWinner()).toBeNull();

    // a takes it back: the three minutes start over.
    capture(game, a, [zones[0]]);
    runSeconds(game, CONQUEST_HOLD_SECONDS - 20);
    expect(game.getWinner()).toBeNull();
    runSeconds(game, 25);
    expect(game.getWinner()).toBe(a);
  });

  it("does not count objectives in a normal game", async () => {
    const game = await setup("big_plains", { objectives: true }, [
      playerInfo("a", PlayerType.Human),
    ]);
    expect(game.config().isConquestMode()).toBe(false);
    game.addExecution(new ObjectiveExecution(SEED));
    game.executeNextTick();
    runSeconds(game, game.config().objectiveRevealDelay() / 10 + 1);
    const a = game.player("a");
    a.conquer(game.ref(0, 0));
    game.objectives().forEach((zone) => takeZone(game, a, zone));
    runSeconds(game, OBJECTIVE_CAPTURE_SECONDS + CONQUEST_HOLD_SECONDS + 5);
    expect(game.getWinner()).toBeNull();
  });
});
