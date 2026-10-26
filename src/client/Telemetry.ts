import { GameEnv } from "../core/configuration/Config";
import { UserSettings } from "../core/game/UserSettings";
import { getApiBase } from "./Api";
import { ClientEnv } from "./ClientEnv";
import { clientPlatform } from "./ClientPlatform";
import { currentGameVersion } from "./GameVersion";

/**
 * Anonymous, first-party telemetry: the in-game performance summaries
 * (GameMetrics.ts) and the crashes players hit (game-ending errors, and any
 * uncaught error of the page or the simulation worker, with where in the
 * code it happened), sent to Territorium's own API (POST /telemetry), never
 * to a third party. The API maps the stacks back to source files and groups
 * them for the admin panel's Crashes page.
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
  /** Bundle file, line and column of each frame (cleanStack), if known. */
  stack?: string;
}

// Frames kept per stack, and the longest stack sent.
const MAX_FRAMES = 15;
const MAX_STACK = 1500;

// Errors that are not ours to fix: a browser extension's, a cross-origin
// script's (no detail at all), and a harmless layout notice.
const IGNORED = [/^Script error\.?$/, /ResizeObserver loop/, /extension:\/\//];

/**
 * A stack reduced to what locates a bug and nothing else: per frame, the
 * function name and the bundle file's name, line and column (the API maps
 * them back to the source). Frames outside the game's own bundles (browser
 * extensions, injected scripts) are dropped, and so is every address.
 */
export function cleanStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const frames: string[] = [];
  for (const line of stack.split("\n")) {
    // Chrome: "at name (url:line:col)" or "at url:line:col";
    // Firefox and Safari: "name@url:line:col".
    const m =
      /^\s*at (?:(.+?) \()?(\S+?):(\d+):(\d+)\)?\s*$/.exec(line) ??
      /^\s*(?:(.*?)@)?(\S+?):(\d+):(\d+)\s*$/.exec(line);
    if (m === null) continue;
    const file = m[2].split(/[?#]/)[0].split("/").pop() ?? "";
    if (!/^[\w.-]+\.js$/.test(file) || /extension:/.test(m[2])) continue;
    const name = (m[1] ?? "").replace(/^async /, "").slice(0, 60) || "?";
    frames.push(`${name} ${file}:${m[3]}:${m[4]}`);
    if (frames.length >= MAX_FRAMES) break;
  }
  return frames.length ? frames.join("\n").slice(0, MAX_STACK) : undefined;
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
  watchUncaughtErrors();
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
export function reportGameError(
  error: string,
  type: string,
  stack?: string,
): void {
  if (!enabled()) return;
  if (IGNORED.some((r) => r.test(error))) return;
  const frames = cleanStack(stack);
  const same = errors.find(
    (e) => e.type === type && e.error === error && e.stack === frames,
  );
  if (same !== undefined) same.count++;
  else if (errors.length < MAX_ERRORS) {
    errors.push({
      type,
      error,
      count: 1,
      ...(frames ? { stack: frames } : {}),
    });
  }
}

/**
 * Uncaught errors anywhere in the page (menus, shop, a game's interface)
 * and rejected promises nobody handled: reported like a game crash, under
 * their own type, so nothing that breaks for a player goes unseen.
 */
function watchUncaughtErrors(): void {
  addEventListener("error", (e: ErrorEvent) => {
    const stack =
      (e.error as Error | undefined)?.stack ??
      (e.filename ? `at ${e.filename}:${e.lineno}:${e.colno}` : undefined);
    if (e.filename && !cleanStack(`at ${e.filename}:${e.lineno}:${e.colno}`)) {
      return; // Not from the game's own code.
    }
    reportGameError(String(e.message || "error"), "crash.page", stack);
  });
  // The simulation worker's own uncaught errors (WorkerClient.ts): src/core
  // can't import this file, so it raises an event.
  addEventListener("game-worker-error", (e: Event) => {
    const { message, stack } = (
      e as CustomEvent<{
        message: string;
        stack: string;
      }>
    ).detail;
    reportGameError(String(message || "error"), "crash.worker", stack);
  });
  addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: unknown; stack?: unknown } | null;
    const message =
      typeof reason?.message === "string" ? reason.message : String(e.reason);
    const stack = typeof reason?.stack === "string" ? reason.stack : undefined;
    reportGameError(message, "crash.promise", stack);
  });
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
