import { Execution, Game, MessageType, PlayerID } from "../game/Game";
import { AdminActionIntent } from "../Schemas";

// Gifts are capped so a slip of the finger can't wreck a game.
export const ADMIN_MAX_TROOPS = 1_000_000;
export const ADMIN_MAX_GOLD = 10_000_000;
// How long a fake alert stays a scare before the joke is told (10 a second).
export const FAKE_ALERT_TICKS = 80;

/**
 * An admin's tool from the in-game staff menu (StaffReviewPanel). The game
 * server lets only an admin account send it, never in ranked or tournament
 * games (IntentAuthorization.ts). Like every intent it runs on every client
 * the same way, so the game stays in step.
 *
 *   give_troops / give_gold  the target receives them, capped
 *   fake_mirv / fake_nuke    the target gets the real incoming alert, then,
 *                            a few seconds later, "false alarm"
 */
export class AdminActionExecution implements Execution {
  private active = true;
  private mg!: Game;
  private revealAt = 0;

  constructor(private readonly intent: AdminActionIntent) {}

  activeDuringSpawnPhase(): boolean {
    return false;
  }

  isActive(): boolean {
    return this.active;
  }

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    const target = this.target();
    if (target === null) {
      this.active = false;
      return;
    }
    const amount = Math.max(0, Math.floor(this.intent.amount ?? 0));
    switch (this.intent.action) {
      case "give_troops":
        target.addTroops(Math.min(amount, ADMIN_MAX_TROOPS));
        this.active = false;
        return;
      case "give_gold":
        target.addGold(BigInt(Math.min(amount, ADMIN_MAX_GOLD)));
        this.active = false;
        return;
      case "fake_mirv":
        mg.displayMessage(
          "events_display.mirv_inbound",
          MessageType.MIRV_INBOUND,
          target.id(),
          undefined,
          { name: "???" },
        );
        break;
      case "fake_nuke":
        mg.displayMessage(
          "events_display.atom_bomb_inbound",
          MessageType.NUKE_INBOUND,
          target.id(),
          undefined,
          { name: "???" },
        );
        break;
    }
    this.revealAt = ticks + FAKE_ALERT_TICKS;
  }

  tick(ticks: number): void {
    if (ticks < this.revealAt) return;
    const target = this.target();
    if (target !== null) {
      this.mg.displayMessage(
        "events_display.admin_false_alarm",
        MessageType.CHAT,
        target.id(),
      );
    }
    this.active = false;
  }

  private target() {
    const id: PlayerID = this.intent.target;
    return this.mg.hasPlayer(id) ? this.mg.player(id) : null;
  }
}
