import { html, nothing, svg } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  type CommunityMap,
  communityMapThumbnail,
  deleteCommunityMap,
  listCommunityMaps,
  MAP_REPORT_REASONS,
  type MapReportReason,
  myCommunityMaps,
  reportCommunityMap,
} from "./CommunityMapsApi";
import { BaseModal } from "./components/BaseModal";
import { modalHeader } from "./components/ui/ModalHeader";
import type { HostLobbyModal } from "./HostLobbyModal";
import { gameOpenOrExplain } from "./ServerStatusClient";
import type { SinglePlayerModal } from "./SinglePlayerModal";
import { showToast, translateText } from "./Utils";

// The community maps gallery (its own page): the maps players made in the map
// editor and our moderators approved, to play in solo or in a private game,
// and the player's own maps with where their review stands.

type Tab = "gallery" | "mine";

@customElement("community-maps-modal")
export class CommunityMapsModal extends BaseModal {
  protected routerName = "community-maps";

  @state() private tab: Tab = "gallery";
  @state() private sort: "new" | "popular" = "new";
  @state() private query = "";
  @state() private maps: CommunityMap[] = [];
  @state() private total = 0;
  @state() private page = 1;
  @state() private loading = false;
  @state() private failed = false;
  @state() private mine: CommunityMap[] | null | "signed-out" = null;
  @state() private reporting: string | null = null;
  @state() private confirmDelete: CommunityMap | null = null;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    super();
    this.id = "page-community-maps";
  }

  createRenderRoot() {
    return this;
  }

  protected override onOpen(args?: Record<string, unknown>): void {
    this.tab = args?.tab === "mine" ? "mine" : "gallery";
    void this.load(true);
    if (this.tab === "mine") void this.loadMine();
  }

  private async load(reset: boolean): Promise<void> {
    if (reset) this.page = 1;
    this.loading = true;
    this.failed = false;
    const page = await listCommunityMaps({
      sort: this.sort,
      page: this.page,
      q: this.query,
    });
    this.loading = false;
    if (page === null) {
      this.failed = true;
      return;
    }
    this.total = page.total;
    this.maps = reset ? page.maps : [...this.maps, ...page.maps];
  }

  private async loadMine(): Promise<void> {
    this.mine = null;
    const mine = await myCommunityMaps();
    this.mine = mine ?? "signed-out";
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    if (tab === "mine") void this.loadMine();
  }

  private playSolo(map: CommunityMap): void {
    if (!gameOpenOrExplain("solo")) return;
    (
      document.querySelector("single-player-modal") as SinglePlayerModal | null
    )?.openWithCustomMap(
      { id: map.id, name: map.name },
      communityMapThumbnail(map.id),
      true,
    );
  }

  private hostLobby(map: CommunityMap): void {
    if (!gameOpenOrExplain("private")) return;
    (document.querySelector("host-lobby-modal") as HostLobbyModal | null)?.open(
      {
        customMap: {
          ref: { id: map.id, name: map.name },
          thumbnail: communityMapThumbnail(map.id),
        },
      },
    );
  }

  private async report(map: CommunityMap, reason: MapReportReason) {
    this.reporting = null;
    const ok = await reportCommunityMap(map.id, reason);
    showToast(
      translateText(
        ok ? "community_maps.reported" : "community_maps.report_failed",
      ),
      ok ? "green" : "red",
    );
  }

  private async deleteMap(map: CommunityMap) {
    this.confirmDelete = null;
    const ok = await deleteCommunityMap(map.id);
    showToast(
      translateText(
        ok ? "community_maps.deleted" : "community_maps.delete_failed",
      ),
      ok ? "green" : "red",
    );
    if (ok) void this.loadMine();
  }

  protected renderBody() {
    return html`
      <div class="flex flex-col h-full min-h-0">
        ${modalHeader({
          title: translateText("community_maps.title"),
          onBack: () => this.close(),
          ariaLabel: translateText("common.back"),
          rightContent: html`<button
            class="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
            @click=${() => window.showPage?.("page-map-editor")}
          >
            ${ICON_EDIT} ${translateText("community_maps.open_editor")}
          </button>`,
        })}
        <div class="flex gap-2 px-4 pt-3 lg:px-6">
          ${(["gallery", "mine"] as const).map(
            (t) =>
              html`<button
                class="rounded-md px-4 py-2 text-sm font-semibold ${this.tab ===
                t
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-800"
                  : "text-white/70 border border-transparent hover:bg-white/5"}"
                aria-pressed=${this.tab === t}
                @click=${() => this.setTab(t)}
              >
                ${translateText(`community_maps.tab_${t}`)}
              </button>`,
          )}
        </div>
        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 lg:p-6">
          ${this.tab === "gallery" ? this.renderGallery() : this.renderMine()}
        </div>
      </div>
      ${this.confirmDelete
        ? html`<confirm-dialog
            .message=${translateText("community_maps.delete_confirm", {
              name: this.confirmDelete.name,
            })}
            variant="warning"
            @confirm=${() => void this.deleteMap(this.confirmDelete!)}
            @cancel=${() => (this.confirmDelete = null)}
          ></confirm-dialog>`
        : nothing}
    `;
  }

  private renderGallery() {
    return html`
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <input
          id="community-maps-search"
          class="min-w-0 flex-1 rounded-md border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-white/40"
          placeholder=${translateText("community_maps.search")}
          .value=${this.query}
          @input=${(e: Event) => {
            this.query = (e.target as HTMLInputElement).value;
            if (this.searchTimer !== null) clearTimeout(this.searchTimer);
            this.searchTimer = setTimeout(() => void this.load(true), 300);
          }}
        />
        <div class="flex rounded-md border border-white/10 overflow-hidden">
          ${(["new", "popular"] as const).map(
            (s) =>
              html`<button
                class="px-3 py-2 text-sm font-semibold ${this.sort === s
                  ? "bg-white/10 text-white"
                  : "text-white/60 hover:text-white"}"
                aria-pressed=${this.sort === s}
                @click=${() => {
                  this.sort = s;
                  void this.load(true);
                }}
              >
                ${translateText(`community_maps.sort_${s}`)}
              </button>`,
          )}
        </div>
      </div>
      ${this.failed
        ? html`<p class="py-10 text-center text-white/60">
            ${translateText("community_maps.load_failed")}
          </p>`
        : this.maps.length === 0 && !this.loading
          ? html`<div
              class="py-12 flex flex-col items-center gap-3 text-center"
            >
              <p class="text-white/70">
                ${translateText(
                  this.query
                    ? "community_maps.no_match"
                    : "community_maps.empty",
                )}
              </p>
              <button
                class="rounded-md bg-brand hover:bg-brand-light px-4 py-2 text-sm font-bold text-white"
                @click=${() => window.showPage?.("page-map-editor")}
              >
                ${translateText("community_maps.make_first")}
              </button>
            </div>`
          : html`<div
              class="grid gap-4 grid-cols-[repeat(auto-fill,minmax(250px,1fr))]"
            >
              ${this.maps.map((m) => this.renderCard(m))}
            </div>`}
      ${this.loading
        ? html`<div class="flex justify-center py-6">
            <span
              class="size-8 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin"
            ></span>
          </div>`
        : this.maps.length < this.total
          ? html`<div class="flex justify-center py-6">
              <button
                class="rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                @click=${() => {
                  this.page++;
                  void this.load(false);
                }}
              >
                ${translateText("community_maps.more")}
              </button>
            </div>`
          : nothing}
    `;
  }

  private details(m: CommunityMap): string {
    return translateText("community_maps.details", {
      w: m.width.toLocaleString(),
      h: m.height.toLocaleString(),
      nations: m.nations,
      plays: m.plays,
    });
  }

  private renderCard(m: CommunityMap) {
    return html`<article
      class="relative flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#0a1512]"
    >
      <img
        src=${communityMapThumbnail(m.id)}
        alt=""
        loading="lazy"
        class="aspect-[5/3] w-full object-contain bg-[#2c6292]"
      />
      <div class="flex flex-1 flex-col gap-1 p-3">
        <h3 class="font-display text-base font-bold text-white break-words">
          ${m.name}
        </h3>
        ${m.author !== null
          ? html`<p class="text-xs text-white/55">
              ${translateText("community_maps.by", { author: m.author })}
            </p>`
          : null}
        <p class="text-xs text-white/45 tabular-nums">${this.details(m)}</p>
        <div class="mt-2 flex gap-2">
          <button
            class="flex-1 rounded-md bg-[linear-gradient(160deg,#10b981,#059669_60%,#047857)] px-3 py-2 text-sm font-bold text-white hover:brightness-110"
            @click=${() => this.playSolo(m)}
          >
            ${translateText("community_maps.play_solo")}
          </button>
          <button
            class="flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
            @click=${() => this.hostLobby(m)}
          >
            ${translateText("community_maps.host")}
          </button>
          <button
            class="grid size-9 place-items-center rounded-md border border-white/10 text-white/50 hover:text-red-300"
            aria-label=${translateText("community_maps.report")}
            title=${translateText("community_maps.report")}
            @click=${() =>
              (this.reporting = this.reporting === m.id ? null : m.id)}
          >
            ${ICON_FLAG}
          </button>
        </div>
        ${this.reporting === m.id
          ? html`<div
              class="mt-2 flex flex-col gap-1 rounded-md border border-white/10 bg-black/40 p-2"
            >
              <span class="text-xs text-white/60"
                >${translateText("community_maps.report_why")}</span
              >
              ${MAP_REPORT_REASONS.map(
                (r) =>
                  html`<button
                    class="rounded px-2 py-1 text-left text-sm text-white hover:bg-white/10"
                    @click=${() => void this.report(m, r)}
                  >
                    ${translateText(`community_maps.reason_${r}`)}
                  </button>`,
              )}
            </div>`
          : nothing}
      </div>
    </article>`;
  }

  private renderMine() {
    if (this.mine === null) {
      return html`<div class="flex justify-center py-10">
        <span
          class="size-8 rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin"
        ></span>
      </div>`;
    }
    if (this.mine === "signed-out") {
      return html`<p class="py-10 text-center text-white/70">
        ${translateText("community_maps.sign_in")}
      </p>`;
    }
    if (this.mine.length === 0) {
      return html`<div
        class="py-12 flex flex-col items-center gap-3 text-center"
      >
        <p class="text-white/70">
          ${translateText("community_maps.mine_empty")}
        </p>
        <button
          class="rounded-md bg-brand hover:bg-brand-light px-4 py-2 text-sm font-bold text-white"
          @click=${() => window.showPage?.("page-map-editor")}
        >
          ${translateText("community_maps.open_editor")}
        </button>
      </div>`;
    }
    const chip = {
      pending: "border-amber-700/70 text-amber-300",
      approved: "border-emerald-800 text-emerald-300",
      rejected: "border-red-800 text-red-300",
    };
    return html`<ul class="flex flex-col gap-3">
      ${this.mine.map(
        (m) =>
          html`<li
            class="flex flex-col sm:flex-row gap-3 rounded-lg border border-white/10 bg-[#0a1512] p-3"
          >
            <img
              src=${communityMapThumbnail(m.id)}
              alt=""
              class="w-full sm:w-40 aspect-[5/3] object-contain rounded-md bg-[#2c6292]"
            />
            <div class="flex-1 min-w-0 flex flex-col gap-1">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="font-display font-bold text-white break-words">
                  ${m.name}
                </h3>
                <span
                  class="rounded border px-1.5 text-[11px] font-bold ${chip[
                    m.status
                  ]}"
                  >${translateText(`community_maps.status_${m.status}`)}</span
                >
              </div>
              <p class="text-xs text-white/45 tabular-nums">
                ${this.details(m)}
              </p>
              ${m.status === "rejected" && m.reason
                ? html`<p class="text-sm text-red-300">
                    ${translateText("community_maps.rejected_because", {
                      reason: m.reason,
                    })}
                  </p>`
                : m.status === "pending"
                  ? html`<p class="text-sm text-white/60">
                      ${translateText("community_maps.pending_note")}
                    </p>`
                  : nothing}
            </div>
            <div class="flex sm:flex-col gap-2 shrink-0">
              ${m.status === "approved"
                ? html`<button
                    class="rounded-md bg-brand hover:bg-brand-light px-3 py-2 text-sm font-bold text-white"
                    @click=${() => this.playSolo(m)}
                  >
                    ${translateText("community_maps.play_solo")}
                  </button>`
                : nothing}
              <button
                class="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-white/70 hover:text-red-300"
                @click=${() => (this.confirmDelete = m)}
              >
                ${translateText("community_maps.delete")}
              </button>
            </div>
          </li>`,
      )}
    </ul>`;
  }
}

const ICON_EDIT = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  ${svg`<path d="M9 6.75 3.75 4.5v12.75L9 19.5m0-12.75 6-2.25m-6 2.25v12.75m6-15 5.25 2.25v4.5M15 4.5v6m-6 9 3.75-1.5m5.25-3.75 2.25 2.25-4.5 4.5H15v-2.25l4.5-4.5Z"/>`}
</svg>`;
const ICON_FLAG = html`<svg
  class="size-4"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
>
  ${svg`<path d="M5 21V4M5 4h12l-2 4 2 4H5"/>`}
</svg>`;
