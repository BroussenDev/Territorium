import {
  Execution,
  Game,
  PeaceRequest,
  Player,
  PlayerID,
} from "../../game/Game";

export class PeaceRequestExecution implements Execution {
  private req: PeaceRequest | null = null;
  private active = true;
  private mg: Game;

  constructor(
    private requestor: Player,
    private recipientID: PlayerID,
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    if (!mg.hasPlayer(this.recipientID)) {
      console.warn(
        `PeaceRequestExecution recipient ${this.recipientID} not found`,
      );
      this.active = false;
      return;
    }
    // Null when it answered the recipient's own proposal (the treaty is
    // signed on the spot) or when the proposal isn't allowed.
    this.req = mg.createPeaceRequest(
      this.requestor,
      mg.player(this.recipientID),
    );
    if (this.req === null) {
      this.active = false;
    }
  }

  tick(ticks: number): void {
    if (this.req === null || this.req.status() !== "pending") {
      this.active = false;
      return;
    }
    if (
      this.mg.ticks() - this.req.createdAt() >=
      this.mg.config().peaceRequestDuration()
    ) {
      // No answer counts as a refusal.
      this.req.reject();
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
