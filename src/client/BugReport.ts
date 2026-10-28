import { html, LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import { assetUrl } from "../core/AssetUrls";
import { getApiBase } from "./ApiBase";
import { userAuth } from "./Auth";
import { clientPlatform } from "./ClientPlatform";
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

export interface BugReportBody {
  text: string;
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
  };
}

/** What the game knows of the moment, sent with the player's words. */
export function bugReportBody(
  text: string,
  category: BugCategory,
  gameID: string | null,
): BugReportBody {
  let username: string | undefined;
  try {
    username = localStorage.getItem("username") ?? undefined;
  } catch {
    username = undefined;
  }
  return {
    text: text.trim().slice(0, BUG_TEXT_MAX),
    category,
    username,
    context: {
      version: currentGameVersion(),
      platform: clientPlatform(),
      gameID,
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

/** Sends the report: signed in when the player is, anonymous otherwise. */
export async function sendBugReport(body: BugReportBody): Promise<boolean> {
  const auth = await userAuth().catch(() => false as const);
  const res = await fetch(`${getApiBase()}/bug-reports`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth.jwt}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return res.ok;
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
  }

  close() {
    this.visible = false;
  }

  private async submit(e: Event) {
    e.preventDefault();
    if (this.text.trim().length < BUG_TEXT_MIN || this.status === "sending") {
      return;
    }
    this.status = "sending";
    try {
      const ok = await sendBugReport(
        bugReportBody(this.text, this.category, this.gameID),
      );
      this.status = ok ? "sent" : "failed";
    } catch {
      this.status = "failed";
    }
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
        class="flex w-full max-w-lg flex-col gap-3 rounded-2xl border border-white/10 bg-plate-800 p-5 text-white shadow-2xl"
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
            class="text-2xl leading-none text-white/60 hover:text-white"
            aria-label=${translateText("common.close")}
            @click=${() => this.close()}
          >
            ×
          </button>
        </div>
        ${this.status === "sent"
          ? html`<p class="text-emerald-200" role="status">
                ${translateText("bug_report.thanks")}
              </p>
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
