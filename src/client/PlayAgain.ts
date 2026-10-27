// "Play again" from the end-of-game screen: back to the menu, then straight
// into the next lobby of the mode just played, without a click in between.
// The game itself doesn't know which public lobby list it came from, so the
// join remembers it for the session.

import { PublicGameType, PublicGameTypeSchema } from "../core/Schemas";

/** Where "play again" leads: a public lobby type, or a new solo game. */
export type PlayAgainTarget = PublicGameType | "solo";

const JOINED_KEY = "territorium.joinedPublicGame";
const PENDING_KEY = "territorium.playAgain";

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Remembers which lobby list a public game was joined from. */
export function rememberPublicJoin(gameID: string, type: PublicGameType): void {
  try {
    storage()?.setItem(JOINED_KEY, JSON.stringify({ gameID, type }));
  } catch {
    // Storage blocked: "play again" falls back to the menu.
  }
}

/** The lobby list this game was joined from, if it was a public one. */
export function joinedPublicType(gameID: string): PublicGameType | null {
  try {
    const raw = storage()?.getItem(JOINED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { gameID?: unknown; type?: unknown };
    if (parsed.gameID !== gameID) return null;
    const type = PublicGameTypeSchema.safeParse(parsed.type);
    // A hosted lobby has no "next one" to join.
    return type.success && type.data !== "hosted" ? type.data : null;
  } catch {
    return null;
  }
}

/** Asks the menu, once it has loaded, to join the next game of this kind. */
export function requestPlayAgain(target: PlayAgainTarget): void {
  try {
    storage()?.setItem(PENDING_KEY, target);
  } catch {
    // Nothing pending: the player lands on the menu.
  }
}

/** The pending "play again", read once. */
export function consumePlayAgain(): PlayAgainTarget | null {
  try {
    const s = storage();
    const raw = s?.getItem(PENDING_KEY) ?? null;
    if (raw === null) return null;
    s?.removeItem(PENDING_KEY);
    if (raw === "solo") return "solo";
    const type = PublicGameTypeSchema.safeParse(raw);
    return type.success ? type.data : null;
  } catch {
    return null;
  }
}
