// Anonymous statistics from the Steam demo, for the admin panel's Demo page:
// launches, new and daily players, play time, games by mode, Survival's
// waves and wishlist clicks. Counts only: no account, Steam id or client id
// is sent (the API's demoStats.js keeps one sum per day and metric). "New
// player" and "player today" are decided here, from what this PC remembers,
// so no id ever leaves it. Counts wait in storage while the demo is offline.

import { getApiBase } from "./Api";
import { isDemo } from "./Demo";

const PENDING_KEY = "demoStatsPending";
const SEEN_KEY = "demoStatsSeen";
const DAY_KEY = "demoStatsDay";
const FLUSH_MS = 60_000;

export type DemoMode = "solo" | "survival" | "tutorial";

function read(): Record<string, number> {
  try {
    const raw = JSON.parse(localStorage.getItem(PENDING_KEY) ?? "{}");
    return raw !== null && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function write(counts: Record<string, number>): void {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(counts));
  } catch {
    // Storage blocked: these counts are lost.
  }
}

/** Adds to a metric, sent with the next report. Nothing outside the demo. */
export function countDemo(metric: string, n = 1): void {
  if (!isDemo() || n <= 0) return;
  const counts = read();
  counts[metric] = (counts[metric] ?? 0) + n;
  write(counts);
}

function flush(): void {
  const counts = read();
  if (Object.keys(counts).length === 0) return;
  // Plain text, no credentials: a simple request the API takes from the
  // demo's bundled page without CORS. Cleared once sent; kept offline.
  const body = JSON.stringify({ counts });
  write({});
  void fetch(`${getApiBase()}/demo-stats`, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body,
    keepalive: true,
  }).catch(() => {
    const now = read();
    for (const [k, v] of Object.entries(counts)) now[k] = (now[k] ?? 0) + v;
    write(now);
  });
}

let started = false;

/** At the demo's start: the launch, the player counts and the minute clock. */
export function startDemoStats(): void {
  if (started || !isDemo()) return;
  started = true;
  countDemo("launch");
  try {
    if (localStorage.getItem(SEEN_KEY) === null) {
      localStorage.setItem(SEEN_KEY, "1");
      countDemo("new_player");
    }
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(DAY_KEY) !== today) {
      localStorage.setItem(DAY_KEY, today);
      countDemo("active_player");
    }
  } catch {
    // Storage blocked: no player counts from this PC.
  }
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    countDemo("minutes_app");
    if (document.body.classList.contains("in-game")) countDemo("minutes_game");
  }, 60_000);
  setInterval(flush, FLUSH_MS);
  window.addEventListener("pagehide", flush);
  flush();
}
