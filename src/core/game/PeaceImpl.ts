import { PeaceRequest, PeaceTreaty, Player, Tick } from "./Game";
import { GameImpl } from "./GameImpl";
import { GameUpdateType, PeaceRequestUpdate } from "./GameUpdates";

export class PeaceRequestImpl implements PeaceRequest {
  private status_: "pending" | "accepted" | "rejected" = "pending";

  constructor(
    private readonly requestor_: Player,
    private readonly recipient_: Player,
    private readonly createdAt_: Tick,
    private readonly game: GameImpl,
    private readonly vassal_: boolean = false,
  ) {}

  vassal(): boolean {
    return this.vassal_;
  }

  status(): "pending" | "accepted" | "rejected" {
    return this.status_;
  }

  requestor(): Player {
    return this.requestor_;
  }

  recipient(): Player {
    return this.recipient_;
  }

  createdAt(): Tick {
    return this.createdAt_;
  }

  accept(): void {
    if (this.status_ !== "pending") return;
    this.status_ = "accepted";
    this.game.acceptPeaceRequest(this);
  }

  reject(): void {
    if (this.status_ !== "pending") return;
    this.status_ = "rejected";
    this.game.rejectPeaceRequest(this);
  }

  // Withdrawn without a refusal (a side left the game): no cooldown, no
  // message.
  cancel(): void {
    if (this.status_ !== "pending") return;
    this.status_ = "rejected";
    this.game.cancelPeaceRequest(this);
  }

  toUpdate(): PeaceRequestUpdate {
    return {
      type: GameUpdateType.PeaceRequest,
      requestorID: this.requestor_.smallID(),
      recipientID: this.recipient_.smallID(),
      createdAt: this.createdAt_,
      vassal: this.vassal_ || undefined,
    };
  }
}

export class PeaceTreatyImpl implements PeaceTreaty {
  constructor(
    private readonly requestor_: Player,
    private readonly recipient_: Player,
    private readonly createdAt_: Tick,
    private readonly expiresAt_: Tick,
    private readonly vassal_: Player | null = null,
  ) {}

  vassal(): Player | null {
    return this.vassal_;
  }

  requestor(): Player {
    return this.requestor_;
  }

  recipient(): Player {
    return this.recipient_;
  }

  createdAt(): Tick {
    return this.createdAt_;
  }

  expiresAt(): Tick {
    return this.expiresAt_;
  }

  other(player: Player): Player {
    return this.requestor_ === player ? this.recipient_ : this.requestor_;
  }

  involves(a: Player, b: Player): boolean {
    return (
      (this.requestor_ === a && this.recipient_ === b) ||
      (this.requestor_ === b && this.recipient_ === a)
    );
  }
}
