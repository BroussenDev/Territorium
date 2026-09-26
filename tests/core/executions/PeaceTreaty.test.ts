import { AllianceRequestExecution } from "../../../src/core/execution/alliance/AllianceRequestExecution";
import { AttackExecution } from "../../../src/core/execution/AttackExecution";
import { NationExecution } from "../../../src/core/execution/NationExecution";
import { NukeExecution } from "../../../src/core/execution/NukeExecution";
import { BreakPeaceExecution } from "../../../src/core/execution/peace/BreakPeaceExecution";
import { PeaceRejectExecution } from "../../../src/core/execution/peace/PeaceRejectExecution";
import { PeaceRequestExecution } from "../../../src/core/execution/peace/PeaceRequestExecution";
import { PlayerExecution } from "../../../src/core/execution/PlayerExecution";
import { TribeExecution } from "../../../src/core/execution/TribeExecution";
import {
  Cell,
  Difficulty,
  Game,
  MessageType,
  Nation,
  Player,
  PlayerInfo,
  PlayerType,
  UnitType,
} from "../../../src/core/game/Game";
import {
  DisplayMessageUpdate,
  GameUpdateType,
} from "../../../src/core/game/GameUpdates";
import { setup } from "../../util/Setup";
import { constructionExecution } from "../../util/utils";

let game: Game;
let p1: Player;
let p2: Player;
let p3: Player;
let messages: DisplayMessageUpdate[];

function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    const updates = game.executeNextTick();
    messages.push(...(updates[GameUpdateType.DisplayEvent] ?? []));
  }
}

function sign(a: Player, b: Player) {
  game.addExecution(new PeaceRequestExecution(a, b.id()));
  tick();
  game.addExecution(new PeaceRequestExecution(b, a.id()));
  tick();
}

// Fills a rectangle of land for a player.
function claim(player: Player, x0: number, y0: number, x1: number, y1: number) {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      player.conquer(game.ref(x, y));
    }
  }
}

async function newGame(map: string) {
  game = await setup(
    map,
    { infiniteGold: true, instantBuild: true, infiniteTroops: true },
    [
      new PlayerInfo("p1", PlayerType.Human, "c1", "p1"),
      new PlayerInfo("p2", PlayerType.Human, "c2", "p2"),
      new PlayerInfo("p3", PlayerType.Human, "c3", "p3"),
    ],
  );
  p1 = game.player("p1");
  p2 = game.player("p2");
  p3 = game.player("p3");
  messages = [];
}

describe("Peace treaty", () => {
  beforeEach(async () => {
    await newGame("plains");
    claim(p1, 0, 0, 9, 9);
    claim(p2, 10, 0, 19, 9);
    claim(p3, 0, 30, 9, 39);
    for (const p of [p1, p2, p3]) {
      game.addExecution(new PlayerExecution(p));
    }
    tick();
  });

  test("proposing back signs the treaty, for both sides", () => {
    game.addExecution(new PeaceRequestExecution(p1, p2.id()));
    tick();
    expect(p2.incomingPeaceRequests().map((r) => r.requestor())).toEqual([p1]);
    expect(p1.isAtPeaceWith(p2)).toBe(false);

    game.addExecution(new PeaceRequestExecution(p2, p1.id()));
    tick();
    expect(p1.isAtPeaceWith(p2)).toBe(true);
    expect(p2.isAtPeaceWith(p1)).toBe(true);
    expect(p1.outgoingPeaceRequest()).toBeNull();
    expect(p2.incomingPeaceRequests()).toEqual([]);
    // Peace is not an alliance.
    expect(p1.isAlliedWith(p2)).toBe(false);
    expect(p1.isFriendly(p2)).toBe(false);
    expect(
      messages.filter((m) => m.message === "events_display.peace_signed"),
    ).toHaveLength(2);
  });

  test("lasts 3 minutes", () => {
    sign(p1, p2);
    const treaty = p1.peaceTreatyWith(p2)!;
    expect(treaty.expiresAt() - treaty.createdAt()).toBe(3 * 60 * 10);
  });

  test("no attack can be sent while at peace", () => {
    sign(p1, p2);
    expect(p1.canAttackPlayer(p2)).toBe(false);
    expect(p2.canAttackPlayer(p1)).toBe(false);
    expect(p1.canAttack(game.ref(10, 5))).toBe(false);

    game.addExecution(new AttackExecution(1000, p1, p2.id()));
    tick();
    expect(p1.outgoingAttacks()).toEqual([]);
    expect(p1.isAtPeaceWith(p2)).toBe(true);
    // A third player is unaffected.
    expect(p1.canAttackPlayer(p3)).toBe(true);
  });

  test("attacks in progress between the two turn back at signing", () => {
    game.addExecution(new AttackExecution(1000, p1, p2.id()));
    tick();
    expect(p1.outgoingAttacks().some((a) => !a.retreating())).toBe(true);

    sign(p1, p2);
    expect(p1.outgoingAttacks().every((a) => a.retreating())).toBe(true);
  });

  test("a refusal blocks a new proposal to that player for 60 s", () => {
    game.addExecution(new PeaceRequestExecution(p1, p2.id()));
    tick();
    game.addExecution(new PeaceRejectExecution(p1.id(), p2));
    tick();
    expect(p1.outgoingPeaceRequest()).toBeNull();
    expect(p1.isAtPeaceWith(p2)).toBe(false);
    expect(
      messages.some(
        (m) =>
          m.message === "events_display.peace_rejected" &&
          m.playerID === p1.smallID(),
      ),
    ).toBe(true);

    expect(p1.canProposePeace(p2)).toBe(false);
    expect(p1.canProposePeace(p3)).toBe(true);
    // The one who said no can still offer peace.
    expect(p2.canProposePeace(p1)).toBe(true);

    tick(game.config().peaceRejectCooldown());
    expect(p1.canProposePeace(p2)).toBe(true);
  });

  test("an unanswered proposal expires after 15 s and counts as a refusal", () => {
    game.addExecution(new PeaceRequestExecution(p1, p2.id()));
    tick();
    tick(game.config().peaceRequestDuration() - 2);
    expect(p1.outgoingPeaceRequest()).not.toBeNull();
    tick(2);
    expect(p1.outgoingPeaceRequest()).toBeNull();
    expect(p1.isAtPeaceWith(p2)).toBe(false);
    expect(p1.canProposePeace(p2)).toBe(false);
  });

  test("only one proposal can wait at a time", () => {
    game.addExecution(new PeaceRequestExecution(p1, p2.id()));
    tick();
    expect(p1.canProposePeace(p3)).toBe(false);
    game.addExecution(new PeaceRequestExecution(p1, p3.id()));
    tick();
    expect(p3.incomingPeaceRequests()).toEqual([]);
    // Answering someone else's proposal is still allowed.
    game.addExecution(new PeaceRequestExecution(p3, p1.id()));
    tick();
    expect(p1.canProposePeace(p3)).toBe(true);
  });

  test("allies and teammates cannot sign peace", () => {
    game.addExecution(new AllianceRequestExecution(p1, p3.id()));
    tick();
    game.addExecution(new AllianceRequestExecution(p3, p1.id()));
    tick();
    expect(p1.isAlliedWith(p3)).toBe(true);
    expect(p1.canProposePeace(p3)).toBe(false);
    expect(p1.canProposePeace(p1)).toBe(false);
  });

  test("expires on its own, then either side waits 30 s to propose again", () => {
    sign(p1, p2);
    tick(game.config().peaceDuration());
    expect(p1.isAtPeaceWith(p2)).toBe(false);
    expect(p1.canAttackPlayer(p2)).toBe(true);
    expect(
      messages.filter((m) => m.message === "events_display.peace_expired"),
    ).toHaveLength(2);
    // The traitor mark is only for perjury.
    expect(p1.isTraitor()).toBe(false);
    expect(p2.isTraitor()).toBe(false);

    expect(p1.canProposePeace(p2)).toBe(false);
    expect(p2.canProposePeace(p1)).toBe(false);
    tick(game.config().peaceEndCooldown());
    expect(p1.canProposePeace(p2)).toBe(true);
    expect(p2.canProposePeace(p1)).toBe(true);
  });

  test("breaking the peace is perjury", () => {
    sign(p1, p2);
    game.addExecution(new BreakPeaceExecution(p1, p2.id()));
    tick();

    expect(p1.isAtPeaceWith(p2)).toBe(false);
    expect(p1.canAttackPlayer(p2)).toBe(true);
    // Same penalty as betraying an ally.
    expect(p1.isTraitor()).toBe(true);
    expect(p1.betrayals()).toBe(1);
    expect(p2.isTraitor()).toBe(false);

    // Everyone is told.
    const broken = messages.filter(
      (m) => m.message === "events_display.peace_broken",
    );
    expect(broken).toHaveLength(1);
    expect(broken[0].playerID).toBeNull();
    expect(broken[0].messageType).toBe(MessageType.ALLIANCE_BROKEN);
    expect(broken[0].params).toEqual({
      breaker: p1.displayName(),
      victim: p2.displayName(),
    });
  });

  test("a perjurer cannot offer peace to their victim for 10 minutes", () => {
    sign(p1, p2);
    game.addExecution(new BreakPeaceExecution(p1, p2.id()));
    tick();

    expect(p1.canProposePeace(p2)).toBe(false);
    expect(p1.canProposePeace(p3)).toBe(true);
    // The victim can offer it whenever they like.
    expect(p2.canProposePeace(p1)).toBe(true);

    tick(game.config().perjuryPeaceCooldown() - 2);
    expect(p1.canProposePeace(p2)).toBe(false);
    tick(2);
    expect(p1.canProposePeace(p2)).toBe(true);
  });

  test("breaking a peace that does not exist does nothing", () => {
    game.addExecution(new BreakPeaceExecution(p1, p2.id()));
    tick();
    expect(p1.isTraitor()).toBe(false);
    expect(
      messages.some((m) => m.message === "events_display.peace_broken"),
    ).toBe(false);
  });

  test("ends quietly when one side is eliminated", () => {
    sign(p1, p2);
    game.addExecution(new PeaceRequestExecution(p3, p1.id()));
    tick();
    for (const t of Array.from(p1.tiles())) {
      p3.conquer(t);
    }
    tick();
    expect(p1.isAlive()).toBe(false);
    expect(game.peaceTreaties()).toEqual([]);
    expect(p1.incomingPeaceRequests()).toEqual([]);
    expect(
      messages.some((m) => m.message === "events_display.peace_expired"),
    ).toBe(false);
  });
});

describe("Peace treaty and missiles", () => {
  beforeEach(async () => {
    await newGame("big_plains");
    claim(p1, 5, 5, 15, 15);
    claim(p2, 180, 180, 190, 190);
    claim(p3, 5, 180, 15, 190);
    for (const p of [p1, p2, p3]) {
      game.addExecution(new PlayerExecution(p));
    }
    constructionExecution(game, p1, 10, 10, UnitType.MissileSilo);
    tick();
  });

  test("firing a missile at a player at peace breaks the treaty", () => {
    sign(p1, p2);
    game.addExecution(
      new NukeExecution(UnitType.AtomBomb, p1, game.ref(185, 185), null),
    );
    tick(2);
    expect(p1.isAtPeaceWith(p2)).toBe(false);
    expect(p1.isTraitor()).toBe(true);
    expect(
      messages.some((m) => m.message === "events_display.peace_broken"),
    ).toBe(true);
  });

  test("an EMP fired at a player at peace breaks it too", () => {
    sign(p1, p2);
    game.addExecution(
      new NukeExecution(UnitType.EMPBomb, p1, game.ref(185, 185), null),
    );
    tick(2);
    expect(p1.isAtPeaceWith(p2)).toBe(false);
    expect(p1.isTraitor()).toBe(true);
  });

  test("missiles in flight between the two are called off at signing", () => {
    game.addExecution(
      new NukeExecution(UnitType.AtomBomb, p1, game.ref(185, 185), null),
    );
    tick(2);
    expect(p1.units(UnitType.AtomBomb)).toHaveLength(1);

    sign(p2, p1);
    expect(p1.units(UnitType.AtomBomb)).toHaveLength(0);
    expect(p1.isAtPeaceWith(p2)).toBe(true);
    expect(p1.isTraitor()).toBe(false);
  });
});

describe("Peace treaty with AI players", () => {
  async function aiGame() {
    game = await setup(
      "plains",
      {
        infiniteGold: true,
        instantBuild: true,
        difficulty: Difficulty.Impossible,
      },
      [
        new PlayerInfo("p1", PlayerType.Human, "c1", "p1"),
        new PlayerInfo("p2", PlayerType.Human, "c2", "p2"),
      ],
    );
    p1 = game.player("p1");
    p2 = game.player("p2");
    messages = [];
    claim(p1, 0, 0, 9, 9);
    claim(p2, 0, 30, 9, 39);
    for (const p of [p1, p2]) {
      game.addExecution(new PlayerExecution(p));
    }
  }

  test("a tribe takes any peace offered", async () => {
    await aiGame();
    const tribe = game.addPlayer(
      new PlayerInfo("tribe", PlayerType.Bot, null, "tribe"),
    );
    claim(tribe, 10, 0, 19, 9);
    game.addExecution(new PlayerExecution(tribe));
    game.addExecution(new TribeExecution(tribe));
    // Let the tribe settle in before offering.
    tick(100);

    game.addExecution(new PeaceRequestExecution(p1, tribe.id()));
    tick(100);
    expect(p1.isAtPeaceWith(tribe)).toBe(true);
  });

  test("a nation accepts peace from an honest player and refuses a traitor", async () => {
    await aiGame();
    const info = new PlayerInfo("nation", PlayerType.Nation, null, "nation");
    const nation = game.addPlayer(info);
    claim(nation, 10, 0, 19, 9);
    game.addExecution(new PlayerExecution(nation));
    game.addExecution(
      new NationExecution("game_id", new Nation(new Cell(15, 5), info)),
    );
    tick(100);

    game.addExecution(new PeaceRequestExecution(p1, nation.id()));
    tick(100);
    expect(p1.isAtPeaceWith(nation)).toBe(true);

    p2.markTraitor();
    game.addExecution(new PeaceRequestExecution(p2, nation.id()));
    tick(100);
    expect(p2.isAtPeaceWith(nation)).toBe(false);
    expect(p2.outgoingPeaceRequest()).toBeNull();
  });
});
