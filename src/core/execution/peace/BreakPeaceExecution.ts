import { Execution, Game, Player, PlayerID } from "../../game/Game";

// Breaking a peace treaty on purpose. It is perjury: the breaker pays what a
// betrayal of an ally costs, and everyone is told.
export class BreakPeaceExecution implements Execution {
  private active = true;

  constructor(
    private breaker: Player,
    private victimID: PlayerID,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.hasPlayer(this.victimID)) {
      console.warn(`BreakPeaceExecution: victim ${this.victimID} not found`);
      return;
    }
    mg.breakPeace(this.breaker, mg.player(this.victimID));
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
