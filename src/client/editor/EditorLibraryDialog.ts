import { html, LitElement, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { translateText } from "../Utils";
import type { LibraryMap } from "./EditorLibrary";

// The map editor's "My creations": every map the player keeps, to open,
// duplicate or delete, and a new one to start. Says whether they are synced
// with the account (the same in the browser and the Steam app).

export type EditorSyncStatus =
  | "local"
  | "signed-out"
  | "syncing"
  | "synced"
  | "error";

@customElement("editor-library-dialog")
export class EditorLibraryDialog extends LitElement {
  @property({ attribute: false }) maps: LibraryMap[] = [];
  @property({ attribute: false }) currentId: string | null = null;
  @property({ attribute: false }) sync: EditorSyncStatus = "local";
  @state() private confirmDelete: LibraryMap | null = null;

  createRenderRoot() {
    return this;
  }

  private emit(name: string, id?: string) {
    this.dispatchEvent(
      new CustomEvent(name, { detail: id, bubbles: true, composed: true }),
    );
  }

  private updatedLabel(m: LibraryMap): string {
    // In the game's language, not the browser's.
    const lang =
      (
        document.querySelector("lang-selector") as {
          currentLang?: string;
        } | null
      )?.currentLang ?? undefined;
    let date: string;
    try {
      date = new Date(m.updatedAt).toLocaleString(lang, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      date = new Date(m.updatedAt).toLocaleString();
    }
    return translateText("map_editor.library_updated", { date });
  }

  render() {
    return html`<div
        class="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editor-library-title"
        @click=${(e: Event) => {
          if (e.target === e.currentTarget) this.emit("close-library");
        }}
      >
        <div
          class="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-lg border border-white/10 bg-[#0a1512] text-white"
        >
          <header
            class="flex flex-wrap items-center gap-3 border-b border-white/10 px-5 py-4"
          >
            <div class="min-w-0 flex-1">
              <h3
                id="editor-library-title"
                class="font-display text-xl font-bold"
              >
                ${translateText("map_editor.library_title")}
              </h3>
              <p class="mt-1 text-sm text-white/60">
                ${translateText("map_editor.library_intro")}
              </p>
            </div>
            <button
              class="inline-flex items-center gap-2 rounded-md bg-[linear-gradient(160deg,#10b981,#059669_60%,#047857)] px-4 py-2 text-sm font-bold text-white hover:brightness-110"
              @click=${() => this.emit("new-map")}
            >
              ${ICON_PLUS} ${translateText("map_editor.new_map")}
            </button>
            <button
              class="grid size-9 place-items-center rounded-md border border-white/10 text-white/70 hover:bg-white/5"
              aria-label=${translateText("map_editor.library_close")}
              @click=${() => this.emit("close-library")}
            >
              ${ICON_CLOSE}
            </button>
          </header>
          <div class="flex items-center gap-2 px-5 pt-3 text-sm">
            ${syncBadge(this.sync)}
            ${this.sync === "synced" || this.sync === "error"
              ? html`<button
                  class="text-emerald-300 underline-offset-2 hover:underline"
                  @click=${() => this.emit("sync-now")}
                >
                  ${translateText("map_editor.sync_now")}
                </button>`
              : nothing}
          </div>
          <div class="min-h-0 overflow-y-auto custom-scrollbar p-5">
            ${this.maps.length === 0
              ? html`<p class="py-10 text-center text-white/60">
                  ${translateText("map_editor.library_empty")}
                </p>`
              : html`<ul
                  class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]"
                >
                  ${this.maps.map((m) => this.renderMap(m))}
                </ul>`}
          </div>
        </div>
      </div>
      ${this.confirmDelete
        ? html`<confirm-dialog
            .message=${translateText("map_editor.library_delete_confirm", {
              name: this.confirmDelete.name,
            })}
            variant="warning"
            @confirm=${() => {
              const id = this.confirmDelete!.id;
              this.confirmDelete = null;
              this.emit("delete-map", id);
            }}
            @cancel=${() => (this.confirmDelete = null)}
          ></confirm-dialog>`
        : nothing}`;
  }

  private renderMap(m: LibraryMap) {
    const current = m.id === this.currentId;
    return html`<li
      class="flex flex-col overflow-hidden rounded-lg border ${current
        ? "border-emerald-700"
        : "border-white/10"} bg-black/30"
    >
      <button
        class="block"
        aria-label=${translateText("map_editor.library_open")}
        @click=${() => this.emit("open-map", m.id)}
      >
        ${m.thumbnail
          ? html`<img
              src=${m.thumbnail}
              alt=""
              class="aspect-[5/3] w-full object-contain bg-[#2c6292] [image-rendering:pixelated]"
            />`
          : html`<div class="aspect-[5/3] w-full bg-[#2c6292]"></div>`}
      </button>
      <div class="flex flex-1 flex-col gap-1 p-3">
        <div class="flex items-start gap-2">
          <h4 class="min-w-0 flex-1 break-words font-bold">${m.name}</h4>
          ${current
            ? html`<span
                class="shrink-0 rounded border border-emerald-800 px-1.5 text-[11px] font-bold text-emerald-300"
                >${translateText("map_editor.library_current")}</span
              >`
            : nothing}
          ${m.workshopId
            ? html`<span
                class="shrink-0 rounded border border-sky-800 px-1.5 text-[11px] font-bold text-sky-300"
                title=${translateText("map_editor.library_on_workshop_hint")}
                >${translateText("map_editor.library_on_workshop")}</span
              >`
            : nothing}
        </div>
        <p class="text-xs text-white/50 tabular-nums">
          ${m.width.toLocaleString()} × ${m.height.toLocaleString()} ·
          ${this.updatedLabel(m)}
        </p>
        <div class="mt-2 flex gap-2">
          <button
            class="flex-1 rounded-md bg-white/10 px-3 py-1.5 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"
            ?disabled=${current}
            @click=${() => this.emit("open-map", m.id)}
          >
            ${translateText("map_editor.library_open")}
          </button>
          <button
            class="grid size-8 place-items-center rounded-md border border-white/10 text-white/70 hover:text-white"
            aria-label=${translateText("map_editor.library_duplicate")}
            title=${translateText("map_editor.library_duplicate")}
            @click=${() => this.emit("duplicate-map", m.id)}
          >
            ${ICON_COPY}
          </button>
          <button
            class="grid size-8 place-items-center rounded-md border border-white/10 text-white/60 hover:text-red-300"
            aria-label=${translateText("map_editor.library_delete")}
            title=${translateText("map_editor.library_delete")}
            @click=${() => (this.confirmDelete = m)}
          >
            ${ICON_TRASH}
          </button>
        </div>
      </div>
    </li>`;
  }
}

/** Where the player's maps stand: on this device only, or with the account. */
export function syncBadge(sync: EditorSyncStatus) {
  const tone = {
    local: "text-white/60",
    "signed-out": "text-amber-300",
    syncing: "text-white/70",
    synced: "text-emerald-300",
    error: "text-amber-300",
  }[sync];
  return html`<span class="inline-flex items-center gap-1.5 ${tone}">
    ${sync === "syncing"
      ? html`<span
          class="size-3 rounded-full border-2 border-white/30 border-t-white animate-spin"
        ></span>`
      : sync === "synced"
        ? ICON_CLOUD_OK
        : ICON_CLOUD}
    ${translateText(`map_editor.sync_${sync.replace("-", "_")}`)}
  </span>`;
}

const icon = (path: ReturnType<typeof svg>, size = "size-4") =>
  html`<svg
    class=${size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    ${path}
  </svg>`;
const ICON_PLUS = icon(svg`<path d="M12 5v14M5 12h14"/>`);
const ICON_CLOSE = icon(svg`<path d="M6 6l12 12M18 6 6 18"/>`);
const ICON_COPY = icon(
  svg`<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/>`,
);
const ICON_TRASH = icon(
  svg`<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>`,
);
const ICON_CLOUD = icon(
  svg`<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z"/>`,
  "size-3.5",
);
const ICON_CLOUD_OK = icon(
  svg`<path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7Z"/><path d="m9.5 13.5 2 2 3.5-3.5"/>`,
  "size-3.5",
);
