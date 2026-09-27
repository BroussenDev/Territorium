import { Execution, Game, Player, UnitType } from "../game/Game";
import { capitalRebuildTicksLeft, hasCapital } from "../game/NationsMode";

/**
 * Nations mode: a player who lost their capital makes one of their finished
 * cities the new capital, once the rebuild delay has passed. Free.
 * NationsModeExecution picks the new capital up on its next tick.
 */
export class SetCapitalExecution implements Execution {
  private active = true;

  constructor(
    private readonly player: Player,
    private readonly unitId: number,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.config().isNationsMode() || mg.inSpawnPhase()) return;
    const city = mg.unit(this.unitId);
    if (
      city === undefined ||
      city.type() !== UnitType.City ||
      city.owner() !== this.player ||
      !city.isActive() ||
      city.isUnderConstruction()
    ) {
      console.warn(`SetCapitalExecution: invalid city ${this.unitId}`);
      return;
    }
    if (
      hasCapital(this.player) ||
      capitalRebuildTicksLeft(this.player.capitalLostTick(), ticks) > 0
    ) {
      return;
    }
    city.setCapital(true);
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
