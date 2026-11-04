// Rivalries: the registered player a signed-in player meets most often. The
// API names the rival; this module finds them in a running game and decides
// how the game ended between the two. No other client sees an account id, so
// the match is by the name the rival plays under.

export interface Rival {
  publicId: string;
  name: string;
  gamesTogether: number;
  yourWins: number;
  theirWins: number;
}

/** What a player in the game exposes of themselves, as PlayerView does. */
export interface RivalCandidate {
  name(): string;
  clientID(): string | null;
}

/** How the finished game went between the player and their rival. */
export type RivalOutcome = "victory" | "defeat" | null;

const normalise = (name: string): string => name.trim().toLowerCase();

/**
 * The rival among the game's players, or null when absent. The rival's name
 * can carry the account discriminator ("Name.1234") while the game shows the
 * bare name, so both forms are tried. The player themself never matches.
 */
export function findRivalPlayer<T extends RivalCandidate>(
  rival: Pick<Rival, "name">,
  players: readonly T[],
  myClientID: string | null,
): T | null {
  const full = normalise(rival.name);
  if (full === "") return null;
  const dot = full.lastIndexOf(".");
  const bare =
    dot > 0 && /^\d{4}$/.test(full.slice(dot + 1)) ? full.slice(0, dot) : full;
  for (const p of players) {
    if (myClientID !== null && p.clientID() === myClientID) continue;
    const n = normalise(p.name());
    if (n === full || n === bare) return p;
  }
  return null;
}

/**
 * Victory when the player won and their rival did not, defeat the other way
 * round; null when both won (same team) or neither did (a third party won,
 * or no winner).
 */
export function rivalOutcome(iWon: boolean, rivalWon: boolean): RivalOutcome {
  if (iWon && !rivalWon) return "victory";
  if (!iWon && rivalWon) return "defeat";
  return null;
}

/** The rival met in the game being played, kept for the end screen. */
export interface RivalPresence {
  gameID: string;
  rival: Rival;
  clientID: string;
}

let presence: RivalPresence | null = null;

export function setRivalPresence(value: RivalPresence | null): void {
  presence = value;
}

export function getRivalPresence(gameID: string): RivalPresence | null {
  return presence !== null && presence.gameID === gameID ? presence : null;
}
