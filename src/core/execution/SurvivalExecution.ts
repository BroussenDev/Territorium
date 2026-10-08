import {
  ColoredTeams,
  Execution,
  Game,
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
    let stranded = 0;
    for (let i = 0; i < size; i++) {
      const tile = this.findLanding(mg);
      if (tile === null) {
        stranded++;
        continue;
      }
      this.landInvader(mg, tile);
    }
    if (stranded > 0) this.reinforce(mg, stranded);
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

  // Free land away from the defenders, so an invader lands on the map's
  // open ground rather than inside someone's border.
  private findLanding(mg: Game): TileRef | null {
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
    return false;
  }
}
