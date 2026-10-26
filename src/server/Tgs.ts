import type { AllPlayersStats, ClientID } from "../core/Schemas";

/**
 * TGS (Territorium Game Shield): the game server's integrity watch.
 *
 * TGS never bans. It only watches what reaches the server and, in the two
 * cases below, disconnects a player from the match; every disconnection is
 * an incident the staff reviews in the admin panel, where the sanctions are
 * decided by people. Out-of-range intents need nothing from TGS: the
 * simulation runs identically on every client, which all drop an impossible
 * intent the same way, and the per-second limit of ClientMsgRateLimiter
 * already silently drops intents past 10 a second.
 *
 *   TGS-101: more than floodPerSecond intents a second, for more than
 *            floodSeconds seconds in a row. The player is removed from the
 *            match (kickClient).
 *   TGS-102: the player's simulation disagrees with the other players' for
 *            desyncChecks checks in a row while the majority agrees. The
 *            socket is closed but the player may rejoin, which replays the
 *            game from the start and puts them back in step.
 *
 *   TGS-103: suspected cross-teaming. At the end of a free-for-all match,
 *            two players who shared a border for a long time without ever
 *            attacking each other (crossTeam*Minutes, shorter for players
 *            of the same clan). Nobody is disconnected and nothing is
 *            forbidden: playing alongside one's clan is allowed. It is only
 *            put in front of the staff, with the time spent as allies, for
 *            a look at the replay.
 *
 * Along the way TGS leaves markers on the match's timeline (a burst above
 * spikePerSecond, each desync) for the replay review. The whole watch can
 * be switched off from the admin panel (TgsSwitch); off, nothing is
 * observed, marked or disconnected.
 *
 * The thresholds (TgsSettings) are set in the admin panel and sent by the
 * API with the switch, so the ones in force are never in this public code:
 * DEFAULT_TGS_SETTINGS only stands in until the API first answers.
 */

export const TGS_FLOOD_CODE = "TGS-101";
export const TGS_DESYNC_CODE = "TGS-102";
export const TGS_CROSS_TEAM_CODE = "TGS-103";
/** A hateful or threatening chat line, removed live (ChatModeration.ts). */
export const TGS_CHAT_CODE = "TGS-110";
/** The codes that disconnect a player. */
export type TgsKickCode = typeof TGS_FLOOD_CODE | typeof TGS_DESYNC_CODE;
export type TgsCode =
  | TgsKickCode
  | typeof TGS_CROSS_TEAM_CODE
  | typeof TGS_CHAT_CODE;

/** Translation keys of the message a disconnected player reads. */
export const TGS_KICK_REASONS: Record<TgsKickCode, string> = {
  [TGS_FLOOD_CODE]: "kick_reason.tgs_101",
  [TGS_DESYNC_CODE]: "kick_reason.tgs_102",
};

/** TGS's thresholds, set in the admin panel. */
export interface TgsSettings {
  /** TGS-101: a burst worth a marker, and a flood that disconnects. */
  spikePerSecond: number;
  floodPerSecond: number;
  floodSeconds: number;
  /** TGS-102: desync checks in a row before a disconnection. */
  desyncChecks: number;
  /**
   * TGS-103: minutes two players must share a border without a single
   * attack between them, for players of the same clan and for any two.
   */
  crossTeamSameClanMinutes: number;
  crossTeamAnyoneMinutes: number;
  /** TGS-104: gifts to the same rival that cancel a ranked game. */
  rankedGifts: number;
  /**
   * TGS-105: commands looked at for the rhythm, the minutes they may spread
   * over, and the variation of their gaps under which no human plays.
   */
  rhythmWindow: number;
  rhythmMinMinutes: number;
  rhythmMaxMinutes: number;
  rhythmMaxVariation: number;
}

/** Used until the API sends the admin panel's values. */
export const DEFAULT_TGS_SETTINGS: Readonly<TgsSettings> = {
  spikePerSecond: 15,
  floodPerSecond: 35,
  floodSeconds: 2,
  desyncChecks: 3,
  crossTeamSameClanMinutes: 8,
  crossTeamAnyoneMinutes: 15,
  rankedGifts: 3,
  rhythmWindow: 120,
  rhythmMinMinutes: 2,
  rhythmMaxMinutes: 6,
  rhythmMaxVariation: 0.08,
};

/** The range each threshold must stay in; a value outside it is ignored. */
export const TGS_SETTING_LIMITS: Record<keyof TgsSettings, [number, number]> = {
  spikePerSecond: [5, 100],
  floodPerSecond: [10, 200],
  floodSeconds: [1, 30],
  desyncChecks: [1, 20],
  crossTeamSameClanMinutes: [1, 120],
  crossTeamAnyoneMinutes: [1, 120],
  rankedGifts: [1, 50],
  rhythmWindow: [20, 1000],
  rhythmMinMinutes: [1, 60],
  rhythmMaxMinutes: [1, 120],
  rhythmMaxVariation: [0.001, 0.5],
};

/**
 * The admin panel's thresholds as the API sent them, each one checked
 * against its range; anything missing or out of range keeps `base`.
 */
export function parseTgsSettings(
  raw: unknown,
  base: Readonly<TgsSettings> = DEFAULT_TGS_SETTINGS,
): TgsSettings {
  const out = { ...base };
  if (typeof raw !== "object" || raw === null) return out;
  const given = raw as Record<string, unknown>;
  for (const key of Object.keys(TGS_SETTING_LIMITS) as (keyof TgsSettings)[]) {
    const value = given[key];
    const [min, max] = TGS_SETTING_LIMITS[key];
    if (typeof value === "number" && value >= min && value <= max) {
      out[key] = value;
    }
  }
  if (out.rhythmMaxMinutes < out.rhythmMinMinutes) {
    out.rhythmMaxMinutes = out.rhythmMinMinutes;
  }
  return out;
}

const TICKS_PER_MINUTE = 600;

/** A player of the match, as TGS-103 needs them. */
export interface TgsPlayer {
  clientID: ClientID;
  username: string;
  clanTag: string | null;
}

/** A pair of players TGS-103 puts in front of the staff. */
export interface CrossTeamSuspicion {
  a: ClientID;
  b: ClientID;
  sameClan: boolean;
  minutes: number;
  alliedMinutes: number;
}

/**
 * The pairs of a free-for-all match that look like cross-teaming, longest
 * first: neighbours for at least crossTeam*Minutes with no attack between
 * them. Read from the end-of-match stats, which the players' simulations
 * agreed on by majority (the winner vote), never from a single client.
 */
export function crossTeamSuspicions(
  players: readonly TgsPlayer[],
  stats: AllPlayersStats,
  settings: Readonly<TgsSettings> = DEFAULT_TGS_SETTINGS,
): CrossTeamSuspicion[] {
  const byID = new Map(players.map((p) => [p.clientID, p]));
  const found: CrossTeamSuspicion[] = [];
  for (const player of players) {
    for (const n of stats[player.clientID]?.neighbors ?? []) {
      // Each pair once, from its lower client ID.
      if (n.client <= player.clientID) continue;
      const other = byID.get(n.client);
      if (other === undefined || n.attacks > 0) continue;
      const sameClan =
        player.clanTag !== null &&
        player.clanTag.toUpperCase() === other.clanTag?.toUpperCase();
      const minutes = Math.floor(n.ticks / TICKS_PER_MINUTE);
      const needed = sameClan
        ? settings.crossTeamSameClanMinutes
        : settings.crossTeamAnyoneMinutes;
      if (minutes < needed) continue;
      found.push({
        a: player.clientID,
        b: other.clientID,
        sameClan,
        minutes,
        alliedMinutes: Math.floor(n.allied / TICKS_PER_MINUTE),
      });
    }
  }
  return found.sort((x, y) => y.minutes - x.minutes);
}

export type TgsAnomaly = "TGS_MACRO_SPIKE" | "TGS_DESYNC";

/** A point of a match's timeline the staff may want to look at. */
export interface TgsMarker {
  turn: number;
  clientID: ClientID;
  anomaly: TgsAnomaly;
  value: number;
}

/** A disconnection by TGS. */
export interface TgsIncident {
  clientID: ClientID;
  code: TgsCode;
  turn: number;
  details: string;
}

/** What a match hands the API with its record (info.tgs). */
export interface TgsReport {
  markers: TgsMarker[];
  incidents: TgsIncident[];
  /**
   * Players of the match who played from the same network (same IP): the
   * API weighs them as possible second accounts (TGS-106). Only the client
   * IDs leave the server, never an address.
   */
  sameNetwork?: ClientID[][];
  /** A ranked game TGS cancelled while it was played (TgsRanked.ts). */
  cancelled?: {
    code: "TGS-104" | "TGS-105" | "TGS-106";
    cheaters: ClientID[];
    turn: number;
    details: string;
  };
}

/** Most same-network groups and players per group kept in a record. */
const MAX_NETWORK_GROUPS = 50;
const MAX_NETWORK_GROUP = 16;

/**
 * The groups of at least two players of the match who shared an IP, read
 * from every client that joined. Addresses stay here: only client IDs go
 * out.
 */
export function sameNetworkGroups(
  clients: readonly { clientID: ClientID; ip: string }[],
  players: ReadonlySet<ClientID>,
): ClientID[][] {
  const byIP = new Map<string, Set<ClientID>>();
  for (const c of clients) {
    if (!players.has(c.clientID) || c.ip === "") continue;
    let group = byIP.get(c.ip);
    if (group === undefined) byIP.set(c.ip, (group = new Set()));
    group.add(c.clientID);
  }
  return [...byIP.values()]
    .filter((g) => g.size >= 2)
    .map((g) => [...g].sort().slice(0, MAX_NETWORK_GROUP))
    .slice(0, MAX_NETWORK_GROUPS);
}

/**
 * The admin panel's 1-click switch and thresholds, as this worker last
 * heard them from the API (TgsStatusPoller). On until told otherwise.
 */
export class TgsSwitch {
  private enabled = true;
  private current: TgsSettings = { ...DEFAULT_TGS_SETTINGS };

  isEnabled(): boolean {
    return this.enabled;
  }

  set(enabled: boolean): void {
    this.enabled = enabled;
  }

  settings(): Readonly<TgsSettings> {
    return this.current;
  }

  /** The API's thresholds; invalid ones keep their current value. */
  setSettings(raw: unknown): void {
    this.current = parseTgsSettings(raw, this.current);
  }
}

/** What a watch reads of the switch. */
export type TgsControls = Pick<TgsSwitch, "isEnabled" | "settings">;

export const tgsSwitch = new TgsSwitch();

// Markers kept per match: a flooding client could otherwise grow the record.
const MAX_MARKERS = 500;

interface RateWindow {
  second: number;
  count: number;
  // Consecutive past seconds above floodPerSecond.
  floodSeconds: number;
}

/** One match's TGS watch. */
export class TgsMonitor {
  private readonly rates = new Map<ClientID, RateWindow>();
  private readonly desyncStreaks = new Map<ClientID, number>();
  private readonly markers: TgsMarker[] = [];
  private readonly incidents: TgsIncident[] = [];
  private sameNetwork: ClientID[][] = [];
  private cancelled: TgsReport["cancelled"];

  constructor(
    private readonly switch_: TgsControls = tgsSwitch,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Called for every intent a player sends, before any limit drops it.
   * Returns the code to disconnect them with, or null.
   */
  observeIntent(clientID: ClientID, turn: number): TgsKickCode | null {
    if (!this.switch_.isEnabled()) return null;
    const { spikePerSecond, floodPerSecond, floodSeconds } =
      this.switch_.settings();
    const second = Math.floor(this.now() / 1000);
    let w = this.rates.get(clientID);
    if (w === undefined) {
      w = { second, count: 0, floodSeconds: 0 };
      this.rates.set(clientID, w);
    }
    if (second !== w.second) {
      // The second that just ended: marked when it was a burst, and counted
      // toward a flood only if it was one and this second follows it.
      if (w.count > spikePerSecond) {
        this.mark({
          turn,
          clientID,
          anomaly: "TGS_MACRO_SPIKE",
          value: w.count,
        });
      }
      const flooded = w.count > floodPerSecond && second === w.second + 1;
      w.floodSeconds = flooded ? w.floodSeconds + 1 : 0;
      w.second = second;
      w.count = 0;
    }
    w.count++;
    // More than floodSeconds whole seconds of flood, and the current one
    // flooding too.
    if (w.floodSeconds >= floodSeconds && w.count > floodPerSecond) {
      this.mark({ turn, clientID, anomaly: "TGS_MACRO_SPIKE", value: w.count });
      return this.incident(
        clientID,
        TGS_FLOOD_CODE,
        turn,
        `${w.count} intents/s after ${w.floodSeconds} s above ${floodPerSecond}/s`,
      );
    }
    return null;
  }

  /**
   * Called with each desync check's verdict. Returns the clients to
   * disconnect: those out of step desyncChecks checks in a row while most
   * players agree (when most disagree, the fault is nobody's in particular
   * and nobody is disconnected).
   */
  observeDesync(
    turn: number,
    activeClients: readonly ClientID[],
    outOfSync: readonly ClientID[],
  ): ClientID[] {
    if (!this.switch_.isEnabled()) return [];
    const { desyncChecks } = this.switch_.settings();
    const minority = outOfSync.length * 2 < activeClients.length;
    const out = new Set(outOfSync);
    const toDisconnect: ClientID[] = [];
    for (const id of activeClients) {
      if (!out.has(id) || !minority) {
        this.desyncStreaks.delete(id);
        continue;
      }
      const streak = (this.desyncStreaks.get(id) ?? 0) + 1;
      this.desyncStreaks.set(id, streak);
      this.mark({ turn, clientID: id, anomaly: "TGS_DESYNC", value: streak });
      if (streak >= desyncChecks) {
        this.desyncStreaks.delete(id);
        this.incident(
          id,
          TGS_DESYNC_CODE,
          turn,
          `out of step with the other players for ${streak} checks in a row`,
        );
        toDisconnect.push(id);
      }
    }
    return toDisconnect;
  }

  /**
   * TGS-103, at the end of a free-for-all match: one incident per player
   * found in a suspicious pair, naming each partner. Disconnects nobody.
   */
  observeCrossTeaming(
    players: readonly TgsPlayer[],
    stats: AllPlayersStats,
    turn: number,
  ): void {
    if (!this.switch_.isEnabled()) return;
    const names = new Map(players.map((p) => [p.clientID, p]));
    const partners = new Map<ClientID, string[]>();
    for (const s of crossTeamSuspicions(
      players,
      stats,
      this.switch_.settings(),
    )) {
      for (const [self, other] of [
        [s.a, s.b],
        [s.b, s.a],
      ] as const) {
        const p = names.get(other)!;
        const tag = p.clanTag ? ` [${p.clanTag}]` : "";
        const allied =
          s.alliedMinutes > 0 ? `, ${s.alliedMinutes} as allies` : "";
        const clan = s.sameClan ? ", same clan" : "";
        const list = partners.get(self) ?? [];
        list.push(
          `${p.username}${tag}: ${s.minutes} min as neighbours, no attack${allied}${clan}`,
        );
        partners.set(self, list);
      }
    }
    for (const [clientID, list] of partners) {
      this.incidents.push({
        clientID,
        code: TGS_CROSS_TEAM_CODE,
        turn,
        details: list.join("; ").slice(0, 200),
      });
    }
  }

  /** The last incident recorded, for its immediate report to the API. */
  lastIncident(): TgsIncident | undefined {
    return this.incidents[this.incidents.length - 1];
  }

  /** What goes into the archived record, or undefined when nothing happened. */
  report(): TgsReport | undefined {
    if (
      this.markers.length === 0 &&
      this.incidents.length === 0 &&
      this.sameNetwork.length === 0 &&
      this.cancelled === undefined
    )
      return undefined;
    return {
      markers: [...this.markers],
      incidents: [...this.incidents],
      ...(this.sameNetwork.length ? { sameNetwork: this.sameNetwork } : {}),
      ...(this.cancelled ? { cancelled: this.cancelled } : {}),
    };
  }

  /** A chat line TGS removed (TGS-110): an incident, nobody disconnected. */
  observeChat(clientID: ClientID, turn: number, details: string): TgsIncident {
    const incident: TgsIncident = {
      clientID,
      code: TGS_CHAT_CODE,
      turn,
      details: details.slice(0, 200),
    };
    if (this.incidents.length < 200) this.incidents.push(incident);
    return incident;
  }

  /** A ranked game cancelled live: it goes with the record. */
  observeRankedCancel(cancelled: NonNullable<TgsReport["cancelled"]>): void {
    this.cancelled = cancelled;
  }

  /** At the end of the match: who played from the same network. */
  observeSameNetwork(groups: ClientID[][]): void {
    if (!this.switch_.isEnabled()) return;
    this.sameNetwork = groups;
  }

  private mark(marker: TgsMarker): void {
    if (this.markers.length < MAX_MARKERS) this.markers.push(marker);
  }

  private incident(
    clientID: ClientID,
    code: TgsKickCode,
    turn: number,
    details: string,
  ): TgsKickCode {
    this.incidents.push({ clientID, code, turn, details });
    this.rates.delete(clientID);
    return code;
  }
}
