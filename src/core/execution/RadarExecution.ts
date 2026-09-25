import {
  Execution,
  Game,
  MessageType,
  Player,
  Unit,
  UnitType,
} from "../game/Game";

// Enemy units a radar reports, with the name shown in the alert.
const WATCHED_TYPES = [
  UnitType.TransportShip,
  UnitType.Warship,
  UnitType.AtomBomb,
  UnitType.HydrogenBomb,
  UnitType.MIRV,
  UnitType.EMPBomb,
] as const;

const UNIT_TRANSLATION_KEYS: Record<(typeof WATCHED_TYPES)[number], string> = {
  [UnitType.TransportShip]: "unit_type.boat",
  [UnitType.Warship]: "unit_type.warship",
  [UnitType.AtomBomb]: "unit_type.atom_bomb",
  [UnitType.HydrogenBomb]: "unit_type.hydrogen_bomb",
  [UnitType.MIRV]: "unit_type.mirv",
  [UnitType.EMPBomb]: "unit_type.emp_bomb",
};

// A radar sweeps twice a second, not every tick.
const SCAN_INTERVAL_TICKS = 5;

// Enemy units each player's radars have already reported. Shared by all of a
// player's radars so overlapping radars report a unit once.
const reportedByPlayer = new WeakMap<Player, Set<Unit>>();

function reportedUnits(player: Player): Set<Unit> {
  let reported = reportedByPlayer.get(player);
  if (reported === undefined) {
    reported = new Set();
    reportedByPlayer.set(player, reported);
  }
  return reported;
}

/**
 * Warns the radar's owner when enemy ships or missiles come within
 * radarRange of it. Friendly (own, allied, teammate) units are ignored.
 * A radar under construction or disabled by an EMP sees nothing.
 */
export class RadarExecution implements Execution {
  private mg: Game;
  private active = true;

  constructor(private radar: Unit) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
  }

  tick(ticks: number): void {
    if (!this.radar.isActive()) {
      this.active = false;
      return;
    }
    if ((ticks + this.radar.id()) % SCAN_INTERVAL_TICKS !== 0) {
      return;
    }
    if (this.radar.isUnderConstruction() || this.radar.isDisabled()) {
      return;
    }
    this.scan();
  }

  private scan(): void {
    const owner = this.radar.owner();
    const reported = reportedUnits(owner);
    for (const unit of reported) {
      if (!unit.isActive()) reported.delete(unit);
    }

    // One alert per enemy and unit type per sweep, so a fleet doesn't flood
    // the event list.
    const contacts = new Map<
      string,
      { enemy: Player; type: UnitType; first: Unit; count: number }
    >();
    const nearby = this.mg.nearbyUnits(
      this.radar.tile(),
      this.mg.config().radarRange(),
      WATCHED_TYPES,
    );
    for (const { unit } of nearby) {
      const enemy = unit.owner();
      if (enemy === owner || owner.isFriendly(enemy, true)) continue;
      if (reported.has(unit)) continue;
      reported.add(unit);
      const key = `${enemy.smallID()}|${unit.type()}`;
      const contact = contacts.get(key);
      if (contact === undefined) {
        contacts.set(key, { enemy, type: unit.type(), first: unit, count: 1 });
      } else {
        contact.count++;
      }
    }

    for (const { enemy, type, first, count } of contacts.values()) {
      this.mg.displayMessage(
        "events_display.radar_contact",
        MessageType.RADAR_CONTACT,
        owner.id(),
        undefined,
        {
          name: enemy.displayName(),
          unit: UNIT_TRANSLATION_KEYS[type as (typeof WATCHED_TYPES)[number]],
          count,
        },
        first.id(),
        enemy.id(),
      );
    }
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return false;
  }
}
