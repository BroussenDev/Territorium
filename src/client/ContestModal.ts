import { html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";
import { submitAppeal } from "./Api";
import { translateText } from "./Utils";

export type ContestKind = "ban" | "ranked_ban" | "warning" | "tgs_cancel";

const MIN_LENGTH = 20;
const MAX_LENGTH = 1000;

/**
 * Lets a sanctioned player contest it from the game: what they write lands
 * in their moderation ticket, where a moderator reviews it and can lift the
 * sanction. `ref` names what is contested (a ranked game's id).
 */
export function openContest(kind: ContestKind, ref?: string): void {
  const modal = document.querySelector("contest-modal") as ContestModal | null;
  modal?.open(kind, ref);
}

@customElement("contest-modal")
export class ContestModal extends LitElement {
  @state() private kind: ContestKind | null = null;
  @state() private text = "";
  @state() private busy = false;
  @state() private result: "sent" | "error" | "rate" | null = null;
  private ref: string | undefined;

  createRenderRoot() {
    return this;
  }

  public open(kind: ContestKind, ref?: string): void {
    this.kind = kind;
    this.ref = ref;
    this.text = "";
    this.result = null;
    void this.updateComplete.then(() =>
      (this.querySelector("#contest-text") as HTMLElement | null)?.focus(),
    );
  }

  private close(): void {
    this.kind = null;
  }

  private async send(): Promise<void> {
    if (this.kind === null || this.busy) return;
    this.busy = true;
    const result = await submitAppeal(this.kind, this.text.trim(), this.ref);
    this.busy = false;
    this.result =
      result === "ok" ? "sent" : result === "rate_limited" ? "rate" : "error";
  }

  render() {
    if (this.kind === null) return nothing;
    const length = this.text.trim().length;
    return html`
      <div
        class="fixed inset-0 z-[10030] flex items-center justify-center bg-black/75 p-4 backdrop-blur-[2px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contest-title"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.close();
        }}
      >
        <div
          class="flex w-full max-w-lg flex-col gap-4 rounded-lg border border-white/10 bg-[linear-gradient(180deg,#11221c_0%,#0a1512_100%)] p-5 text-white shadow-2xl"
        >
          <h2 id="contest-title" class="font-display text-xl font-bold">
            ${translateText("contest.title")}
          </h2>
          ${this.result === "sent"
            ? html`<p class="text-sm leading-relaxed text-white/85">
                  ${translateText("contest.sent")}
                </p>
                <button
                  class="rounded-md bg-brand px-4 py-2.5 font-semibold"
                  @click=${() => this.close()}
                >
                  ${translateText("common.close")}
                </button>`
            : html`
                <p class="text-sm leading-relaxed text-white/75">
                  ${translateText("contest.desc")}
                </p>
                <textarea
                  id="contest-text"
                  rows="6"
                  maxlength=${MAX_LENGTH}
                  .value=${this.text}
                  @input=${(e: Event) => {
                    this.text = (e.target as HTMLTextAreaElement).value;
                    this.result = null;
                  }}
                  placeholder=${translateText("contest.placeholder")}
                  class="w-full resize-y rounded-md border border-white/10 bg-black/30 p-3 text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-brand/50"
                ></textarea>
                <div
                  class="flex items-center justify-between text-xs text-white/50"
                >
                  <span>
                    ${length < MIN_LENGTH
                      ? translateText("contest.min", { n: MIN_LENGTH })
                      : ""}
                  </span>
                  <span>${length} / ${MAX_LENGTH}</span>
                </div>
                ${this.result === "error" || this.result === "rate"
                  ? html`<p class="text-sm text-red-300" role="alert">
                      ${translateText(
                        this.result === "rate"
                          ? "contest.rate_limited"
                          : "contest.failed",
                      )}
                    </p>`
                  : nothing}
                <div class="flex justify-end gap-2">
                  <button
                    class="rounded-md border border-white/15 px-4 py-2 text-sm"
                    @click=${() => this.close()}
                  >
                    ${translateText("common.cancel")}
                  </button>
                  <button
                    class="rounded-md bg-brand px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    ?disabled=${this.busy || length < MIN_LENGTH}
                    @click=${() => void this.send()}
                  >
                    ${translateText("contest.send")}
                  </button>
                </div>
              `}
        </div>
      </div>
    `;
  }
}
