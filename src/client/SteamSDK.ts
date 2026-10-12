// What the desktop app's `steam_auth_ticket` command answers (main.rs in the
// app's repository). The two cannot import from each other, so this is a
// hand-kept copy; if you change one, change the other.
export type SteamTicketFailure = "unavailable" | "timeout" | "error";

export type SteamTicketResult =
  | { ok: true; ticket: string }
  | { ok: false; reason: SteamTicketFailure };

interface SteamBridge {
  getAuthTicket(): Promise<SteamTicketResult>;
  getUser(): Promise<{ steamId: string; name: string } | null>;
}

// window.openfrontDesktop is declared `unknown` by DesktopShell.ts (kept loose
// there on purpose). We know the shape the app's bridge exposes, so narrow
// it locally rather than re-declaring the global (a second `declare global`
// with a different type triggers TS2717).
function steamBridge(): SteamBridge | undefined {
  const desktop = window.openfrontDesktop as
    | { steam?: SteamBridge }
    | undefined;
  return desktop?.steam;
}

// The app runs its own 5s watchdog on the native Steam ticket call and
// reports an accurate "timeout" reason when that fires. This outer bound
// must sit above that so the shell's own timeout wins the race in the normal
// case; it only fires when the IPC call itself is dead (e.g. the shell
// process wedged), where it maps to the same "timeout" reason the app would
// have reported.
const GET_TICKET_TIMEOUT_MS = 8000;

// The answer crosses from another repository as `unknown`: check its shape
// rather than trust it, so a malformed answer degrades rather than breaks.
function normaliseTicketResult(value: unknown): SteamTicketResult {
  if (value === null || value === undefined) {
    return { ok: false, reason: "unavailable" };
  }
  if (typeof value === "object" && "ok" in value) {
    const candidate = value as { ok: unknown; ticket?: unknown };
    // Validate the success case rather than casting it: a malformed
    // { ok: true } without a usable ticket would otherwise be POSTed to
    // /auth/steam as-is. A malformed FAILURE needs no check here -- an
    // unrecognised reason is already handled by ticketReason's default.
    if (candidate.ok === true) {
      return typeof candidate.ticket === "string" && candidate.ticket.length > 0
        ? { ok: true, ticket: candidate.ticket }
        : { ok: false, reason: "error" };
    }
    if (candidate.ok === false) {
      return value as SteamTicketResult;
    }
  }
  return { ok: false, reason: "error" };
}

// Thin wrapper over the desktop app's Steam bridge. Mirrors CrazyGamesSDK;
// the native work lives in the app (steamworks, in Rust).
class SteamSDK {
  isOnSteam(): boolean {
    return steamBridge() !== undefined;
  }

  async getTicket(): Promise<SteamTicketResult> {
    const bridge = steamBridge();
    if (!bridge) return { ok: false, reason: "unavailable" };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<SteamTicketResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ ok: false, reason: "timeout" }),
        GET_TICKET_TIMEOUT_MS,
      );
    });
    try {
      const result = await Promise.race([
        bridge.getAuthTicket().then(normaliseTicketResult),
        timeout,
      ]);
      return result;
    } catch {
      // The IPC call itself failed, which tells us nothing about Steam.
      return { ok: false, reason: "error" };
    } finally {
      clearTimeout(timer);
    }
  }

  async getUser(): Promise<{ steamId: string; name: string } | null> {
    const bridge = steamBridge();
    if (!bridge) return null;
    try {
      return await bridge.getUser();
    } catch {
      return null;
    }
  }
}

export const steamSDK = new SteamSDK();
