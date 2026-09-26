import { Execution, Game, Player, PlayerID } from "../../game/Game";

export class PeaceRejectExecution implements Execution {
  private active = true;

  constructor(
    private requestorID: PlayerID,
    private recipient: Player,
  ) {}

  init(mg: Game, ticks: number): void {
    this.active = false;
    if (!mg.hasPlayer(this.requestorID)) {
      console.warn(
        `[PeaceRejectExecution] Requestor ${this.requestorID} not found`,
      );
      return;
    }
    const requestor = mg.player(this.requestorID);
    const request = this.recipient
      .incomingPeaceRequests()
      .find((r) => r.requestor() === requestor);
    if (request === undefined) {
      console.warn(
        `[PeaceRejectExecution] no peace proposal from ${this.requestorID}`,
      );
      return;
    }
    request.reject();
  }

  tick(ticks: number): void {}

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
