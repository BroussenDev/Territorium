// Steam achievements, unlocked through the Steam app (window.openfrontDesktop
// .steam.unlockAchievement). Outside it, or in the demo (its own app, without
// achievements), nothing is sent. Their names and translations live in
// Steamworks; here only their API names and when they unlock.

import type { UserMeResponse } from "../core/ApiSchemas";
import { isDemo } from "./Demo";

export const ACHIEVEMENTS = {
  firstStep: "ACHIEVEMENT_First-step",
  firstWin: "ACHIEVEMENT_First-Win",
  builder: "ACHIEVEMENT_Builder",
  veteran: "ACHIEVEMENT_Veteran",
  conqueror: "ACHIEVEMENT_Conqueror",
  livingLegend: "ACHIEVEMENT_Living-Legend",
  sovereignNation: "ACHIEVEMENT_Sovereign-Nation",
  goalMaster: "ACHIEVEMENT_goal-master",
  duelist: "ACHIEVEMENT_duelist",
  brothersInArms: "ACHIEVEMENT_brother-in-arms",
  lastLineOfDefense: "ACHIEVEMENT_last-line-of-defense",
  firstRanking: "ACHIEVEMENT_first-ranking",
  podium: "ACHIEVEMENT_podium",
  peacemaker: "ACHIEVEMENT_peacemaker",
  warlord: "ACHIEVEMENT_warlord",
  unallied: "ACHIEVEMENT_unmarried",
  bloodBrothers: "ACHIEVEMENT_blood-brothers",
  pioneer: "ACHIEVEMENT_pioneer",
} as const;

export type AchievementId = (typeof ACHIEVEMENTS)[keyof typeof ACHIEVEMENTS];

/** Counts toward the "N wins / games / eliminations" achievements. */
export interface AchievementProgress {
  wins: number;
  rankedGames: number;
  eliminations: number;
  /** The last game counted, so a game whose end shows twice counts once. */
  lastGame: string | null;
  /** Whether that game already counted as a win. */
  lastWon: boolean;
}

// Synced between PCs by the Steam app's Steam Cloud settings (bridge.js).
export const PROGRESS_KEY = "achievementProgress";

const NO_PROGRESS: AchievementProgress = {
  wins: 0,
  rankedGames: 0,
  eliminations: 0,
  lastGame: null,
  lastWon: false,
};

function count(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : 0;
}

export function readProgress(): AchievementProgress {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null");
    if (raw === null || typeof raw !== "object") return { ...NO_PROGRESS };
    return {
      wins: count(raw.wins),
      rankedGames: count(raw.rankedGames),
      eliminations: count(raw.eliminations),
      lastGame: typeof raw.lastGame === "string" ? raw.lastGame : null,
      lastWon: raw.lastWon === true,
    };
  } catch {
    return { ...NO_PROGRESS };
  }
}

function writeProgress(progress: AchievementProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage full or blocked: the counts just don't keep.
  }
}

/** How a game ended, for the achievements it unlocks. */
export interface GameEnd {
  gameID: string;
  won: boolean;
  ranked: boolean;
  variant: "nations" | "training" | "versus" | "conquest" | "survival" | null;
  /** Humans on the player's team in Versus: 1 for a duel. */
  versusTeamSize: number;
  /** A team game (teams, Versus, Survival): teammates are not allies. */
  teamGame: boolean;
  /** Whether the player had an ally at any point of the game. */
  hadAlly: boolean;
}

/**
 * Counts a finished game into `progress` (once per game, however many times
 * its end shows) and returns the achievements it earns.
 */
export function achievementsForGameEnd(
  end: GameEnd,
  progress: AchievementProgress,
): AchievementId[] {
  const again = progress.lastGame === end.gameID;
  if (!again && end.ranked) progress.rankedGames++;
  const newWin = end.won && !(again && progress.lastWon);
  if (newWin) progress.wins++;
  progress.lastWon = end.won || (again && progress.lastWon);
  progress.lastGame = end.gameID;

  const out: AchievementId[] = [ACHIEVEMENTS.firstStep];
  if (progress.rankedGames >= 10) out.push(ACHIEVEMENTS.firstRanking);
  if (!end.won) return out;
  out.push(ACHIEVEMENTS.firstWin);
  if (progress.wins >= 10) out.push(ACHIEVEMENTS.veteran);
  if (progress.wins >= 50) out.push(ACHIEVEMENTS.conqueror);
  if (progress.wins >= 200) out.push(ACHIEVEMENTS.livingLegend);
  if (end.variant === "nations") out.push(ACHIEVEMENTS.sovereignNation);
  if (end.variant === "conquest") out.push(ACHIEVEMENTS.goalMaster);
  if (end.variant === "survival") out.push(ACHIEVEMENTS.lastLineOfDefense);
  if (end.variant === "versus") {
    out.push(
      end.versusTeamSize <= 1
        ? ACHIEVEMENTS.duelist
        : ACHIEVEMENTS.brothersInArms,
    );
  }
  if (end.ranked) out.push(ACHIEVEMENTS.podium);
  if (!end.hadAlly && !end.teamGame) {
    out.push(ACHIEVEMENTS.unallied);
  }
  return out;
}

/** Counts eliminations; returns Warlord once there are 50. */
export function achievementsForEliminations(
  added: number,
  progress: AchievementProgress,
): AchievementId[] {
  progress.eliminations += added;
  return progress.eliminations >= 50 ? [ACHIEVEMENTS.warlord] : [];
}

/** The account-side achievements: a clan, the Pioneer badge. */
export function achievementsForAccount(
  userMe: UserMeResponse | false,
): AchievementId[] {
  if (userMe === false) return [];
  const out: AchievementId[] = [];
  if ((userMe.player.clans?.length ?? 0) > 0) {
    out.push(ACHIEVEMENTS.bloodBrothers);
  }
  if (userMe.pioneer) out.push(ACHIEVEMENTS.pioneer);
  return out;
}

/** What the Steam app answers (main.rs steam_achievement). */
export interface AchievementUnlock {
  ok: boolean;
  /** Newly earned by this unlock. */
  unlocked: boolean;
  name?: string | null;
  description?: string | null;
  /** 64x64 RGBA pixels, base64. */
  icon?: string | null;
}

// Older apps answered a bare boolean.
type UnlockBridge = (name: string) => Promise<AchievementUnlock | boolean>;

function unlockBridge(): UnlockBridge | null {
  if (typeof window === "undefined" || isDemo()) return null;
  const d = (window as { openfrontDesktop?: unknown }).openfrontDesktop as
    | { steam?: { unlockAchievement?: unknown } }
    | undefined;
  const fn = d?.steam?.unlockAchievement;
  return typeof fn === "function" ? (fn as UnlockBridge) : null;
}

/** Whether achievements can unlock here (the Steam app, not the demo). */
export function achievementsAvailable(): boolean {
  return unlockBridge() !== null;
}

const sent = new Set<string>();

/** The Steam app's launch screens (bridge.js) are still up. */
function launchScreensShowing(): boolean {
  return (
    typeof document !== "undefined" &&
    document.getElementById("territorium-splash") !== null
  );
}

/** Unlocks each achievement once per session; Steam ignores repeats too. */
export function unlock(ids: readonly AchievementId[]): void {
  const bridge = unlockBridge();
  if (bridge === null) return;
  // Never during the Steam app's launch screens: Steam would play its
  // sound over them. Held until they are gone, then unlocked.
  if (launchScreensShowing()) {
    setTimeout(() => unlock(ids), 500);
    return;
  }
  for (const id of ids) {
    if (sent.has(id)) continue;
    sent.add(id);
    void bridge(id)
      .then((result) => {
        // Steam's overlay can't draw over the game's webview: the game shows
        // the notification itself (AchievementToast.ts).
        if (typeof result === "object" && result?.unlocked) {
          void import("./components/AchievementToast").then((m) =>
            m.showAchievementToast(result),
          );
        }
      })
      .catch(() => sent.delete(id));
  }
}

/** Counts a game's end and unlocks what it earned. */
export function recordGameEnd(end: GameEnd): void {
  if (!achievementsAvailable()) return;
  const progress = readProgress();
  const ids = achievementsForGameEnd(end, progress);
  writeProgress(progress);
  unlock(ids);
}

/** Counts eliminations by the player and unlocks Warlord at 50. */
export function recordEliminations(added: number): void {
  if (added <= 0 || !achievementsAvailable()) return;
  const progress = readProgress();
  const ids = achievementsForEliminations(added, progress);
  writeProgress(progress);
  unlock(ids);
}
