import { html, LitElement, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import {
  inMaintenance,
  isStaffRole,
  maintenanceAhead,
  type ServerStatus,
} from "../../core/ServerStatus";
import {
  closableGameName,
  myRole,
  SERVER_STATUS_EVENT,
  serverNow,
  serverStatus,
  watchServerStatus,
} from "../ServerStatusClient";
import { translateText } from "../Utils";

// Under an hour away, a maintenance is announced as a countdown in minutes.
const COUNTDOWN_MS = 60 * 60_000;

/**
 * Tells players what the operators announced (src/core/ServerStatus.ts): a
 * maintenance coming or under way, and the modes closed for now. On the
 * homepage it sits above the play buttons; in a game (variant "game") it only
 * shows a coming maintenance, small, at the top of the screen.
 */
@customElement("server-status-banner")
export class ServerStatusBanner extends LitElement {
  @property({ type: String }) variant: "home" | "game" = "home";
  @state() private status: ServerStatus = serverStatus();
  @state() private now = serverNow();
  // Staff may start test games in a maintenance that allows it.
  @state() private staff = false;
  private timer: number | undefined;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    watchServerStatus();
    document.addEventListener(SERVER_STATUS_EVENT, this.onStatus);
    document.addEventListener("userMeResponse", this.onAccount);
    this.onAccount();
    // The countdown moves on its own between two status reads.
    this.timer = window.setInterval(() => (this.now = serverNow()), 15_000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(SERVER_STATUS_EVENT, this.onStatus);
    document.removeEventListener("userMeResponse", this.onAccount);
    window.clearInterval(this.timer);
  }

  private onAccount = () => {
    void myRole().then((role) => (this.staff = isStaffRole(role)));
  };

  private onStatus = () => {
    this.status = serverStatus();
    this.now = serverNow();
  };

  private time(at: number): string {
    return new Date(at - (serverNow() - Date.now())).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  private aheadText(startsAt: number): string {
    const left = startsAt - this.now;
    const key = this.variant === "game" ? "game_" : "";
    return left < COUNTDOWN_MS
      ? translateText(`server_status.${key}ahead_in`, {
          minutes: Math.max(1, Math.ceil(left / 60_000)),
        })
      : translateText(`server_status.${key}ahead_at`, {
          time: this.time(startsAt),
        });
  }

  render() {
    const s = this.status;
    const m = s.maintenance;
    if (this.variant === "game") {
      if (m === null || !maintenanceAhead(s, this.now)) return nothing;
      return html`<div
        class="fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[950] -translate-x-1/2 pointer-events-none flex items-center gap-2 rounded-md border border-amber-300/30 bg-[#1a1408]/90 px-3 py-1.5 text-xs font-medium text-amber-100 shadow-lg backdrop-blur-xs"
        role="status"
      >
        ${this.icon("clock", "text-amber-300")} ${this.aheadText(m.startsAt)}
      </div>`;
    }

    if (m !== null && inMaintenance(s, this.now)) {
      return this.box(
        "wrench",
        "border-red-400/40 bg-red-950/60",
        "text-red-300",
        translateText("server_status.active_title"),
        [
          translateText("server_status.active_body"),
          m.endsAt !== undefined && m.endsAt > this.now
            ? translateText("server_status.back_at", {
                time: this.time(m.endsAt),
              })
            : null,
          m.staffCanPlay === true && this.staff
            ? translateText("server_status.staff_can_play")
            : null,
        ],
      );
    }
    if (m !== null && maintenanceAhead(s, this.now)) {
      return this.box(
        "clock",
        "border-amber-300/35 bg-amber-950/45",
        "text-amber-300",
        this.aheadText(m.startsAt),
        [translateText("server_status.ahead_body")],
      );
    }
    if (s.closed.length > 0) {
      return this.box(
        "lock",
        "border-white/12 bg-surface/80",
        "text-white/60",
        translateText("server_status.closed_title"),
        [s.closed.map(closableGameName).join(", ")],
      );
    }
    return nothing;
  }

  private box(
    icon: "wrench" | "clock" | "lock",
    frame: string,
    tint: string,
    title: string,
    lines: (string | null)[],
  ) {
    return html`<div
      class="mx-4 mb-4 sm:mx-0 flex items-start gap-3 rounded-md border px-4 py-3 text-white ${frame}"
      role="status"
    >
      ${this.icon(icon, `${tint} mt-0.5 size-5`)}
      <div class="flex min-w-0 flex-col gap-0.5">
        <p class="font-display text-sm font-bold leading-snug">${title}</p>
        ${lines
          .filter((l) => l !== null)
          .map((l) => html`<p class="text-xs text-white/70">${l}</p>`)}
      </div>
    </div>`;
  }

  private icon(kind: "wrench" | "clock" | "lock", cls: string) {
    const paths = {
      wrench: svg`<path d="M14.7 6.3a4 4 0 0 0 5 5L22 13.6a7 7 0 0 1-9.3 1.7L6 22l-4-4 6.7-6.7A7 7 0 0 1 10.4 2l2.3 2.3a4 4 0 0 0 2 2Z"></path>`,
      clock: svg`<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>`,
      lock: svg`<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>`,
    };
    return html`<svg
      viewBox="0 0 24 24"
      class="size-4 shrink-0 ${cls}"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      ${paths[kind]}
    </svg>`;
  }
}
