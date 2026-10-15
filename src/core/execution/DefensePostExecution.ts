import { Execution, Game, Unit } from "../game/Game";

/**
 * A finished defense post. Its effect is on land attacks (they are slower
 * and cost more troops around it, see the attack execution): it fires at
 * nothing, ships included. Warships and SAM launchers defend the sea and the
 * sky.
 */
export class DefensePostExecution implements Execution {
  private active: boolean = true;

  constructor(private post: Unit) {}

  init(mg: Game, ticks: number): void {}

  tick(ticks: number): void {
    if (!this.post.isActive()) {
      this.active = false;
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
