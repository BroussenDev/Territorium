import { ClientID } from "../core/Schemas";

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
 * Along the way TGS leaves markers on the match's timeline (a burst above
 * SPIKE_PER_SECOND, each desync) for the replay review. The whole watch can
 * be switched off from the admin panel (TgsSwitch); off, nothing is
 * observed, marked or disconnected.
 */

export const TGS_FLOOD_CODE = "TGS-101";
export const TGS_DESYNC_CODE = "TGS-102";
export type TgsCode = typeof TGS_FLOOD_CODE | typeof TGS_DESYNC_CODE;

/** Translation keys of the message a disconnected player reads. */
export const TGS_KICK_REASONS: Record<TgsCode, string> = {
  [TGS_FLOOD_CODE]: "kick_reason.tgs_101",
  [TGS_DESYNC_CODE]: "kick_reason.tgs_102",
};

export const SPIKE_PER_SECOND = 15;
export const FLOOD_PER_SECOND = 35;
export const FLOOD_SECONDS = 2;
export const DESYNC_CHECKS = 3;

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

  constructor(
    private readonly switch_: Pick<TgsSwitch, "isEnabled"> = tgsSwitch,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Called for every intent a player sends, before any limit drops it.
   * Returns the code to disconnect them with, or null.
   */
  observeIntent(clientID: ClientID, turn: number): TgsCode | null {
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

  /** The last incident recorded, for its immediate report to the API. */
  lastIncident(): TgsIncident | undefined {
    return this.incidents[this.incidents.length - 1];
  }

  /** What goes into the archived record, or undefined when nothing happened. */
  report(): TgsReport | undefined {
    if (this.markers.length === 0 && this.incidents.length === 0)
      return undefined;
    return { markers: [...this.markers], incidents: [...this.incidents] };
  }

  private mark(marker: TgsMarker): void {
    if (this.markers.length < MAX_MARKERS) this.markers.push(marker);
  }

  private incident(
    clientID: ClientID,
    code: TgsCode,
    turn: number,
    details: string,
  ): TgsCode {
    this.incidents.push({ clientID, code, turn, details });
    this.rates.delete(clientID);
    return code;
  }
}
