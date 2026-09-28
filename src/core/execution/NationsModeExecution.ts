import {
  Execution,
  Game,
  MessageType,
  Player,
  PlayerType,
  Unit,
  UnitType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import {
  CAPITAL_REBUILD_DELAY_TICKS,
  NationsMapData,
  NationsSeat,
  startCompensation,
} from "../game/NationsMode";
import { CityExecution } from "./CityExecution";
import { PlayerExecution } from "./PlayerExecution";

/**
 * Runs a Nations game: at the first tick every seated player receives their
 * whole country and a capital city on its real capital; afterwards it watches
 * the capitals, announcing each fall and letting nations proclaim a new one.
 * Humans proclaim theirs through SetCapitalExecution.
 */
export class NationsModeExecution implements Execution {
  private mg: Game;
  private active = true;
  // The city standing as each player's capital, and the real capital's name
  // while it is the original one.
  private readonly capitals = new Map<Player, Unit>();
  private readonly capitalNames = new Map<Unit, string>();
  // Executions created while setting the game up. Game.addExecution from
  // inside init() is lost (the pending list is replaced after the init
  // pass), so they are handed over at the first tick instead.
  private setup: Execution[] = [];

  constructor(
    private readonly data: NationsMapData,
    private readonly seats: NationsSeat[],
  ) {}

  init(mg: Game, ticks: number): void {
    this.mg = mg;
    const byCountry = new Map<number, Player>();
    for (const seat of this.seats) {
      const player = mg.hasPlayer(seat.info.id)
        ? mg.player(seat.info.id)
        : mg.addPlayer(seat.info);
      byCountry.set(seat.country + 1, player);
    }

    mg.forEachTile((tile) => {
      const id = this.data.ids[tile];
      if (id === 0 || !mg.isLand(tile) || mg.isImpassable(tile)) return;
      byCountry.get(id)?.conquer(tile);
    });

    for (const seat of this.seats) {
      const player = mg.player(seat.info.id);
      const country = this.data.countries[seat.country];
      const capitalTile = this.capitalTile(player, country.coordinates);
      if (capitalTile === null) {
        console.warn(`nations: ${seat.info.name} has no land`);
        continue;
      }
      player.setSpawnTile(capitalTile);
      this.setup.push(new PlayerExecution(player));

      // The capital is a gift: refund whatever the city cost.
      const goldBefore = player.gold();
      const capital = player.buildUnit(UnitType.City, capitalTile, {});
      player.addGold(goldBefore - player.gold());
      capital.setCapital(true);
      this.setup.push(new CityExecution(capital));
      this.capitals.set(player, capital);
      if (country.capital !== undefined) {
        this.capitalNames.set(capital, country.capital);
      }

      const bonus = startCompensation(country.tiles);
      player.addGold(bonus.gold);
      player.addTroops(bonus.troops);
    }
  }

  // The real capital's tile, or any tile of the player if it isn't theirs.
  private capitalTile(
    player: Player,
    coordinates: [number, number] | undefined,
  ): TileRef | null {
    if (coordinates !== undefined) {
      const [x, y] = coordinates;
      if (this.mg.isValidCoord(x, y)) {
        const tile = this.mg.ref(x, y);
        if (this.mg.owner(tile) === player) return tile;
      }
    }
    const tiles = player.tiles();
    for (const tile of tiles) return tile;
    return null;
  }

  tick(ticks: number): void {
    if (this.setup.length > 0) {
      this.mg.addExecution(...this.setup);
      this.setup = [];
    }
    // Falls first, so a conqueror never inherits the capital flag.
    for (const [player, capital] of this.capitals) {
      if (capital.isActive() && capital.owner() === player) continue;
      if (capital.isActive()) capital.setCapital(false);
      this.capitals.delete(player);
      player.setCapitalLostTick(ticks);
      const name = this.capitalNames.get(capital);
      this.capitalNames.delete(capital);
      this.mg.displayMessage(
        name !== undefined
          ? "events_display.capital_fallen"
          : "events_display.new_capital_fallen",
        MessageType.CAPITAL_FALLEN,
        null,
        undefined,
        { capital: name ?? "", name: player.displayName() },
      );
    }

    for (const player of this.mg.players()) {
      if (this.capitals.has(player)) continue;
      const proclaimed = player
        .units(UnitType.City)
        .find((city) => city.isCapital());
      if (proclaimed !== undefined) {
        this.track(player, proclaimed);
      } else if (
        player.type() === PlayerType.Nation &&
        player.capitalLostTick() >= 0 &&
        ticks - player.capitalLostTick() >= CAPITAL_REBUILD_DELAY_TICKS
      ) {
        this.proclaimForNation(player);
      }
    }
  }

  private track(player: Player, capital: Unit): void {
    this.capitals.set(player, capital);
    player.setCapitalLostTick(-1);
  }

  // Nations move their capital to their biggest finished city.
  private proclaimForNation(player: Player): void {
    let best: Unit | null = null;
    for (const city of player.units(UnitType.City)) {
      if (city.isUnderConstruction()) continue;
      if (best === null || city.level() > best.level()) best = city;
    }
    if (best === null) return;
    best.setCapital(true);
    this.track(player, best);
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    return true;
  }
}
