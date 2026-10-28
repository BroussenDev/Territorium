import { GameEvent } from "../EventBus";
import {
  ColoredTeams,
  Execution,
  Game,
  GameMode,
  MessageType,
  Player,
  PlayerType,
  RankedType,
  Team,
} from "../game/Game";
import {
  SURVIVAL_HOLD_TICKS,
  SURVIVAL_WAVES,
  survivalWaveState,
  survivalWaveTick,
} from "../game/Survival";

export class WinEvent implements GameEvent {
  constructor(public readonly winner: Player) {}
}

export class WinCheckExecution implements Execution {
  private active = true;

  private mg: Game | null = null;

  private checkedRankedSpawns = false;

  // Hard time limit (in seconds) to force a winner before the server's
  // maxGameDuration hard kill. 170mins (10 mins before 3hrs)
  private static readonly HARD_TIME_LIMIT_SECONDS = 170 * 60;

  constructor() {}

  init(mg: Game, ticks: number) {
    this.mg = mg;
  }

  tick(ticks: number) {
    if (ticks % 10 !== 0) {
      return;
    }
    if (this.mg === null) throw new Error("Not initialized");
    if (this.mg.getWinner() !== null) {
      this.active = false;
      return;
    }

    if (this.checkRanked2v2Cancelled()) {
      return;
    }

    this.announceFinalPhase();

    if (this.mg.config().gameConfig().gameMode === GameMode.FFA) {
      this.checkWinnerFFA();
    } else {
      this.checkWinnerTeam();
    }
  }

  // Once, as the final phase begins: everyone is told the game ends soon.
  private finalPhaseAnnounced = false;
  private announceFinalPhase(): void {
    if (this.mg === null || this.finalPhaseAnnounced) return;
    const config = this.mg.config();
    if (!config.inFinalPhase(this.mg.elapsedGameSeconds())) return;
    this.finalPhaseAnnounced = true;
    const sd = config.overtimeConfig();
    this.mg.displayMessage(
      "events_display.final_phase",
      MessageType.FINAL_PHASE,
      null,
      undefined,
      { minutes: sd.endMinutes - sd.finalPhaseMinutes },
    );
  }

  // A ranked 2v2 match is void unless all four matched players actually
  // spawned — a player who never joined isn't in the game at all, and one who
  // idled through the spawn phase never placed a spawn. Either way the match
  // would be lopsided, so end it with no winner (the record is archived
  // winnerless and never ranked). Runs once, on the first check after the
  // spawn phase ends (this execution is inactive during the spawn phase).
  private checkRanked2v2Cancelled(): boolean {
    if (this.mg === null) throw new Error("Not initialized");
    if (this.checkedRankedSpawns) {
      return false;
    }
    this.checkedRankedSpawns = true;
    const gameConfig = this.mg.config().gameConfig();
    if (gameConfig.rankedType !== RankedType.TwoVTwo) {
      return false;
    }
    // allPlayers: players() hides tile-less players, which is exactly what a
    // never-spawned player is.
    const spawned = this.mg
      .allPlayers()
      .filter((p) => p.type() === PlayerType.Human && p.hasSpawned()).length;
    const expected = gameConfig.maxPlayers ?? 0;
    if (spawned >= expected) {
      return false;
    }
    console.log(
      `ranked 2v2 cancelled: only ${spawned}/${expected} players spawned`,
    );
    this.mg.setWinner(null, this.mg.stats().stats());
    this.active = false;
    return true;
  }

  checkWinnerFFA(): void {
    if (this.mg === null) throw new Error("Not initialized");
    const sorted = this.mg
      .players()
      .sort((a, b) => b.numTilesOwned() - a.numTilesOwned());
    if (sorted.length === 0) {
      return;
    }

    // Matchmade games are human-only: the last one still connected wins.
    const rankedType = this.mg.config().gameConfig().rankedType;
    if (rankedType === RankedType.OneVOne || rankedType === RankedType.FFA) {
      const humans = sorted.filter(
        (p) => p.type() === PlayerType.Human && !p.isDisconnected(),
      );
      if (humans.length === 1) {
        this.mg.setWinner(humans[0], this.mg.stats().stats());
        console.log(`${humans[0].name()} has won the game`);
        this.active = false;
        return;
      }
    }

    const max = sorted[0];
    if (this.hasWon(max.numTilesOwned())) {
      this.mg.setWinner(max, this.mg.stats().stats());
      console.log(`${max.name()} has won the game`);
      this.active = false;
    }
  }

  // Hold more than the required share of non-fallout land, or outlast the
  // lobby timer / hard limit.
  private hasWon(tilesOwned: number): boolean {
    if (this.mg === null) throw new Error("Not initialized");
    const timeElapsed = this.mg.elapsedGameSeconds();
    // null (host lobby, timer off) means no timer, same as undefined.
    const maxTimerValue = this.mg.config().gameConfig().maxTimerValue;
    if (
      maxTimerValue !== undefined &&
      maxTimerValue !== null &&
      timeElapsed >= maxTimerValue * 60
    ) {
      return true;
    }
    if (timeElapsed >= WinCheckExecution.HARD_TIME_LIMIT_SECONDS) {
      return true;
    }
    // Overtime ends the game at its end minute: the side holding the most
    // land (the one checked here) wins.
    const sd = this.mg.config().overtimeConfig();
    if (sd.enabled && timeElapsed >= sd.endMinutes * 60) {
      return true;
    }
    const numTilesWithoutFallout =
      this.mg.numLandTiles() - this.mg.numTilesWithFallout();
    // Cross-multiplied: the threshold is a whole percentage, so this is
    // exact integer math.
    return (
      tilesOwned * 100 >
      numTilesWithoutFallout *
        this.mg.config().percentageTilesOwnedToWin(timeElapsed)
    );
  }

  checkWinnerTeam(): void {
    if (this.mg === null) throw new Error("Not initialized");

    if (this.mg.config().isSurvivalMode()) {
      this.checkWinnerSurvival();
      return;
    }

    if (
      this.mg.config().gameConfig().rankedType === RankedType.TwoVTwo ||
      this.mg.config().isVersusMode()
    ) {
      // players() only returns alive players, so a team drops out of this set
      // once every member is dead or disconnected.
      const teamsRemaining = new Set<Team>();
      for (const player of this.mg.players()) {
        if (player.type() !== PlayerType.Human || player.isDisconnected()) {
          continue;
        }
        const team = player.team();
        if (team !== null) {
          teamsRemaining.add(team);
        }
      }
      if (teamsRemaining.size === 1) {
        const [winner] = teamsRemaining;
        this.mg.setWinner(winner, this.mg.stats().stats());
        console.log(`${winner} has won the game`);
        this.active = false;
        return;
      }
    }

    const teamToTiles = new Map<Team, number>();
    for (const player of this.mg.players()) {
      const team = player.team();
      // Sanity check, team should not be null here
      if (team === null) continue;
      teamToTiles.set(
        team,
        (teamToTiles.get(team) ?? 0) + player.numTilesOwned(),
      );
    }
    const sorted = Array.from(teamToTiles.entries()).sort(
      (a, b) => b[1] - a[1],
    );
    if (sorted.length === 0) {
      return;
    }
    const max = sorted[0];
    if (this.hasWon(max[1])) {
      if (max[0] === ColoredTeams.Bot) return;
      this.mg.setWinner(max[0], this.mg.stats().stats());
      console.log(`${max[0]} has won the game`);
      this.active = false;
    }
  }

  // Survival (Survival.ts): the invaders win once no defender is left;
  // the defenders win once the last wave has landed and they have held out
  // SURVIVAL_HOLD_TICKS since, or every invader is gone, or the warlord
  // leading the last wave has fallen. Land share decides nothing.
  private checkWinnerSurvival(): void {
    if (this.mg === null) throw new Error("Not initialized");
    const alive = this.mg.players();
    const defenders = alive.some(
      (p) => p.type() === PlayerType.Human && !p.isDisconnected(),
    );
    if (!defenders) {
      this.mg.setWinner(ColoredTeams.Nations, this.mg.stats().stats());
      this.active = false;
      return;
    }
    const sinceStart = Math.round(this.mg.elapsedGameSeconds() * 10);
    if (survivalWaveState(sinceStart).wave < SURVIVAL_WAVES) return;
    const heldOut =
      sinceStart >= survivalWaveTick(SURVIVAL_WAVES) + SURVIVAL_HOLD_TICKS;
    const invaders = alive.some((p) => p.team() === ColoredTeams.Nations);
    const finalBoss = this.mg
      .survivalStatus()
      .bosses.find((b) => b.wave === SURVIVAL_WAVES);
    const boss =
      finalBoss === undefined
        ? null
        : this.mg.playerBySmallID(finalBoss.smallID);
    const finalBossDown = boss?.isPlayer() === true && !boss.isAlive();
    if (heldOut || !invaders || finalBossDown) {
      this.mg.setWinner(ColoredTeams.Humans, this.mg.stats().stats());
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
