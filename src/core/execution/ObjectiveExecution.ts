import {
  ColoredTeams,
  Execution,
  Game,
  MessageType,
  Player,
} from "../game/Game";
import { GameUpdateType } from "../game/GameUpdates";
import {
  forEachTileInZone,
  OBJECTIVE_CAPTURE_SECONDS,
  ObjectiveState,
  placeObjectives,
} from "../game/Objectives";

/**
 * Map objectives (see Objectives.ts). Zones are placed from the game seed at
 * init (during the spawn phase, so players see them before picking a start),
 * so every client places the same ones. Once per second after the spawn
 * phase, each zone checks which side holds most of its land: a side
 * other than the holder's advances the capture, anyone else lets it fall
 * back. Off unless `objectives` is set in the GameConfig.
 */
export class ObjectiveExecution implements Execution {
  private active = true;
  private mg: Game | null = null;

  constructor(private readonly seed: number) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    mg.setObjectives(placeObjectives(mg.map(), this.seed));
    this.publish();
  }

  tick(ticks: number): void {
    if (ticks % 10 !== 0) return; // once per second
    if (this.mg === null) throw new Error("Not initialized");
    // Zones show during the spawn phase so players can plan around them, but
    // nobody can take one until it ends.
    if (this.mg.inSpawnPhase()) return;
    let changed = false;
    for (const objective of this.mg.objectives()) {
      if (this.step(objective)) changed = true;
    }
    if (changed) this.publish();
  }

  /** Advances one zone by a second. Returns whether its state changed. */
  private step(objective: ObjectiveState): boolean {
    const mg = this.mg!;
    const before = `${objective.holder}:${objective.capturer}:${objective.progress}`;

    const holder = this.player(objective.holder);
    if (objective.holder !== 0 && (holder === null || !holder.isAlive())) {
      objective.holder = 0;
    }

    const controller = this.controller(objective);
    const contested =
      controller !== null &&
      controller.smallID() !== objective.holder &&
      !(holder !== null && holder.isOnSameTeam(controller));

    if (!contested) {
      // Uncontested or defended: the capture falls back.
      objective.progress = Math.max(0, objective.progress - 2);
      if (objective.progress === 0) objective.capturer = 0;
    } else if (objective.capturer !== controller.smallID()) {
      const capturer = this.player(objective.capturer);
      // A teammate carries on the capture; anyone else starts over.
      objective.progress =
        capturer !== null && capturer.isOnSameTeam(controller)
          ? objective.progress + 1
          : 1;
      objective.capturer = controller.smallID();
    } else {
      objective.progress++;
    }

    if (contested && objective.progress >= OBJECTIVE_CAPTURE_SECONDS) {
      const previous = objective.holder;
      objective.holder = controller.smallID();
      objective.capturer = 0;
      objective.progress = 0;
      mg.displayMessage(
        "events_display.objective_captured",
        MessageType.CAPTURED_ENEMY_UNIT,
        controller.id(),
      );
      const lost = this.player(previous);
      if (lost !== null && lost.isAlive()) {
        mg.displayMessage(
          "events_display.objective_lost",
          MessageType.UNIT_DESTROYED,
          lost.id(),
          undefined,
          { name: controller.displayName() },
        );
      }
    }

    return (
      before !==
      `${objective.holder}:${objective.capturer}:${objective.progress}`
    );
  }

  /**
   * The player whose side owns more than half the zone's land, or null. In
   * team games a whole team counts together, and its largest owner in the
   * zone stands for it.
   */
  private controller(objective: ObjectiveState): Player | null {
    const mg = this.mg!;
    let land = 0;
    const byOwner = new Map<number, number>();
    forEachTileInZone(mg.map(), objective.tile, objective.radius, (tile) => {
      if (!mg.isLand(tile)) return;
      land++;
      const owner = mg.ownerID(tile);
      if (owner !== 0) byOwner.set(owner, (byOwner.get(owner) ?? 0) + 1);
    });

    const bySide = new Map<
      string,
      { tiles: number; lead: Player; most: number }
    >();
    for (const [smallID, tiles] of byOwner) {
      const player = this.player(smallID);
      if (player === null) continue;
      const team = player.team();
      const key =
        team !== null && team !== ColoredTeams.Bot
          ? `t:${team}`
          : `p:${smallID}`;
      const side = bySide.get(key);
      if (side === undefined) {
        bySide.set(key, { tiles, lead: player, most: tiles });
      } else {
        side.tiles += tiles;
        // Ties go to the lower smallID so every client agrees.
        if (
          tiles > side.most ||
          (tiles === side.most && smallID < side.lead.smallID())
        ) {
          side.lead = player;
          side.most = tiles;
        }
      }
    }
    for (const side of bySide.values()) {
      if (side.tiles * 2 > land) return side.lead;
    }
    return null;
  }

  private player(smallID: number): Player | null {
    if (smallID === 0) return null;
    const p = this.mg!.playerBySmallID(smallID);
    return p.isPlayer() ? p : null;
  }

  private publish(): void {
    this.mg!.addUpdate({
      type: GameUpdateType.Objectives,
      objectives: this.mg!.objectives().map((o) => ({ ...o })),
    });
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}
