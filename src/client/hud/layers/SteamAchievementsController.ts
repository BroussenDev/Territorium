import { GameMode, PlayerType, UnitType } from "../../../core/game/Game";
import { GameUpdateType } from "../../../core/game/GameUpdates";
import { Controller } from "../../Controller";
import {
  ACHIEVEMENTS,
  achievementsAvailable,
  type GameEnd,
  recordEliminations,
  recordGameEnd,
  unlock,
} from "../../SteamAchievements";
import { GameView } from "../../view";

// The buildings whose level can reach 5 (Builder).
const UPGRADABLE = [
  UnitType.City,
  UnitType.Factory,
  UnitType.Port,
  UnitType.DefensePost,
  UnitType.MissileSilo,
  UnitType.SAMLauncher,
];

let onGameEnd: ((won: boolean) => void) | null = null;

/**
 * Follows the game for the Steam achievements: eliminations, peace treaties,
 * level-5 buildings and allies. Its end is reported by the win modal
 * (reportGameEnd), which knows the result.
 */
export class SteamAchievementsController implements Controller {
  private hadAlly = false;
  private ticks = 0;
  private active = false;

  constructor(private game: GameView) {}

  init() {
    onGameEnd = (won) => this.gameEnded(won);
    const config = this.game.config();
    const gc = config.gameConfig();
    // Replays and games with cheats earn nothing.
    this.active =
      achievementsAvailable() &&
      !config.isReplay() &&
      !gc.infiniteGold &&
      !gc.infiniteTroops &&
      !gc.instantBuild &&
      gc.hostCheats === undefined;
  }

  tick() {
    if (!this.active) return;
    const me = this.game.myPlayer();
    if (me === null) return;
    const updates = this.game.updatesSinceLastTick();
    const myId = me.id();
    const mySmall = me.smallID();
    const eliminations = (updates?.[GameUpdateType.ConquestEvent] ?? []).filter(
      (u) => u.conquerorId === myId,
    ).length;
    recordEliminations(eliminations);
    for (const u of updates?.[GameUpdateType.PeaceRequestReply] ?? []) {
      if (
        u.accepted &&
        (u.request.requestorID === mySmall || u.request.recipientID === mySmall)
      ) {
        unlock([ACHIEVEMENTS.peacemaker]);
      }
    }
    if (++this.ticks % 10 !== 0) return;
    if (me.allies().length > 0) this.hadAlly = true;
    if (me.units(...UPGRADABLE).some((u) => u.level() >= 5)) {
      unlock([ACHIEVEMENTS.builder]);
    }
  }

  gameEnded(won: boolean) {
    if (!this.active) return;
    const me = this.game.myPlayer();
    if (me === null || !me.hasSpawned()) return;
    const config = this.game.config();
    const gc = config.gameConfig();
    const team = me.team();
    const end: GameEnd = {
      gameID: this.game.gameID(),
      won,
      ranked: gc.rankedType !== undefined,
      variant: gc.gameVariant ?? null,
      versusTeamSize:
        team === null
          ? 1
          : this.game
              .players()
              .filter((p) => p.type() === PlayerType.Human && p.team() === team)
              .length,
      teamGame: gc.gameMode === GameMode.Team,
      hadAlly: this.hadAlly || me.allies().length > 0,
    };
    recordGameEnd(end);
  }
}

/** Reported by the win modal when the game's end shows (won or not). */
export function reportGameEnd(won: boolean): void {
  onGameEnd?.(won);
}
