import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../core/AssetUrls";
import { getApiBase } from "./ApiBase";
import { userAuth } from "./Auth";
import {
  blobToDataUrl,
  bugGameSource,
  BugGameState,
  screenshotBlob,
} from "./BugContext";
import { clientPlatform } from "./ClientPlatform";
import { desktopVersion } from "./DesktopShell";
import { currentGameVersion } from "./GameVersion";
import { translateText } from "./Utils";

export const BUG_CATEGORIES = [
  "gameplay",
  "display",
  "performance",
  "account",
  "other",
] as const;
export type BugCategory = (typeof BUG_CATEGORIES)[number];
export const BUG_TEXT_MIN = 10;
export const BUG_TEXT_MAX = 2000;

/** The support site's page for the player's own requests. */
export const SUPPORT_REQUESTS_URL = "https://support.territorium.gg/#/requests";

export interface BugReportBody {
  text: string;
  reporterKey?: string;
  category: BugCategory;
  username?: string;
  context: {
    version: string;
    platform: string;
    gameID: string | null;
    page: string;
    screen: string;
    userAgent: string;
    lang: string;
    /** The match the player is in, when they report from one. */
    game?: Omit<BugGameState, "gameID">;
    /** The Steam app's own version, on the desktop shell. */
    desktopVersion?: string;
    device?: { dpr: number; cores?: number; memoryGB?: number };
  };
  /** A picture of the map as a data URL (WebP or JPEG, at most 400 KB). */
  screenshot?: string;
}

/** What the game adds to the player's words. */
export interface BugReportExtras {
  game?: BugGameState | null;
  desktopVersion?: string | null;
  screenshot?: string | null;
}

/** What the game knows of the moment, sent with the player's words. */
export function bugReportBody(
  text: string,
  category: BugCategory,
  gameID: string | null,
  extras: BugReportExtras = {},
): BugReportBody {
  let username: string | undefined;
  try {
    username = localStorage.getItem("username") ?? undefined;
  } catch {
    username = undefined;
  }
  const { gameID: liveGameID, ...game } = extras.game ?? { gameID: null };
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  return {
    text: text.trim().slice(0, BUG_TEXT_MAX),
    reporterKey: reporterKey() ?? undefined,
    category,
    username,
    ...(extras.screenshot ? { screenshot: extras.screenshot } : {}),
    context: {
      version: currentGameVersion(),
      platform: clientPlatform(),
      gameID: liveGameID ?? gameID,
      ...(extras.game ? { game: game as Omit<BugGameState, "gameID"> } : {}),
      ...(extras.desktopVersion
        ? { desktopVersion: extras.desktopVersion.slice(0, 40) }
        : {}),
      device: {
        dpr: Math.round((window.devicePixelRatio || 1) * 100) / 100,
        cores: navigator.hardwareConcurrency || undefined,
        memoryGB: memory,
      },
      page: location.pathname.slice(0, 200),
      screen: `${window.innerWidth}x${window.innerHeight}`,
      userAgent: navigator.userAgent.slice(0, 300),
      lang: document.documentElement.lang || navigator.language,
    },
  };
}

/** The game a page shows ("/w0/game/<id>"), if any. */
export function gameIDFromPath(path: string): string | null {
  return /\/game\/([A-Za-z0-9]{1,32})/.exec(path)?.[1] ?? null;
}

const REPORTER_KEY = "territorium.bugReporterKey";

/**
 * This browser's (or app's) own key, sent with every report: the team's
 * answer comes back to it even when the player isn't signed in.
 */
export function reporterKey(): string | null {
  try {
    let key = localStorage.getItem(REPORTER_KEY);
    if (key === null || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) {
      const bytes = crypto.getRandomValues(new Uint8Array(18));
      key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(REPORTER_KEY, key);
    }
    return key;
  } catch {
    return null;
  }
}

export interface BugReportSent {
  id: number;
  /** The help-center ticket, when the player was signed in ("SUP-12"). */
  supportRef: string | null;
}

/** Sends the report; its ticket, or null when it didn't go through. */
export async function sendBugReport(
  body: BugReportBody,
): Promise<BugReportSent | null> {
  const auth = await userAuth().catch(() => false as const);
  const res = await fetch(`${getApiBase()}/bug-reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth.jwt}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => ({}))) as {
    id?: unknown;
    supportRef?: unknown;
  };
  if (typeof data.id !== "number") return null;
  return {
    id: data.id,
    supportRef: typeof data.supportRef === "string" ? data.supportRef : null,
  };
}

/** Opens the "report a bug" window over whatever is on screen. */
export function openBugReport(
  gameID: string | null = gameIDFromPath(location.pathname),
): void {
  let modal = document.querySelector("bug-report-modal") as BugReportModal;
  if (modal === null) {
    modal = document.createElement("bug-report-modal") as BugReportModal;
    document.body.appendChild(modal);
  }
  modal.open(gameID);
}

@customElement("bug-report-modal")
export class BugReportModal extends LitElement {
  @state() private visible = false;
  @state() private category: BugCategory = "gameplay";
  @state() private text = "";
  @state() private status: "idle" | "sending" | "sent" | "failed" = "idle";
  @state() private ticket: number | null = null;
  @state() private supportRef: string | null = null;
  /** Whether the player wants the picture sent; on until they say no. */
  @state() private attachShot = true;
  @state() private shotState: "none" | "capturing" | "ready" | "failed" =
    "none";
  @state() private shotUrl: string | null = null;
  private shotBlob: Blob | null = null;
  private shotToken = 0;
  private gameID: string | null = null;

  createRenderRoot() {
    return this;
  }

  open(gameID: string | null) {
    this.gameID = gameID;
    this.visible = true;
    this.status = "idle";
    this.text = "";
    this.category = "gameplay";
    this.supportRef = null;
    this.attachShot = true;
    this.shotToken++;
    this.clearShot();
    // The picture is taken now, over the map, before the player types.
    if (bugGameSource() !== null) void this.takeShot();
  }

  close() {
    this.visible = false;
    this.shotToken++;
    this.clearShot();
  }

  private clearShot() {
    if (this.shotUrl !== null) URL.revokeObjectURL(this.shotUrl);
    this.shotUrl = null;
    this.shotBlob = null;
    this.shotState = "none";
  }

  private async takeShot() {
    const source = bugGameSource();
    if (source === null) return;
    const token = ++this.shotToken;
    this.shotState = "capturing";
    try {
      const canvas = await source.captureFrame();
      const blob = canvas === null ? null : await screenshotBlob(canvas);
      if (token !== this.shotToken) return;
      if (blob === null) {
        this.shotState = "failed";
        return;
      }
      this.shotBlob = blob;
      this.shotUrl = URL.createObjectURL(blob);
      this.shotState = "ready";
    } catch {
      if (token === this.shotToken) this.shotState = "failed";
    }
  }

  private toggleShot(on: boolean) {
    this.attachShot = on;
    if (!on) {
      this.shotToken++;
      this.clearShot();
    } else if (this.shotState === "none") {
      void this.takeShot();
    }
  }

  private async submit(e: Event) {
    e.preventDefault();
    if (this.text.trim().length < BUG_TEXT_MIN || this.status === "sending") {
      return;
    }
    this.status = "sending";
    try {
      const screenshot =
        this.attachShot && this.shotBlob !== null
          ? await blobToDataUrl(this.shotBlob)
          : null;
      const sent = await sendBugReport(
        bugReportBody(this.text, this.category, this.gameID, {
          game: bugGameSource()?.snapshot() ?? null,
          desktopVersion: await desktopVersion(),
          screenshot,
        }),
      );
      this.ticket = sent?.id ?? null;
      this.supportRef = sent?.supportRef ?? null;
      this.status = sent !== null ? "sent" : "failed";
    } catch {
      this.status = "failed";
    }
  }

  /** The "attach a screenshot" choice, with a preview; only inside a game. */
  private renderShot() {
    if (bugGameSource() === null) return null;
    return html`<div
      class="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 p-3"
      data-bug-screenshot
    >
      <label class="flex cursor-pointer items-center gap-2.5 text-sm">
        <span class="relative flex size-5 shrink-0">
          <input
            type="checkbox"
            class="peer size-5 cursor-pointer appearance-none rounded-md border border-white/25 bg-black/30 transition-colors checked:border-brand-bright checked:bg-brand hover:border-brand-bright/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-capital/80"
            .checked=${this.attachShot}
            @change=${(e: Event) =>
              this.toggleShot((e.target as HTMLInputElement).checked)}
          />
          <svg
            viewBox="0 0 24 24"
            class="pointer-events-none absolute inset-0 m-auto hidden size-3.5 text-white peer-checked:block"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </span>
        ${translateText("bug_report.attach_screenshot")}
      </label>
      ${this.attachShot && this.shotState === "capturing"
        ? html`<p class="m-0 text-xs text-white/50">
            ${translateText("bug_report.screenshot_capturing")}
          </p>`
        : null}
      ${this.attachShot && this.shotState === "failed"
        ? html`<p class="m-0 text-xs text-amber-300" role="status">
            ${translateText("bug_report.screenshot_failed")}
          </p>`
        : null}
      ${this.attachShot && this.shotState === "ready" && this.shotUrl
        ? html`<div class="relative">
              <img
                src=${this.shotUrl}
                alt=${translateText("bug_report.screenshot_alt")}
                class="max-h-40 w-full rounded-lg border border-white/10 object-cover"
              />
              <button
                type="button"
                data-bug-screenshot-remove
                class="absolute end-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs font-semibold text-white hover:bg-red-600"
                @click=${() => this.toggleShot(false)}
              >
                ${translateText("bug_report.screenshot_remove")}
              </button>
            </div>
            <p class="m-0 text-xs text-white/50">
              ${translateText("bug_report.screenshot_hint")}
            </p>`
        : null}
    </div>`;
  }

  render() {
    if (!this.visible) return null;
    const tooShort = this.text.trim().length < BUG_TEXT_MIN;
    return html`<div
      class="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      @click=${(e: Event) => {
        if (e.target === e.currentTarget) this.close();
      }}
      @keydown=${(e: KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === "Escape") this.close();
      }}
    >
      <form
        data-bug-report
        class="flex max-h-[92dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-plate-800 p-5 text-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-report-title"
        @submit=${this.submit}
      >
        <div class="flex items-center gap-3">
          <img
            src=${assetUrl("images/BugIconWhite.svg")}
            alt=""
            aria-hidden="true"
            class="size-6"
          />
          <h2 id="bug-report-title" class="m-0 flex-1 text-xl font-bold">
            ${translateText("bug_report.title")}
          </h2>
          <button
            type="button"
            class="flex size-9 items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/8 hover:text-white"
            aria-label=${translateText("common.close")}
            @click=${() => this.close()}
          >
            <svg
              viewBox="0 0 24 24"
              class="size-5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        ${this.status === "sent"
          ? html`<p class="text-emerald-200" role="status">
                ${translateText("bug_report.thanks")}
              </p>
              <p class="m-0 text-lg font-bold" data-bug-ticket>
                ${translateText("bug_report.ticket", { id: this.ticket ?? "" })}
              </p>
              <p class="m-0 text-sm text-white/70">
                ${translateText("bug_report.reply_later")}
              </p>
              ${this.supportRef !== null
                ? html`<p class="m-0 text-sm text-white/70" data-bug-support>
                    ${translateText("bug_report.follow_up", {
                      ref: this.supportRef,
                    })}
                    <a
                      class="font-semibold text-brand-bright underline hover:text-white"
                      href=${SUPPORT_REQUESTS_URL}
                      target="_blank"
                      rel="noopener"
                      >${translateText("bug_report.open_requests")}</a
                    >
                  </p>`
                : null}
              <button
                type="button"
                class="rounded-xl bg-emerald-600 px-4 py-2.5 font-bold hover:bg-emerald-500"
                @click=${() => this.close()}
              >
                ${translateText("common.close")}
              </button>`
          : html`<p class="m-0 text-sm text-white/70">
                ${translateText("bug_report.intro")}
              </p>
              <label class="flex flex-col gap-1 text-sm">
                ${translateText("bug_report.category")}
                <select
                  class="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                  .value=${this.category}
                  @change=${(e: Event) =>
                    (this.category = (e.target as HTMLSelectElement)
                      .value as BugCategory)}
                >
                  ${BUG_CATEGORIES.map(
                    (c) =>
                      html`<option value=${c} ?selected=${c === this.category}>
                        ${translateText(`bug_report.category_${c}`)}
                      </option>`,
                  )}
                </select>
              </label>
              <label class="flex flex-col gap-1 text-sm">
                ${translateText("bug_report.what_happened")}
                <textarea
                  class="min-h-32 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-white"
                  maxlength=${BUG_TEXT_MAX}
                  placeholder=${translateText("bug_report.placeholder")}
                  .value=${this.text}
                  @input=${(e: Event) =>
                    (this.text = (e.target as HTMLTextAreaElement).value)}
                ></textarea>
              </label>
              ${this.renderShot()}
              <p class="m-0 text-xs text-white/50">
                ${translateText("bug_report.context_note")}
              </p>
              ${this.status === "failed"
                ? html`<p class="m-0 text-sm text-red-300" role="alert">
                    ${translateText("bug_report.failed")}
                  </p>`
                : null}
              <button
                class="rounded-xl bg-emerald-600 px-4 py-2.5 font-bold transition-colors hover:bg-emerald-500 disabled:opacity-50"
                ?disabled=${tooShort || this.status === "sending"}
              >
                ${this.status === "sending"
                  ? translateText("bug_report.sending")
                  : translateText("bug_report.send")}
              </button>`}
      </form>
    </div>`;
  }
}
