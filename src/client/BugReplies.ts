import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { assetUrl } from "../core/AssetUrls";
import { getApiBase } from "./ApiBase";
import { userAuth } from "./Auth";
import { reporterKey } from "./BugReport";
import { translateText } from "./Utils";

/** The team's answer to one of the player's bug reports. */
export interface BugReply {
  id: number;
  status: string;
  text: string;
  reply: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const auth = await userAuth(false).catch(() => false as const);
  return auth ? { Authorization: `Bearer ${auth.jwt}` } : {};
}

/** Answers the player hasn't read yet, for this account or this browser. */
export async function fetchBugReplies(): Promise<BugReply[]> {
  const key = reporterKey();
  const res = await fetch(
    `${getApiBase()}/bug-reports/replies?key=${encodeURIComponent(key ?? "")}`,
    { headers: { Accept: "application/json", ...(await authHeaders()) } },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { replies?: BugReply[] };
  return Array.isArray(data.replies) ? data.replies : [];
}

async function markRead(ids: number[]): Promise<void> {
  await fetch(`${getApiBase()}/bug-reports/replies/seen`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ ids, key: reporterKey() }),
  }).catch(() => {});
}

/** At the game's opening (web and Steam app): shows the team's answers. */
export async function showBugRepliesIfAny(): Promise<void> {
  const replies = await fetchBugReplies().catch(() => []);
  if (replies.length === 0) return;
  const popup = document.createElement("bug-replies") as BugReplies;
  popup.replies = replies;
  document.body.appendChild(popup);
}

@customElement("bug-replies")
export class BugReplies extends LitElement {
  @property({ attribute: false }) replies: BugReply[] = [];

  createRenderRoot() {
    return this;
  }

  private close() {
    void markRead(this.replies.map((r) => r.id));
    this.remove();
  }

  render() {
    return html`<div
      class="fixed inset-0 z-[10045] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      @keydown=${(e: KeyboardEvent) => {
        if (e.key === "Escape") this.close();
      }}
    >
      <div
        data-bug-replies
        role="dialog"
        aria-modal="true"
        aria-labelledby="bug-replies-title"
        class="flex max-h-[85dvh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-2xl border border-emerald-400/40 bg-plate-800 p-6 text-white shadow-2xl"
      >
        <div class="flex items-center gap-3">
          <img
            src=${assetUrl("images/BugIconWhite.svg")}
            alt=""
            aria-hidden="true"
            class="size-7"
          />
          <h2 id="bug-replies-title" class="m-0 text-xl font-bold">
            ${translateText("bug_report.replies_title")}
          </h2>
        </div>
        ${this.replies.map(
          (r) =>
            html`<div class="rounded-xl border border-white/10 bg-black/25 p-3">
              <div class="flex items-center justify-between gap-2">
                <b>${translateText("bug_report.ticket", { id: r.id })}</b>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-bold ${r.status ===
                  "fixed"
                    ? "bg-emerald-500/20 text-emerald-200"
                    : "bg-white/10 text-white/80"}"
                  >${translateText(`bug_report.status_${r.status}`)}</span
                >
              </div>
              <p class="m-0 mt-1 text-sm text-white/55">« ${r.text} »</p>
              <p class="m-0 mt-2 whitespace-pre-wrap">${r.reply}</p>
            </div>`,
        )}
        <button
          type="button"
          class="rounded-xl bg-emerald-600 px-4 py-2.5 font-bold transition-colors hover:bg-emerald-500"
          @click=${() => this.close()}
        >
          ${translateText("bug_report.replies_ok")}
        </button>
      </div>
    </div>`;
  }
}
