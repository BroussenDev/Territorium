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
 *   TGS-101: more than FLOOD_PER_SECOND intents a second, for more than
 *            FLOOD_SECONDS seconds in a row. The player is removed from the
 *            match (kickClient).
 *   TGS-102: the player's simulation disagrees with the other players' for
 *            DESYNC_CHECKS checks in a row while the majority agrees. The
 *            socket is closed but the player may rejoin, which replays the
 *            game from the start and puts them back in step.
 *
 *   TGS-103: suspected cross-teaming. At the end of a free-for-all match,
 *            two players who shared a border for a long time without ever
 *            attacking each other (CROSS_TEAM_MINUTES, shorter for players
 *            of the same clan). Nobody is disconnected and nothing is
 *            forbidden: playing alongside one's clan is allowed. It is only
 *            put in front of the staff, with the time spent as allies, for
 *            a look at the replay.
 *
 * Along the way TGS leaves markers on the match's timeline (a burst above
 * SPIKE_PER_SECOND, each desync) for the replay review. The whole watch can
 * be switched off from the admin panel (TgsSwitch); off, nothing is
 * observed, marked or disconnected.
 */

export const TGS_FLOOD_CODE = "TGS-101";
export const TGS_DESYNC_CODE = "TGS-102";
export const TGS_CROSS_TEAM_CODE = "TGS-103";
/** The codes that disconnect a player. */
export type TgsKickCode = typeof TGS_FLOOD_CODE | typeof TGS_DESYNC_CODE;
export type TgsCode = TgsKickCode | typeof TGS_CROSS_TEAM_CODE;

/** Translation keys of the message a disconnected player reads. */
export const TGS_KICK_REASONS: Record<TgsKickCode, string> = {
  [TGS_FLOOD_CODE]: "kick_reason.tgs_101",
  [TGS_DESYNC_CODE]: "kick_reason.tgs_102",
};

export const SPIKE_PER_SECOND = 15;
export const FLOOD_PER_SECOND = 35;
export const FLOOD_SECONDS = 2;
export const DESYNC_CHECKS = 3;
/**
 * TGS-103: minutes two players must share a border without a single attack
 * between them, for players of the same clan and for any two players.
 */
export const CROSS_TEAM_MINUTES = { sameClan: 8, anyone: 15 };
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
 * first: neighbours for at least CROSS_TEAM_MINUTES with no attack between
 * them. Read from the end-of-match stats, which the players' simulations
 * agreed on by majority (the winner vote), never from a single client.
 */
export function crossTeamSuspicions(
  players: readonly TgsPlayer[],
  stats: AllPlayersStats,
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
        ? CROSS_TEAM_MINUTES.sameClan
        : CROSS_TEAM_MINUTES.anyone;
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
 * The admin panel's 1-click switch, as this worker last heard it from the
 * API (TgsStatusPoller). On until told otherwise.
 */
export class TgsSwitch {
  private enabled = true;

  isEnabled(): boolean {
    return this.enabled;
  }

  set(enabled: boolean): void {
    this.enabled = enabled;
  }
}

export const tgsSwitch = new TgsSwitch();

// Markers kept per match: a flooding client could otherwise grow the record.
const MAX_MARKERS = 500;

interface RateWindow {
  second: number;
  count: number;
  // Consecutive past seconds above FLOOD_PER_SECOND.
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
    private readonly switch_: Pick<TgsSwitch, "isEnabled"> = tgsSwitch,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Called for every intent a player sends, before any limit drops it.
   * Returns the code to disconnect them with, or null.
   */
  observeIntent(clientID: ClientID, turn: number): TgsKickCode | null {
    if (!this.switch_.isEnabled()) return null;
    const second = Math.floor(this.now() / 1000);
    let w = this.rates.get(clientID);
    if (w === undefined) {
      w = { second, count: 0, floodSeconds: 0 };
      this.rates.set(clientID, w);
    }
    if (second !== w.second) {
      // The second that just ended: marked when it was a burst, and counted
      // toward a flood only if it was one and this second follows it.
      if (w.count > SPIKE_PER_SECOND) {
        this.mark({
          turn,
          clientID,
          anomaly: "TGS_MACRO_SPIKE",
          value: w.count,
        });
      }
      const flooded = w.count > FLOOD_PER_SECOND && second === w.second + 1;
      w.floodSeconds = flooded ? w.floodSeconds + 1 : 0;
      w.second = second;
      w.count = 0;
    }
    w.count++;
    // More than FLOOD_SECONDS whole seconds of flood, and the current one
    // flooding too.
    if (w.floodSeconds >= FLOOD_SECONDS && w.count > FLOOD_PER_SECOND) {
      this.mark({ turn, clientID, anomaly: "TGS_MACRO_SPIKE", value: w.count });
      return this.incident(
        clientID,
        TGS_FLOOD_CODE,
        turn,
        `${w.count} intents/s after ${w.floodSeconds} s above ${FLOOD_PER_SECOND}/s`,
      );
    }
    return null;
  }

  /**
   * Called with each desync check's verdict. Returns the clients to
   * disconnect: those out of step DESYNC_CHECKS checks in a row while most
   * players agree (when most disagree, the fault is nobody's in particular
   * and nobody is disconnected).
   */
  observeDesync(
    turn: number,
    activeClients: readonly ClientID[],
    outOfSync: readonly ClientID[],
  ): ClientID[] {
    if (!this.switch_.isEnabled()) return [];
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
      if (streak >= DESYNC_CHECKS) {
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
    for (const s of crossTeamSuspicions(players, stats)) {
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
