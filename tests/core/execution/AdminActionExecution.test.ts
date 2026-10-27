import { describe, expect, it } from "vitest";
import {
  ADMIN_MAX_TROOPS,
  AdminActionExecution,
  FAKE_ALERT_TICKS,
} from "../../../src/core/execution/AdminActionExecution";
import { SpawnExecution } from "../../../src/core/execution/SpawnExecution";
import { Game, PlayerInfo, PlayerType } from "../../../src/core/game/Game";
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
});
