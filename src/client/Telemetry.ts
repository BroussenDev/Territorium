import { GameEnv } from "../core/configuration/Config";
import { UserSettings } from "../core/game/UserSettings";
import { getApiBase } from "./Api";
import { ClientEnv } from "./ClientEnv";
import { clientPlatform } from "./ClientPlatform";
import { currentGameVersion } from "./GameVersion";

/**
 * Anonymous, first-party telemetry: the in-game performance summaries
 * (GameMetrics.ts) and the game-ending errors players hit, sent to
 * Territorium's own API (POST /telemetry), never to a third party.
 *
 * Nothing in a report identifies a player: no account, session, game or
 * client id, and nothing is kept in the browser for it. A report says "a web
 * player on v0.1.106 at High quality saw these frame times", never who. The
 * API sums reports per day and deletes them after 30 days; the privacy
 * policy describes it. Off in development.
 */

// Reports are batched: one request a minute at most, and one when the page
// is left.
export const FLUSH_INTERVAL_MS = 60_000;
// The most errors kept between two flushes, so a crash loop cannot grow it.
const MAX_ERRORS = 10;

export interface MeasurementSummary {
  p50: number;
  p90: number;
  p99: number;
  count: number;
}

interface PendingError {
  type: string;
  error: string;
  count: number;
}

interface TelemetryReport {
  platform: string;
  version: string;
  quality: string;
  fpsCap: number;
  measurements: Array<MeasurementSummary & { type: string }>;
  errors: PendingError[];
}

let measurements: TelemetryReport["measurements"] = [];
let errors: PendingError[] = [];
let started = false;

function enabled(): boolean {
  try {
    return ClientEnv.env() !== GameEnv.Dev;
  } catch {
    // No BOOTSTRAP_CONFIG (a bare test page): no telemetry.
    return false;
  }
}

/** Starts the periodic sending; safe to call more than once. */
export function initTelemetry(): void {
  if (started || !enabled()) return;
  started = true;
  setInterval(() => flushTelemetry(false), FLUSH_INTERVAL_MS);
  // The last batch goes out as the page is left (a reload, a game exit).
  addEventListener("pagehide", () => flushTelemetry(true));
}

/** A summarised in-game measurement (see GameMetrics.ts). */
export function reportMeasurement(
  type: string,
  values: MeasurementSummary,
): void {
  if (!enabled()) return;
  measurements.push({ type, ...values });
}

/**
 * A game-ending error the client showed the player: a sim crash, a worker
 * failure, a desync. `type` is the error-modal heading key, so the same
 * class of crash groups together.
 */
export function reportGameError(error: string, type: string): void {
  if (!enabled()) return;
  const same = errors.find((e) => e.type === type && e.error === error);
  if (same !== undefined) same.count++;
  else if (errors.length < MAX_ERRORS) errors.push({ type, error, count: 1 });
}

/** What would be sent now, or null when there is nothing. Exported for tests. */
export function pendingReport(): TelemetryReport | null {
  if (measurements.length === 0 && errors.length === 0) return null;
  const settings = new UserSettings();
  return {
    platform: clientPlatform(),
    version: currentGameVersion(),
    quality: settings.graphicsQuality(),
    fpsCap: settings.frameRateCap(),
    measurements,
    errors,
  };
}

/** Sends what is pending; `leaving` uses a beacon, which outlives the page. */
export function flushTelemetry(leaving: boolean): void {
  const report = pendingReport();
  if (report === null) return;
  measurements = [];
  errors = [];
  const url = `${getApiBase()}/telemetry`;
  const body = JSON.stringify(report);
  try {
    if (leaving && typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      return;
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Lost: telemetry never bothers the player.
    });
  } catch {
    // Same.
  }
}

/** Test-only. */
export function resetTelemetry(): void {
  measurements = [];
  errors = [];
  started = false;
}
