import { describe, expect, it } from "vitest";
import {
  ADMIN_MAX_TROOPS,
  AdminActionExecution,
  cleanAnnouncement,
  FAKE_ALERT_TICKS,
} from "../../../src/core/execution/AdminActionExecution";
import { SpawnExecution } from "../../../src/core/execution/SpawnExecution";
import {
  Game,
  MessageType,
  PlayerInfo,
  PlayerType,
} from "../../../src/core/game/Game";
import { GameUpdateType } from "../../../src/core/game/GameUpdates";
import { AdminActionIntent } from "../../../src/core/Schemas";
import { setup } from "../../util/Setup";

async function game(): Promise<{
  g: Game;
  target: ReturnType<Game["player"]>;
}> {
  const g = await setup("ocean_and_land", { infiniteTroops: false });
  const info = new PlayerInfo("target", PlayerType.Human, null, "target_id");
  g.addPlayer(info);
  g.addExecution(new SpawnExecution("game_id", info, g.ref(0, 10)));
  while (g.inSpawnPhase()) g.executeNextTick();
  g.executeNextTick();
  return { g, target: g.player(info.id) };
}

const intent = (o: Partial<AdminActionIntent>): AdminActionIntent => ({
  type: "admin_action",
  action: "give_troops",
  target: "target_id",
  ...o,
});

describe("AdminActionExecution", () => {
  it("gives troops and gold, capped", async () => {
    const { g, target } = await game();
    const troops = target.troops();
    const gold = target.gold();
    g.addExecution(
      new AdminActionExecution(intent({ amount: 5_000 })),
      new AdminActionExecution(intent({ action: "give_gold", amount: 70_000 })),
    );
    g.executeNextTick();
    expect(target.troops()).toBeGreaterThanOrEqual(troops + 5_000);
    expect(target.gold()).toBeGreaterThanOrEqual(gold + 70_000n);

    const before = target.troops();
    g.addExecution(new AdminActionExecution(intent({ amount: 9_000_000 })));
    g.executeNextTick();
    expect(target.troops() - before).toBeLessThanOrEqual(
      ADMIN_MAX_TROOPS + 10_000,
    );
  });

  it("keeps troops given past the cap", async () => {
    const { g, target } = await game();
    for (let i = 0; i < 600; i++) g.executeNextTick();
    const full = target.troops();
    expect(full).toBeGreaterThan(0.9 * g.config().maxTroops(target));
    g.addExecution(new AdminActionExecution(intent({ amount: 100_000 })));
    for (let i = 0; i < 100; i++) g.executeNextTick();
    expect(target.troops()).toBeGreaterThanOrEqual(full + 100_000);
    expect(g.config().maxTroops(target)).toBeGreaterThanOrEqual(
      target.troops(),
    );
  });

  it("a fake MIRV warns the target, then owns up", async () => {
    const { g, target } = await game();
    g.addExecution(new AdminActionExecution(intent({ action: "fake_mirv" })));
    const messages: string[] = [];
    for (let i = 0; i < FAKE_ALERT_TICKS + 3; i++) {
      const updates = g.executeNextTick();
      for (const e of updates[GameUpdateType.DisplayEvent] ?? []) {
        if (e.playerID === target.smallID()) messages.push(e.message);
      }
    }
    expect(messages).toContain("events_display.mirv_inbound");
    expect(messages[messages.length - 1]).toBe(
      "events_display.admin_false_alarm",
    );
  });

  it("does nothing for an unknown target", async () => {
    const { g } = await game();
    const exec = new AdminActionExecution(intent({ target: "nobody" }));
    g.addExecution(exec);
    g.executeNextTick();
    expect(exec.isActive()).toBe(false);
  });

  it("sets troops and gold to zero, or halves the troops", async () => {
    const { g, target } = await game();
    g.addExecution(
      new AdminActionExecution(intent({ action: "give_gold", amount: 50_000 })),
    );
    g.executeNextTick();
    g.addExecution(
      new AdminActionExecution(intent({ action: "set_troops", amount: 0 })),
      new AdminActionExecution(intent({ action: "set_gold", amount: 0 })),
    );
    g.executeNextTick();
    // A tick of income may come in after the reset.
    expect(target.troops()).toBeLessThan(1_000);
    expect(target.gold()).toBeLessThan(1_000n);

    g.addExecution(
      new AdminActionExecution(
        intent({ action: "set_troops", amount: 40_000 }),
      ),
    );
    g.executeNextTick();
    const before = target.troops();
    g.addExecution(
      new AdminActionExecution(intent({ action: "halve_troops" })),
    );
    g.executeNextTick();
    expect(target.troops()).toBeLessThan(before * 0.6);
  });

  it("every new prank warns the target, then owns up", async () => {
    for (const action of [
      "fake_hbomb",
      "fake_invasion",
      "fake_betrayal",
      "fake_tax",
    ] as const) {
      const { g, target } = await game();
      g.addExecution(new AdminActionExecution(intent({ action })));
      const messages: string[] = [];
      for (let i = 0; i < FAKE_ALERT_TICKS + 3; i++) {
        for (const e of g.executeNextTick()[GameUpdateType.DisplayEvent] ??
          []) {
          if (e.playerID === target.smallID()) messages.push(e.message);
        }
      }
      expect(messages.length).toBeGreaterThanOrEqual(2);
      expect(messages[messages.length - 1]).toBe(
        "events_display.admin_false_alarm",
      );
    }
  });

  it("announces to everyone, and shows its pranks to everyone", async () => {
    const { g, target } = await game();
    g.addExecution(
      new AdminActionExecution(
        intent({ action: "announce", text: "  Bonne\nchance !  " }),
      ),
      new AdminActionExecution(intent({ action: "confetti" })),
      new AdminActionExecution(intent({ action: "flip_name" })),
      new AdminActionExecution(intent({ action: "announce", text: "   " })),
    );
    const events = g.executeNextTick()[GameUpdateType.DisplayEvent] ?? [];
    const announce = events.filter(
      (e) => e.messageType === MessageType.ADMIN_ANNOUNCE,
    );
    expect(announce).toHaveLength(1);
    expect(announce[0].playerID).toBeNull();
    expect(announce[0].params?.text).toBe("Bonne chance !");
    const effects = events.filter(
      (e) => e.messageType === MessageType.ADMIN_EFFECT,
    );
    expect(effects.map((e) => e.message).sort()).toEqual([
      "admin_effect.confetti",
      "admin_effect.flip_name",
    ]);
    expect(
      effects.every(
        (e) => e.playerID === null && e.params?.target === target.smallID(),
      ),
    ).toBe(true);
  });

  it("cleans an announcement", () => {
    expect(cleanAnnouncement("a\u0000b\u202ec   d")).toBe("a b c d");
    expect(cleanAnnouncement("x".repeat(300))).toHaveLength(140);
    expect(cleanAnnouncement(undefined)).toBe("");
  });
});
