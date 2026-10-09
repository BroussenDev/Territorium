import {
  ColoredTeams,
  Execution,
  Game,
  MessageType,
  Nation,
  Player,
  PlayerInfo,
  PlayerType,
} from "../game/Game";
import { TileRef } from "../game/GameMap";
import { generateUniqueNationName } from "../game/NationCreation";
import {
  SURVIVAL_WAVES,
  survivalWaveSize,
  survivalWaveState,
} from "../game/Survival";
import { PseudoRandom } from "../PseudoRandom";
import { GameID } from "../Schemas";
import { NationExecution } from "./NationExecution";
import { SpawnExecution } from "./SpawnExecution";
import { getSpawnTiles } from "./Util";

// Tries to find free land for one invader before the wave falls back to
// reinforcing the invaders already on the map.
const LANDING_TRIES = 1_000;

// Radius of the patch a newcomer takes from the invaders already in a full
// landing zone (same as a spawn's).
const LANDING_PATCH = 4;

/**
 * Survival mode (game/Survival.ts): lands each wave of AI invaders on the
 * schedule. Each invader is a nation on the Nations team, playing the same
 * AI as every nation and starting like a player who joins: on free land,
 * with a player's starting troops.
 *
 * When the map has no free land left, the invaders that would have landed
 * reinforce the invaders still alive with the same starting troops instead,
 * within their usual troop cap: the same strength, nothing extra.
 */
export class SurvivalExecution implements Execution {
  private mg: Game | null = null;
  private random: PseudoRandom;
  private wavesLanded = 0;
  private readonly usedNames = new Set<string>();
  private active = true;
  // The landings of the wave being placed: their spawns only run next tick,
  // so later invaders of the same wave keep clear of them.
  private pending: TileRef[] = [];
  private zonesPublished = false;

  constructor(
    private gameID: GameID,
    seed: number,
  ) {
    // Its own stream, apart from the one handing out the starting players'
    // IDs.
    this.random = new PseudoRandom(seed + 7);
  }

  init(mg: Game): void {
    this.mg = mg;
    for (const player of mg.allPlayers()) this.usedNames.add(player.name());
  }

  tick(): void {
    const mg = this.mg;
    if (mg === null) throw new Error("Not initialized");
    if (!this.zonesPublished) {
      this.zonesPublished = true;
      mg.publishSurvivalZones();
    }
    if (mg.inSpawnPhase()) return;
    if (mg.getWinner() !== null) {
      this.active = false;
      return;
    }
    const { wave } = survivalWaveState(
      Math.round(mg.elapsedGameSeconds() * 10),
    );
    while (this.wavesLanded < wave) {
      this.wavesLanded++;
      this.landWave(mg, this.wavesLanded);
    }
    if (this.wavesLanded >= SURVIVAL_WAVES) this.active = false;
  }

  /** How many waves have landed so far. */
  waves(): number {
    return this.wavesLanded;
  }

  private landWave(mg: Game, wave: number): void {
    const defenders = mg
      .players()
      .filter((p) => p.type() === PlayerType.Human).length;
    const size = survivalWaveSize(wave, Math.max(1, defenders));
    this.reclaimZones(mg);
    this.pending = [];
    let stranded = 0;
    for (let i = 0; i < size; i++) {
      const tile = this.findLanding(mg);
      if (tile === null) {
        stranded++;
        continue;
      }
      this.pending.push(tile);
      this.landInvader(mg, tile);
    }
    if (stranded > 0) this.reinforce(mg, stranded);
    mg.displayMessage(
      "events_display.survival_wave_landed",
      MessageType.NAVAL_INVASION_INBOUND,
      null,
      undefined,
      { wave, count: size },
    );
  }

  // Each wave takes its landing zones back: what the defenders hold there,
  // land and buildings, is freed for the invaders to land on. Defenders can
  // fight in the zones between waves, never keep them.
  private reclaimZones(mg: Game): void {
    if (mg.survivalZones().length === 0) return;
    for (const defender of mg.players()) {
      if (defender.type() !== PlayerType.Human) continue;
      for (const unit of defender.units()) {
        if (mg.inSurvivalZone(unit.tile())) unit.delete(false);
      }
      const held: TileRef[] = [];
      for (const tile of defender.tiles()) {
        if (mg.inSurvivalZone(tile)) held.push(tile);
      }
      for (const tile of held) defender.relinquish(tile);
    }
  }

  private landInvader(mg: Game, tile: TileRef): void {
    const name = generateUniqueNationName(this.random, this.usedNames);
    this.usedNames.add(name);
    const info = new PlayerInfo(
      name,
      PlayerType.Nation,
      null,
      this.random.nextID(),
    );
    mg.addPlayer(info, ColoredTeams.Nations);
    mg.addExecution(
      new SpawnExecution(this.gameID, info, tile),
      new NationExecution(this.gameID, new Nation(undefined, info), true),
    );
  }

  // Free land in a landing zone first (kept free for the waves), else free
  // land away from the defenders, so an invader lands on open ground rather
  // than inside someone's border.
  private findLanding(mg: Game): TileRef | null {
    return (
      this.landingInZones(mg) ??
      this.landingOnInvaders(mg) ??
      this.landingAnywhere(mg)
    );
  }

  private landingInZones(mg: Game): TileRef | null {
    const zones = mg.survivalZones();
    if (zones.length === 0) return null;
    for (let tries = 0; tries < LANDING_TRIES; tries++) {
      const z = zones[this.random.nextInt(0, zones.length)];
      const x = z.x + this.random.nextInt(-z.radius, z.radius + 1);
      const y = z.y + this.random.nextInt(-z.radius, z.radius + 1);
      if (!mg.isValidCoord(x, y)) continue;
      const tile = mg.ref(x, y);
      if (!mg.inSurvivalZone(tile)) continue;
      if (!mg.isLand(tile) || mg.hasOwner(tile) || mg.isBorder(tile)) continue;
      if (this.nearPending(mg, tile)) continue;
      if (getSpawnTiles(mg, tile, false).length === 0) continue;
      return tile;
    }
    return null;
  }

  // A zone the earlier waves fill up still takes the next one: the newcomer
  // lands on a patch the invaders already hold there (same side, nothing
  // taken from the defenders), so every wave lands.
  private landingOnInvaders(mg: Game): TileRef | null {
    const zones = mg.survivalZones();
    if (zones.length === 0) return null;
    for (let tries = 0; tries < LANDING_TRIES; tries++) {
      const z = zones[this.random.nextInt(0, zones.length)];
      const x = z.x + this.random.nextInt(-z.radius, z.radius + 1);
      const y = z.y + this.random.nextInt(-z.radius, z.radius + 1);
      if (!mg.isValidCoord(x, y)) continue;
      const tile = mg.ref(x, y);
      if (!mg.inSurvivalZone(tile) || !mg.isLand(tile)) continue;
      if (!this.heldByInvader(mg, tile) || this.nearPending(mg, tile)) continue;
      // Free the patch the newcomer spawns on, from invaders only.
      for (let dy = -LANDING_PATCH; dy <= LANDING_PATCH; dy++) {
        for (let dx = -LANDING_PATCH; dx <= LANDING_PATCH; dx++) {
          if (dx * dx + dy * dy > LANDING_PATCH * LANDING_PATCH) continue;
          if (!mg.isValidCoord(x + dx, y + dy)) continue;
          const t = mg.ref(x + dx, y + dy);
          if (!mg.inSurvivalZone(t) || !this.heldByInvader(mg, t)) continue;
          (mg.owner(t) as Player).relinquish(t);
        }
      }
      if (getSpawnTiles(mg, tile, false).length === 0) continue;
      return tile;
    }
    return null;
  }

  // Whether a spawn at `tile` would overlap one already placed this wave.
  private nearPending(mg: Game, tile: TileRef): boolean {
    const gap = 2 * LANDING_PATCH + 1;
    return this.pending.some(
      (p) => mg.euclideanDistSquared(p, tile) < gap * gap,
    );
  }

  private heldByInvader(mg: Game, tile: TileRef): boolean {
    const owner = mg.owner(tile);
    return owner.isPlayer() && owner.team() === ColoredTeams.Nations;
  }

  private landingAnywhere(mg: Game): TileRef | null {
    const humans = mg.players().filter((p) => p.type() === PlayerType.Human);
    const minDistance = mg.config().minDistanceBetweenPlayers();
    for (let tries = 0; tries < LANDING_TRIES; tries++) {
      const tile = mg.ref(
        this.random.nextInt(0, mg.width()),
        this.random.nextInt(0, mg.height()),
      );
      if (!mg.isLand(tile) || mg.hasOwner(tile) || mg.isBorder(tile)) {
        continue;
      }
      if (this.nearPending(mg, tile)) continue;
      if (
        tries < LANDING_TRIES / 2 &&
        humans.some((h) => {
          const spawn = h.spawnTile();
          return (
            spawn !== undefined && mg.manhattanDist(spawn, tile) < minDistance
          );
        })
      ) {
        continue;
      }
      if (getSpawnTiles(mg, tile, false).length === 0) continue;
      return tile;
    }
    return null;
  }

  private reinforce(mg: Game, stranded: number): void {
    const invaders = mg
      .players()
      .filter(
        (p): p is Player =>
          p.type() === PlayerType.Nation && p.team() === ColoredTeams.Nations,
      );
    if (invaders.length === 0) return;
    const troops = this.startingTroops(mg) * stranded;
    const share = Math.floor(troops / invaders.length);
    for (const invader of invaders) {
      const room = Math.max(
        0,
        Math.floor(mg.config().maxTroops(invader) - invader.troops()),
      );
      invader.addTroops(Math.min(share, room));
    }
  }

  private startingTroops(mg: Game): number {
    return mg
      .config()
      .startManpower(
        new PlayerInfo("", PlayerType.Nation, null, "reinforcement"),
      );
  }

  isActive(): boolean {
    return this.active;
  }

  activeDuringSpawnPhase(): boolean {
    // Publishes the landing zones from the first tick.
    return true;
  }
}
