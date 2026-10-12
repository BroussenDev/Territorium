import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { createRef, ref, type Ref } from "lit/directives/ref.js";
import { getDesktopSessionState } from "../Auth";
import { desktopOffline } from "../DesktopOffline";
import {
  isDesktopShell,
  multiplayerAllowedForSession,
  type DesktopSessionState,
} from "../DesktopShell";
import {
  attemptInFlight,
  backendUnreachableConfirmed,
  MANUAL_RETRY_COOLDOWN_MS,
  retryServerList,
  type BackendReachabilityDetail,
  type ServerListAttemptDetail,
} from "../ServerList";
import { showToast, translateText } from "../Utils";

const WIGGLE_CLASS = "animate-bounce";

// How long Retry stays disabled after a press, on top of however long that
// press's own attempt takes. The number lives in ServerList because the web
// shares it: with no bar to press there, a refused multiplayer click is the
// retry (GameModeSelector.reportMultiplayerRefusal), throttled by
// manualRetryAvailable() on this same cooldown and the same clock.

/**
 * Which state the single bottom slot shows: a missing session outranks a
 * backend outage, because each signed-out reason names something the player
 * can act on regardless of the backend.
 *
 * `backendOutage` is the DEBOUNCED signal
 * (ServerList.backendUnreachableConfirmed()), and it is only ever true on
 * desktop -- the bar renders nothing on the web, so the component never
 * tracks it there. Nothing is shown while the heartbeat is merely unsettled
 * or has missed once: there is no neutral state in this bar to hang a
 * "Checking…" on, and inventing one would put a strip across the bottom of a
 * perfectly healthy game every time a single request timed out.
 */
export function barSource(
  session: DesktopSessionState | null,
  backendOutage: boolean,
): "session" | "reachability" | "none" {
  if (session !== null && !multiplayerAllowedForSession(session)) {
    return "session";
  }
  if (backendOutage) return "reachability";
  return "none";
}

/**
 * Bottom-of-screen status bar for the Steam app: a missing session and its
 * remedy, a confirmed backend outage and its Retry, or the offline build's
 * choices. One bottom slot, so they can never stack -- barSource above picks
 * exactly one.
 *
 * Mounted in index.html as a direct <body> child with `in-[.in-game]:hidden`,
 * so the bar is simply off-screen during a match and reappears at the menu in
 * whatever state it reached.
 *
 * Renders nothing on the web.
 */
@customElement("desktop-status-bar")
export class DesktopStatusBar extends LitElement {
  // Light DOM so the app's Tailwind classes apply, matching the other
  // components in this directory.
  createRenderRoot() {
    return this;
  }

  @state() private sessionState: DesktopSessionState | null = null;
  @state() private backendOutage = false;
  // Whether ANY server-list attempt is out, this bar's own Retry press or a
  // heartbeat beat. ServerList throttles and dedupes underneath, but a button
  // that keeps accepting clicks and visibly does nothing reads as broken --
  // and while the heartbeat is already asking, a press could only ever join
  // the attempt that is out, so offering it is a lie.
  @state() private attempting = false;
  // Whether the post-press cooldown is still running. The button is disabled
  // while EITHER this or `attempting` holds, so the two compose into "until
  // whichever ends later" without either needing to know about the other.
  @state() private coolingDown = false;
  // The Steam app's own build, opened offline (DesktopOffline.ts): whether
  // the player chose to stay offline, null elsewhere.
  @state() private offline: { staying: boolean } | null = null;
  @state() private goingOnline = false;
  private cooldownTimer: number | undefined;

  private onSessionState = (e: Event) => {
    const next = (e as CustomEvent<DesktopSessionState>).detail;
    this.sessionState = next;
    // A Retry that lands back on the same signed-out reason changes nothing
    // on screen (the app answered in a few ms, so even "Signing in…" never
    // paints). Wiggle so the press is seen to have been tried.
    const before = this.sessionAtRetry;
    if (before === null || next.status === "retrying") return;
    this.sessionAtRetry = null;
    if (next.status === before.status && next.reason === before.reason) {
      this.wiggle();
    }
  };

  // The session state when Retry was pressed, until the retry settles.
  private sessionAtRetry: DesktopSessionState | null = null;

  private onBackendReachability = (e: Event) => {
    this.backendOutage = (
      e as CustomEvent<BackendReachabilityDetail>
    ).detail.confirmed;
  };

  private onAttempt = (e: Event) => {
    this.attempting = (
      e as CustomEvent<ServerListAttemptDetail>
    ).detail.inFlight;
  };

  // The bar's own element, so wiggle() can restart the animation with a real
  // synchronous class removal + reflow + re-add. Routing that through a Lit
  // @state does NOT work: Lit batches writes into one microtask render and
  // keeps only the first oldValue of a batch, so false-then-true in a single
  // tick nets to no change and lit-html's dirty check skips the DOM write --
  // silently breaking the repeat-click case this exists for.
  private readonly barRef: Ref<HTMLElement> = createRef();
  private wiggleTimer: number | undefined;

  connectedCallback(): void {
    super.connectedCallback();
    void desktopOffline()
      ?.status()
      .then((s) => {
        if (s.active) this.offline = { staying: s.staying };
      });

    // Seed from the current value: Auth publishes its first transition during
    // startup, quite possibly before this element upgrades.
    if (isDesktopShell()) this.sessionState = getDesktopSessionState();
    document.addEventListener("desktop-session-state", this.onSessionState);

    // Reachability is subscribed ONLY on desktop, unlike the entry-point
    // components that gate on it. The heartbeat runs on the web too and
    // dispatches the same event, but this bar renders nothing there -- a web
    // player has the page's own chrome and no status bar to put an offline
    // strip in. Seeded first, for the same reason as the session above: the
    // heartbeat starts in Main's initialize and may well have settled before
    // this element upgrades.
    if (isDesktopShell()) {
      this.backendOutage = backendUnreachableConfirmed();
      this.attempting = attemptInFlight();
      document.addEventListener(
        "backend-reachability",
        this.onBackendReachability,
      );
      document.addEventListener("server-list-attempt", this.onAttempt);
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("desktop-session-state", this.onSessionState);
    document.removeEventListener(
      "backend-reachability",
      this.onBackendReachability,
    );
    document.removeEventListener("server-list-attempt", this.onAttempt);
    window.clearTimeout(this.wiggleTimer);
    window.clearTimeout(this.cooldownTimer);
  }

  /** Draws attention when the player tries to do something the bar gates. */
  wiggle(): void {
    const el = this.barRef.value;
    if (el === undefined) return;
    el.classList.remove(WIGGLE_CLASS);
    // A real reflow, between a real removal and a real re-add.
    void el.offsetWidth;
    el.classList.add(WIGGLE_CLASS);
    window.clearTimeout(this.wiggleTimer);
    this.wiggleTimer = window.setTimeout(() => {
      this.barRef.value?.classList.remove(WIGGLE_CLASS);
    }, 600);
  }

  render() {
    if (this.offline !== null) return this.renderOffline(this.offline.staying);
    const source = barSource(this.sessionState, this.backendOutage);
    if (source === "none") return nothing;

    return html`
      <div
        ${ref(this.barRef)}
        class="fixed bottom-0 left-0 w-full z-[300] in-[.in-game]:hidden
               bg-gray-900/95 backdrop-blur-sm border-t border-white/10
               px-4 py-3 flex items-center gap-4 text-white"
        role="status"
        aria-live="polite"
      >
        <div class="flex-1 min-w-0">
          <!-- The action button sits right after the text instead of at the
               far right edge: the Steam overlay's notification popup covers
               the bar's bottom-right corner. -->
          <div class="flex items-center gap-4">
            <div class="text-sm font-medium truncate min-w-0">
              ${this.slotLabel(source)}
            </div>
            ${this.slotAction(source)}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * The Steam app's offline build: solo plays. The player can try going back
   * online, or stay offline, which stops the app checking for the site.
   */
  private renderOffline(staying: boolean) {
    const button = (label: string, primary: boolean, onClick: () => void) =>
      html`<button
        class="shrink-0 px-4 py-2 rounded-md text-sm font-medium
               tracking-wider disabled:opacity-50 disabled:cursor-not-allowed
               ${primary
          ? "bg-brand hover:bg-brand-light"
          : "bg-white/10 hover:bg-white/15"}"
        ?disabled=${this.goingOnline}
        @click=${onClick}
      >
        ${label}
      </button>`;
    return html`<div
      class="fixed bottom-0 left-0 w-full z-[300] in-[.in-game]:hidden
             bg-gray-900/95 backdrop-blur-sm border-t border-white/10
             px-4 py-3 flex flex-wrap items-center gap-4 text-white"
      role="status"
      aria-live="polite"
    >
      <div class="text-sm font-medium min-w-0">
        ${translateText(
          staying ? "desktop_offline.staying" : "desktop_offline.offline",
        )}
      </div>
      ${staying
        ? button(translateText("desktop_offline.go_online"), true, () =>
            this.goOnline(),
          )
        : html`${button(
            this.goingOnline
              ? translateText("desktop_status.retrying")
              : translateText("desktop_status.retry"),
            true,
            () => this.goOnline(),
          )}
          ${button(translateText("desktop_offline.play_offline"), false, () =>
            this.stayOffline(),
          )}`}
    </div>`;
  }

  private goOnline(): void {
    const bridge = desktopOffline();
    if (bridge === null || this.goingOnline) return;
    this.goingOnline = true;
    void bridge.goOnline().then((online) => {
      this.goingOnline = false;
      // Online, the app replaces this page with the site.
      if (online) return;
      this.offline = { staying: false };
      showToast(translateText("desktop_offline.still_offline"), "red");
    });
  }

  private stayOffline(): void {
    const bridge = desktopOffline();
    if (bridge === null) return;
    this.offline = { staying: true };
    void bridge.stay();
  }

  /** The one line of text for whichever source won barSource. */
  private slotLabel(source: "session" | "reachability"): string {
    if (source === "session") {
      return this.sessionState === null
        ? ""
        : this.sessionLabel(this.sessionState);
    }
    return translateText("desktop_status.offline");
  }

  /** That source's remedy, if it has one. */
  private slotAction(source: "session" | "reachability") {
    if (source === "session") {
      return this.sessionState === null
        ? nothing
        : this.sessionAction(this.sessionState);
    }
    return this.reachabilityAction();
  }

  /**
   * Retry for the offline state: ask the server list to try the API again
   * right now rather than waiting out the heartbeat's backoff, which after a
   * few failures is up to a minute long.
   *
   * Nothing is rendered from the result. A successful attempt flips
   * backendReachable() to true, which dispatches "backend-reachability",
   * which is what makes this whole bar disappear -- so the button's own
   * feedback is the bar going away. A failed one leaves the bar as it is,
   * which is also correct.
   *
   * Disabled while an attempt is out (whoever started it) and for
   * MANUAL_RETRY_COOLDOWN_MS after a press, whichever ends later. While the
   * heartbeat is the one asking, the label says so rather than sitting there
   * greyed out for no visible reason: a dead button with no explanation is
   * the thing this feature was reported as.
   */
  private reachabilityAction() {
    const disabled = this.retryDisabled();
    return html`<button
      class="shrink-0 px-4 py-2 rounded-md bg-brand hover:bg-brand-light
             text-sm font-medium
             disabled:opacity-50 disabled:cursor-not-allowed
             disabled:hover:bg-brand"
      ?disabled=${disabled}
      title=${this.attempting
        ? translateText("desktop_status.retrying")
        : nothing}
      @click=${() => this.onRetryClick()}
    >
      ${this.attempting
        ? translateText("desktop_status.retrying")
        : translateText("desktop_status.retry")}
    </button>`;
  }

  private retryDisabled(): boolean {
    return this.attempting || this.coolingDown;
  }

  private onRetryClick(): void {
    // The rendered `disabled` already stops a real click getting here; this
    // guard is for the synthetic ones (a double click delivered in the same
    // task, before Lit has re-rendered) and costs nothing.
    if (this.retryDisabled()) return;
    this.coolingDown = true;
    window.clearTimeout(this.cooldownTimer);
    this.cooldownTimer = window.setTimeout(() => {
      this.coolingDown = false;
    }, MANUAL_RETRY_COOLDOWN_MS);
    // `attempting` is not set here: retryServerList dispatches
    // "server-list-attempt" synchronously when it starts a fetch, and that
    // one event covers this press and the heartbeat alike. Setting it here
    // too would leave it stuck on for a press the 1s floor swallowed, which
    // starts no attempt and so announces no settle.
    retryServerList().catch((err: unknown) => {
      // retryServerList never rejects; belt and braces, so a change there
      // cannot surface as an unhandled rejection from a click handler.
      console.error("desktop-status-bar: server list retry failed", err);
    });
  }

  private sessionLabel(s: DesktopSessionState): string {
    switch (s.reason) {
      case "steam-wedged":
        return translateText("desktop_session.steam_wedged");
      case "steam-unavailable":
        return translateText("desktop_session.steam_unavailable");
      case "steam-ticket-rejected":
        return translateText("desktop_session.steam_rejected");
      case "steam-backend":
        return translateText("desktop_session.steam_backend");
      case "network":
        return translateText("desktop_session.network");
      default:
        // `retrying`, and `steam-error` -- nothing specific to say.
        return s.status === "retrying"
          ? translateText("desktop_session.retrying")
          : translateText("desktop_session.generic");
    }
  }

  private sessionAction(s: DesktopSessionState) {
    if (s.status === "retrying") return nothing;
    return html`<button
      class="shrink-0 px-4 py-2 rounded-md bg-brand hover:bg-brand-light
             text-sm font-medium"
      @click=${() => {
        this.sessionAtRetry = s;
        // Main.ts owns the retry, because a successful sign-in also has to
        // refresh userMe, the nav account button and the cached profile --
        // all of which already live there. See its crazyGamesSDK listener.
        document.dispatchEvent(new CustomEvent("desktop-session-retry"));
      }}
    >
      ${translateText("desktop_session.retry")}
    </button>`;
  }
}
