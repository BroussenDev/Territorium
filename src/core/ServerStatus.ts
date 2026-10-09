import { z } from "zod";
import { PublicGameType, SCHEDULED_PUBLIC_GAME_TYPES } from "./Schemas";

// What the operators let players start (the admin panel's server page): game
// kinds closed one by one, and a maintenance that, once begun, stops every
// new game. Games already running always play to their end; a maintenance
// waits for them before the server is updated.

/** The kinds of game the admin can close. */
export const CLOSABLE_GAMES = [
  ...SCHEDULED_PUBLIC_GAME_TYPES,
  "private",
  "solo",
  "ranked",
] as const;

export const ClosableGameSchema = z.enum(CLOSABLE_GAMES);
export type ClosableGame = z.infer<typeof ClosableGameSchema>;

export const MaintenanceSchema = z.object({
  /** When new games stop (ms since epoch); announced until then. */
  startsAt: z.number().int().nonnegative(),
  /** When players can expect the game back, if known. */
  endsAt: z.number().int().nonnegative().optional(),
  /** Staff (admins, moderators) may still start games, to test an update. */
  staffCanPlay: z.boolean().optional(),
});
export type Maintenance = z.infer<typeof MaintenanceSchema>;

export const ServerStatusSchema = z.object({
  closed: z.array(ClosableGameSchema).max(CLOSABLE_GAMES.length),
  maintenance: MaintenanceSchema.nullable(),
});
export type ServerStatus = z.infer<typeof ServerStatusSchema>;

export const OPEN_SERVER_STATUS: ServerStatus = {
  closed: [],
  maintenance: null,
};

/** Whether the maintenance has begun: no new game of any kind. */
export function inMaintenance(status: ServerStatus, now: number): boolean {
  return status.maintenance !== null && now >= status.maintenance.startsAt;
}

/** Whether a maintenance is announced but not begun yet. */
export function maintenanceAhead(status: ServerStatus, now: number): boolean {
  return status.maintenance !== null && now < status.maintenance.startsAt;
}

/** Account roles (token claims) that count as staff. */
export const STAFF_ROLES = ["root", "admin", "mod"] as const;

export function isStaffRole(role: string | null | undefined): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role ?? "");
}

/**
 * Whether a player with this account role may start or join a new game of
 * this kind. In a maintenance that lets staff test, staff still may.
 */
export function acceptsNewGames(
  status: ServerStatus,
  game: ClosableGame,
  now: number,
  role?: string | null,
): boolean {
  if (status.closed.includes(game)) return false;
  if (!inMaintenance(status, now)) return true;
  return status.maintenance?.staffCanPlay === true && isStaffRole(role);
}

/** The closable kind a public lobby belongs to ("hosted" are private). */
export function closableOfLobby(type: PublicGameType): ClosableGame {
  return type === "hosted" ? "private" : type;
}
