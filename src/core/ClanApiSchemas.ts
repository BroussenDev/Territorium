import { z } from "zod";
import { ClanTagSchema } from "./Schemas";

const RequiredClanTagSchema = ClanTagSchema.unwrap();

// Response for the game-server endpoint listing every registered clan tag.
export const ReservedClanTagsResponseSchema = z.array(z.string());
export type ReservedClanTagsResponse = z.infer<
  typeof ReservedClanTagsResponseSchema
>;

export const ClanLeaderboardEntrySchema = z.object({
  clanTag: RequiredClanTagSchema,
  games: z.number(),
  wins: z.number(),
  losses: z.number(),
  playerSessions: z.number(),
  weightedWins: z.number(),
  weightedLosses: z.number(),
  weightedWLRatio: z.number(),
  // Optional: an API deploy predating crests and clan wars leaves them out.
  name: z.string().optional(),
  crest: z.string().nullable().optional(),
  warWins: z.number().optional(),
  warLosses: z.number().optional(),
});
export type ClanLeaderboardEntry = z.infer<typeof ClanLeaderboardEntrySchema>;

// The board of one season (the ranked mode's calendar months).
export const ClanSeasonSchema = z.object({
  number: z.number().int().positive(),
  endsAt: z.iso.datetime(),
});
export type ClanSeason = z.infer<typeof ClanSeasonSchema>;

export const ClanLeaderboardResponseSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  season: ClanSeasonSchema.optional(),
  currentSeason: z.number().int().positive().optional(),
  clans: ClanLeaderboardEntrySchema.array(),
  total: z.number().optional(),
  limit: z.number().optional(),
});
export type ClanLeaderboardResponse = z.infer<
  typeof ClanLeaderboardResponseSchema
>;

// Clan map: each game map is a territory held by the clan with the most
// lobby-weighted wins on it over the last 30 days. Unclaimed maps are absent.
export const ClanTerritoryContenderSchema = z.object({
  tag: RequiredClanTagSchema,
  name: z.string(),
  wins: z.number(),
  games: z.number(),
  score: z.number(),
});
export type ClanTerritoryContender = z.infer<
  typeof ClanTerritoryContenderSchema
>;

export const ClanMapResponseSchema = z.object({
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  territories: z
    .object({
      map: z.string(),
      holder: ClanTerritoryContenderSchema,
      contenders: ClanTerritoryContenderSchema.array(),
    })
    .array(),
  clans: z
    .object({
      tag: RequiredClanTagSchema,
      name: z.string(),
      territories: z.number(),
      score: z.number(),
    })
    .array(),
});
export type ClanMapResponse = z.infer<typeof ClanMapResponseSchema>;

export const ClanInfoSchema = z.object({
  name: z.string().max(35),
  tag: RequiredClanTagSchema,
  description: z.string().max(200),
  // Discord invite URL set by the clan leader; null when unset. Optional
  // because not every ClanInfo source includes it (e.g. browse results).
  discordUrl: z.string().max(255).nullable().optional(),
  // "shape:field:charge:symbol" (see ClanCrest.ts); null shows the default.
  crest: z.string().max(40).nullable().optional(),
  // Seasons the clan finished first on the clan board.
  titles: z.number().int().positive().array().optional(),
  isOpen: z.boolean(),
  createdAt: z.iso.datetime().optional(),
  memberCount: z.number().optional(),
  // Clan currency, public info (no membership gate). Decimal bigint strings
  // ("0" when empty, never a number) — they are int64 server-side and can
  // exceed Number.MAX_SAFE_INTEGER, so compare and sum with BigInt, never
  // Number. Optional because not every ClanInfo source carries them (the PATCH
  // response, an API deploy predating the field) — absent means "unknown",
  // which the UI hides rather than rendering as zero.
  softBalance: z.string().optional(),
  hardBalance: z.string().optional(),
  // Clan packs the clan bought with its treasury; every member wears them.
  packs: z
    .object({
      name: z.string(),
      price: z.string(),
      boughtBy: z.string().nullable(),
      boughtByUsername: z.string().nullable().optional(),
      boughtAt: z.iso.datetime(),
    })
    .array()
    .optional(),
});
export type ClanInfo = z.infer<typeof ClanInfoSchema>;

// Client-assembled view model for the clan Discord card. `valid` is false only
// on a definitive Discord 404 (invite revoked); other failures degrade to the
// plain link with valid: true.
export type ClanDiscord = {
  url: string;
  valid: boolean;
  serverName?: string;
  iconUrl?: string | null;
  bannerUrl?: string | null;
  description?: string | null;
  onlineCount?: number | null;
  memberCount?: number | null;
};

// Subset of Discord's public GET /invites/{code}?with_counts=true response,
// parsed client-side into ClanDiscord. snake_case mirrors Discord's wire format.
export const DiscordInviteResponseSchema = z.object({
  guild: z
    .object({
      id: z.string(),
      name: z.string(),
      icon: z.string().nullable().optional(),
      banner: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
    })
    .optional(),
  approximate_member_count: z.number().optional(),
  approximate_presence_count: z.number().optional(),
});

export const ClanBrowseResponseSchema = z.object({
  results: ClanInfoSchema.array(),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});
export type ClanBrowseResponse = z.infer<typeof ClanBrowseResponseSchema>;

export const ClanMemberWLSchema = z.object({
  wins: z.number(),
  losses: z.number(),
});
export type ClanMemberWL = z.infer<typeof ClanMemberWLSchema>;

export const ClanMemberStatsSchema = z.object({
  total: ClanMemberWLSchema,
  ffa: ClanMemberWLSchema,
  team: ClanMemberWLSchema,
  hvn: ClanMemberWLSchema,
  duos: ClanMemberWLSchema,
  trios: ClanMemberWLSchema,
  quads: ClanMemberWLSchema,
  "2": ClanMemberWLSchema,
  "3": ClanMemberWLSchema,
  "4": ClanMemberWLSchema,
  "5": ClanMemberWLSchema,
  "6": ClanMemberWLSchema,
  "7": ClanMemberWLSchema,
  ranked: ClanMemberWLSchema,
  "1v1": ClanMemberWLSchema,
});
export type ClanMemberStats = z.infer<typeof ClanMemberStatsSchema>;

export const TEAM_BREAKDOWN_KEYS = [
  "duos",
  "trios",
  "quads",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
] as const satisfies readonly (keyof ClanMemberStats)[];

export const RANKED_BREAKDOWN_KEYS = [
  "1v1",
] as const satisfies readonly (keyof ClanMemberStats)[];

export const ClanMemberSchema = z.object({
  role: z.enum(["leader", "officer", "member"]),
  joinedAt: z.iso.datetime(),
  publicId: z.string(),
  // Account username, pre-rendered by the server (null = never set). Render
  // `username ?? publicId`; identify players by publicId only. Optional so
  // responses from an API without the field still parse.
  username: z.string().nullable().optional(),
  stats: ClanMemberStatsSchema.optional(),
});
export type ClanMember = z.infer<typeof ClanMemberSchema>;

export const ClanMembersResponseSchema = z.object({
  results: ClanMemberSchema.array(),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  pendingRequests: z.number().optional(),
});
export type ClanMembersResponse = z.infer<typeof ClanMembersResponseSchema>;

export const ClanJoinRequestSchema = z.object({
  publicId: z.string(),
  // Requester's account username (null = never set).
  username: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
});
export type ClanJoinRequest = z.infer<typeof ClanJoinRequestSchema>;

export const ClanRequestsResponseSchema = z.object({
  results: ClanJoinRequestSchema.array(),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});
export type ClanRequestsResponse = z.infer<typeof ClanRequestsResponseSchema>;

export const ClanBanSchema = z.object({
  publicId: z.string(),
  // Banned player's account username (null = never set).
  username: z.string().nullable().optional(),
  bannedBy: z.string(),
  // Account username of the officer who issued the ban.
  bannedByUsername: z.string().nullable().optional(),
  reason: z.string().max(200).nullable(),
  createdAt: z.iso.datetime(),
});
export type ClanBan = z.infer<typeof ClanBanSchema>;

export const ClanBansResponseSchema = z.object({
  results: ClanBanSchema.array(),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});
export type ClanBansResponse = z.infer<typeof ClanBansResponseSchema>;

export const JoinClanResponseSchema = z.object({
  status: z.enum(["joined", "requested"]),
});
export type JoinClanResponse = z.infer<typeof JoinClanResponseSchema>;

export const ClanGamePlayerSchema = z.object({
  publicId: z.string(),
  // The name the player actually used in that game (the in-lobby name). This
  // is what the history displays.
  username: z.string(),
  // Whether the player joined that game under their verified account name
  // (recorded per session at ingest, server-validated at join). Drives the
  // verified check. Optional so older API responses still parse (→ no badge).
  verified: z.boolean().optional(),
  won: z.boolean(),
});
export type ClanGamePlayer = z.infer<typeof ClanGamePlayerSchema>;

// "incomplete" covers games with no recorded winner.
// The server stamps this when winnerType IS NULL,
// so we have to accept it on the wire even if the UI collapses it back
// into the defeat-styled badge.
export const ClanGameResultSchema = z.enum(["victory", "defeat", "incomplete"]);
export type ClanGameResult = z.infer<typeof ClanGameResultSchema>;

export const ClanGameFilters = ["ffa", "team", "hvn", "ranked"] as const;
export const ClanGameFilterSchema = z.enum(ClanGameFilters);
export type ClanGameFilter = z.infer<typeof ClanGameFilterSchema>;

export const ClanGameSchema = z.object({
  gameId: z.string(),
  start: z.iso.datetime(),
  durationSeconds: z.number().int().nonnegative(),
  map: z.string().trim().optional(),
  mode: z.string().optional(),
  // playerTeams is `null` (not absent) for FFA / non-team games — use
  // `.nullish()` so the wire `null` doesn't fail the parse.
  playerTeams: z.string().nullish(),
  rankedType: z.string().optional(),
  result: ClanGameResultSchema.optional(),
  // Mirrors games.num_players nullability — historical rows may not
  // carry a value. Use `.nullish()` so wire `null` parses cleanly.
  totalPlayers: z.number().int().nonnegative().nullish(),
  clanPlayers: ClanGamePlayerSchema.array(),
});
export type ClanGame = z.infer<typeof ClanGameSchema>;

export const ClanGamesResponseSchema = z.object({
  results: ClanGameSchema.array(),
  // Opaque continuation token. Round-trip verbatim as the `cursor` query
  // parameter to fetch the next page; never construct or parse it.
  // `null` means the server has no more rows to serve. Page size is
  // fixed server-side, so the client never sends a limit.
  nextCursor: z.string().nullable(),
});
export type ClanGamesResponse = z.infer<typeof ClanGamesResponseSchema>;

// One row of a clan's donation ledger (GET /clans/:tag/donations). Only player
// donations are listed — the clan's win-share cut, admin adjustments and refund
// reversals are separate ledger reasons the endpoint excludes — so summing
// `amount` is not the clan balance; use ClanInfo.softBalance/hardBalance.
export const ClanDonationSchema = z.object({
  // Ledger row id, a bigint serialized as a decimal string.
  id: z.string(),
  currencyType: z.enum(["soft", "hard"]),
  // Positive integer as a decimal bigint string; parse with BigInt, never
  // Number (same reasoning as ClanInfoSchema's balances).
  amount: z.string(),
  reason: z.string(),
  note: z.string().nullable().optional(),
  // Donor's public ID; null when the account has since been deleted.
  createdBy: z.string().nullable(),
  // Donor's display username; null when deleted or never set.
  createdByUsername: z.string().nullable().optional(),
  createdAt: z.iso.datetime(),
});
export type ClanDonation = z.infer<typeof ClanDonationSchema>;

export const ClanDonationsResponseSchema = z.object({
  results: ClanDonationSchema.array(),
  // Donations matching the currency filter, not just this page.
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});
export type ClanDonationsResponse = z.infer<typeof ClanDonationsResponseSchema>;

// Clan wars: one clan's officers challenge another's; once accepted, the next
// private team game between the two clans settles it.
export const ClanWarStatusSchema = z.enum([
  "pending",
  "accepted",
  "declined",
  "cancelled",
  "expired",
  "done",
]);
export type ClanWarStatus = z.infer<typeof ClanWarStatusSchema>;

export const ClanWarSideSchema = z.object({
  tag: RequiredClanTagSchema,
  name: z.string(),
  crest: z.string().nullable(),
});

export const ClanWarSchema = z.object({
  id: z.number().int(),
  challenger: ClanWarSideSchema,
  defender: ClanWarSideSchema,
  status: ClanWarStatusSchema,
  createdAt: z.iso.datetime(),
  answeredAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  endedAt: z.iso.datetime().nullable(),
  winner: RequiredClanTagSchema.nullable(),
  gameId: z.string().nullable(),
});
export type ClanWar = z.infer<typeof ClanWarSchema>;

export const ClanWarsResponseSchema = z.object({
  season: ClanSeasonSchema,
  wins: z.number(),
  losses: z.number(),
  wars: ClanWarSchema.array(),
});
export type ClanWarsResponse = z.infer<typeof ClanWarsResponseSchema>;
