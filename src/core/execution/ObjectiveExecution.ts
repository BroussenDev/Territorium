import {
  ColoredTeams,
  Execution,
  Game,
  MessageType,
  Player,
} from "../game/Game";
import { GameUpdateType } from "../game/GameUpdates";
import {
  CONQUEST_HOLD_SECONDS,
  CONQUEST_OBJECTIVES,
  conquestMajority,
  ConquestState,
  forEachTileInZone,
  OBJECTIVE_CAPTURE_SECONDS,
  ObjectiveState,
  placeObjectives,
} from "../game/Objectives";

/**
 * Map objectives (see Objectives.ts). Zones are placed from the game seed, so
 * every client places the same ones, but stay hidden until
 * objectiveRevealDelay after the spawn phase: nobody can pick a start next to
 * one and rush it. Everyone is told when they appear. From then on, once per
 * second, each zone checks which side holds most of its land: a side other
 * than the holder's advances the capture, anyone else lets it fall back. Off
 * unless `objectives` is set in the GameConfig.
 */
export class ObjectiveExecution implements Execution {
  private active = true;
  private mg: Game | null = null;
  private revealed = false;
  /** Conquest mode: who holds the majority of the objectives. */
  private conquest: ConquestState | null = null;

  constructor(private readonly seed: number) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (this.mg === null) throw new Error("Not initialized");
    if (this.mg.inSpawnPhase()) return;
    if (!this.revealed) {
      const delay = this.mg.config().objectiveRevealDelay();
      if (this.mg.elapsedGameSeconds() >= delay / 10) this.reveal();
      return;
    }
    if (ticks % 10 !== 0) return; // once per second
    if (this.mg.getWinner() !== null) return;
    let changed = false;
    for (const objective of this.mg.objectives()) {
      if (this.step(objective)) changed = true;
    }
    if (this.mg.config().isConquestMode() && this.stepConquest()) {
      changed = true;
    }
    if (changed) this.publish();
  }

  /**
   * Conquest mode: follows which side holds a strict majority of the
   * objectives. Taking it starts a CONQUEST_HOLD_SECONDS countdown, losing it
   * stops it, and holding it to the end wins the game. Returns whether the
   * majority changed hands.
   */
  private stepConquest(): boolean {
    const mg = this.mg!;
    const objectives = mg.objectives();
    const lead = this.majorityHolder(objectives);
    const now = Math.floor(mg.elapsedGameSeconds());
    const previous = this.conquest;
    const sameSide =
      previous !== null &&
      lead !== null &&
      (previous.team !== null
        ? previous.team === lead.team()
        : previous.holder === lead.smallID());

    if (lead === null) {
      if (previous === null) return false;
      this.conquest = null;
      const lost = this.player(previous.holder);
      mg.displayMessage(
        "events_display.conquest_broken",
        MessageType.ATTACK_FAILED,
        null,
        undefined,
        { name: lost?.displayName() ?? "" },
      );
      return true;
    }

    if (!sameSide) {
      this.conquest = { holder: lead.smallID(), team: lead.team(), since: now };
      mg.displayMessage(
        "events_display.conquest_taken",
        MessageType.NUKE_INBOUND,
        null,
        undefined,
        {
          name: lead.displayName(),
          minutes: CONQUEST_HOLD_SECONDS / 60,
        },
      );
      return true;
    }

    if (now - previous.since >= CONQUEST_HOLD_SECONDS) {
      const team = previous.team;
      mg.setWinner(team ?? lead, mg.stats().stats());
      this.active = false;
    }
    return false;
  }

  /**
   * The side holding a strict majority of the objectives, as its player with
   * the most of them (teammates count together), or null.
   */
  private majorityHolder(objectives: ObjectiveState[]): Player | null {
    const bySide = new Map<
      string,
      { count: number; lead: Player; most: number }
    >();
    const perPlayer = new Map<number, number>();
    for (const o of objectives) {
      if (o.holder === 0) continue;
      perPlayer.set(o.holder, (perPlayer.get(o.holder) ?? 0) + 1);
    }
    for (const [smallID, count] of perPlayer) {
      const player = this.player(smallID);
      if (player === null || !player.isAlive()) continue;
      const team = player.team();
      const key =
        team !== null && team !== ColoredTeams.Bot
          ? `t:${team}`
          : `p:${smallID}`;
      const side = bySide.get(key);
      if (side === undefined) {
        bySide.set(key, { count, lead: player, most: count });
      } else {
        side.count += count;
        if (
          count > side.most ||
          (count === side.most && smallID < side.lead.smallID())
        ) {
          side.lead = player;
          side.most = count;
        }
      }
    }
    const needed = conquestMajority(objectives.length);
    for (const side of bySide.values()) {
      if (side.count >= needed) return side.lead;
    }
    return null;
  }

  private reveal(): void {
    const mg = this.mg!;
    this.revealed = true;
    const objectives = mg.config().isConquestMode()
      ? placeObjectives(mg.map(), this.seed, CONQUEST_OBJECTIVES)
      : placeObjectives(mg.map(), this.seed);
    mg.setObjectives(objectives);
    this.publish();
    if (objectives.length > 0) {
      mg.displayMessage(
        "events_display.objectives_revealed",
        MessageType.OBJECTIVES_REVEALED,
        null,
        undefined,
        { count: objectives.length },
      );
    }
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
      ...(this.mg!.config().isConquestMode()
        ? { conquest: this.conquest === null ? null : { ...this.conquest } }
        : {}),
    });
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}
