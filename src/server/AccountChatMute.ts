import { GameEnv } from "../core/configuration/Config";
import { ServerEnv } from "./ServerEnv";

// A staff chat mute lasts across games: the account cannot write free text
// in any chat until it ends. The API knows it; a game server asks when a
// player joins and keeps the answer for a minute, so chat never waits on the
// network. Quick chat and emotes are not chat lines and stay allowed.

export const ACCOUNT_MUTE_TTL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 5000;
// The API answers with a date in the year 9999 for a mute without an end.
const PERMANENT_AFTER_MS = 10 * 365 * 86_400_000;

export interface AccountChatMuteOptions {
  baseUrl?: () => string;
  apiKey?: () => string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  enabled?: () => boolean;
}

interface Entry {
  until: number | null;
  fetchedAt: number;
}

export class AccountChatMutes {
  private readonly cache = new Map<string, Entry>();
  private readonly inflight = new Map<string, Promise<number | null>>();
  private readonly baseUrl: () => string;
  private readonly apiKey: () => string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly enabled: () => boolean;

  constructor(opts: AccountChatMuteOptions = {}) {
    this.baseUrl = opts.baseUrl ?? (() => ServerEnv.jwtIssuer());
    this.apiKey = opts.apiKey ?? (() => ServerEnv.apiKey());
    this.fetchImpl = opts.fetchImpl ?? ((...a) => fetch(...a));
    this.now = opts.now ?? Date.now;
    this.enabled = opts.enabled ?? (() => ServerEnv.env() !== GameEnv.Dev);
  }

  /** True for a mute with no end. */
  isPermanent(until: number): boolean {
    return until - this.now() > PERMANENT_AFTER_MS;
  }

  /**
   * The end of the account's mute (ms), or null. Answers from the cache at
   * once; an old entry is refreshed in the background. Fail open: an API that
   * cannot be reached mutes nobody.
   */
  mutedUntil(persistentID: string): number | null {
    const entry = this.cache.get(persistentID);
    const now = this.now();
    if (entry === undefined || now - entry.fetchedAt >= ACCOUNT_MUTE_TTL_MS) {
      void this.refresh(persistentID);
    }
    if (entry === undefined || entry.until === null || entry.until <= now) {
      return null;
    }
    return entry.until;
  }

  /** Asks the API now (joins call this); never throws. */
  refresh(persistentID: string): Promise<number | null> {
    if (!this.enabled()) return Promise.resolve(null);
    const pending = this.inflight.get(persistentID);
    if (pending !== undefined) return pending;
    const p = this.fetchOne(persistentID).finally(() =>
      this.inflight.delete(persistentID),
    );
    this.inflight.set(persistentID, p);
    return p;
  }

  private async fetchOne(persistentID: string): Promise<number | null> {
    try {
      const res = await this.fetchImpl(
        `${this.baseUrl()}/tgs/player-status/${encodeURIComponent(persistentID)}`,
        {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          headers: { "x-api-key": this.apiKey() },
        },
      );
      if (!res.ok) return this.keepOld(persistentID);
      const body = (await res.json()) as { chatMutedUntil?: unknown };
      const until =
        typeof body.chatMutedUntil === "number" &&
        Number.isFinite(body.chatMutedUntil)
          ? body.chatMutedUntil
          : null;
      this.cache.set(persistentID, { until, fetchedAt: this.now() });
      if (this.cache.size > 5000) {
        for (const [k, e] of this.cache) {
          if (this.now() - e.fetchedAt >= ACCOUNT_MUTE_TTL_MS) {
            this.cache.delete(k);
          }
        }
      }
      return until === null || until <= this.now() ? null : until;
    } catch {
      return this.keepOld(persistentID);
    }
  }

  // The API failed: the last answer stands, and we do not ask again at once.
  private keepOld(persistentID: string): number | null {
    const until = this.cache.get(persistentID)?.until ?? null;
    this.cache.set(persistentID, { until, fetchedAt: this.now() });
    return until;
  }
}

/** The process-wide cache every game reads. */
export const accountChatMutes = new AccountChatMutes();
