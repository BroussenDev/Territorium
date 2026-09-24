import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { type MapCategory, type MapInfo, maps } from "../../../core/game/Game";
import {
  type ClanMapResponse,
  type ClanTerritoryContender,
  fetchClanMap,
} from "../../ClanApi";
import { terrainMapFileLoader } from "../../TerrainMapFileLoader";
import { getMapName, translateText } from "../../Utils";
import { renderLoadingSpinner } from "./ClanShared";

// Regions the board is grouped by, in map-picker order. A map sits under the
// first of these it belongs to; "featured" and "new" are not regions.
const REGIONS: readonly MapCategory[] = [
  "world",
  "continental",
  "europe",
  "asia",
  "north_america",
  "africa",
  "south_america",
  "oceania",
  "antarctica",
  "countries",
  "cosmic",
  "fictional",
  "arcade",
];

type Filter = "all" | "held" | "free" | "mine";

const FILTER_LABELS: Record<Filter, string> = {
  all: "clan_modal.territory_filter_all",
  held: "clan_modal.territory_filter_held",
  free: "clan_modal.territory_filter_free",
  mine: "clan_modal.territory_filter_mine",
};

interface Territory {
  map: MapInfo;
  holder: ClanTerritoryContender | null;
  contenders: ClanTerritoryContender[];
}

// A stable colour per clan, so a clan reads the same on every tile.
export function clanColor(tag: string): string {
  // FNV-1a: close tags ("NORD", "TRM1") still land far apart on the wheel.
  let h = 2166136261;
  for (const ch of tag) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `hsl(${h % 360} 70% 55%)`;
}

// Every map in the public rotation, plus any map a clan holds that has since
// left it, joined with who holds it.
export function buildTerritories(data: ClanMapResponse | null): Territory[] {
  const held = new Map((data?.territories ?? []).map((t) => [t.map, t]));
  return maps
    .filter((m) => m.multiplayerFrequency > 0 || held.has(m.type))
    .map((m) => {
      const t = held.get(m.type);
      return {
        map: m,
        holder: t?.holder ?? null,
        contenders: t?.contenders ?? [],
      };
    });
}

/**
 * The clan map: each game map is a territory, held by the clan with the most
 * public wins on it over the last 30 days. Clicking a held territory fires
 * `clan-select` with the holder's tag.
 */
@customElement("clan-map-view")
export class ClanMapView extends LitElement {
  @property({ type: Array }) myClanTags: string[] = [];

  @state() private data: ClanMapResponse | null = null;
  @state() private loading = true;
  @state() private failed = false;
  @state() private filter: Filter = "all";

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    void this.load();
  }

  private async load() {
    this.loading = true;
    this.failed = false;
    const data = await fetchClanMap();
    this.loading = false;
    if (data === false) {
      this.failed = true;
      return;
    }
    this.data = data;
  }

  private selectClan(tag: string) {
    this.dispatchEvent(
      new CustomEvent("clan-select", {
        detail: { tag },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private isMine(t: Territory): boolean {
    return t.holder !== null && this.myClanTags.includes(t.holder.tag);
  }

  private passesFilter(t: Territory): boolean {
    switch (this.filter) {
      case "held":
        return t.holder !== null;
      case "free":
        return t.holder === null;
      case "mine":
        return this.isMine(t);
      default:
        return true;
    }
  }

  render() {
    if (this.loading && !this.data) return renderLoadingSpinner();
    if (this.failed) {
      return html`<p class="text-red-400 text-sm text-center py-8">
        ${translateText("clan_modal.error_loading")}
      </p>`;
    }
    const territories = buildTerritories(this.data);
    const heldCount = territories.filter((t) => t.holder).length;
    const mineCount = territories.filter((t) => this.isMine(t)).length;
    const shown = territories.filter((t) => this.passesFilter(t));

    return html`
      <div class="space-y-6">
        ${this.renderSummary(territories.length, heldCount, mineCount)}
        ${this.renderFilters()}
        ${shown.length === 0
          ? html`<p class="text-white/40 text-sm text-center py-8">
              ${translateText("clan_modal.territory_empty_filter")}
            </p>`
          : REGIONS.map((region) =>
              this.renderRegion(
                region,
                shown.filter(
                  (t) =>
                    REGIONS.find((r) => t.map.categories.includes(r)) ===
                    region,
                ),
              ),
            )}
      </div>
    `;
  }

  private renderSummary(total: number, held: number, mine: number) {
    const leaders = (this.data?.clans ?? []).slice(0, 5);
    return html`
      <section
        class="grid gap-5 lg:grid-cols-[1fr_20rem] rounded-2xl border border-emerald-400/15 bg-[linear-gradient(115deg,#0f2a21_0%,transparent_70%)] p-5"
      >
        <div class="space-y-3">
          <h3 class="font-display text-xl font-bold text-white">
            ${translateText("clan_modal.territory_title")}
          </h3>
          <p class="text-white/60 text-sm max-w-prose">
            ${translateText("clan_modal.territory_explain")}
          </p>
          <div class="flex flex-wrap gap-3 pt-1">
            <div class="rounded-xl bg-white/5 border border-white/10 px-4 py-2">
              <div class="text-2xl font-bold text-white">
                ${held}<span class="text-white/30 text-base"> / ${total}</span>
              </div>
              <div class="text-white/40 text-xs">
                ${translateText("clan_modal.territory_held_label")}
              </div>
            </div>
            ${this.myClanTags.length > 0
              ? html`<div
                  class="rounded-xl bg-emerald-500/10 border border-emerald-400/30 px-4 py-2"
                >
                  <div class="text-2xl font-bold text-emerald-300">${mine}</div>
                  <div class="text-emerald-200/60 text-xs">
                    ${translateText("clan_modal.territory_mine_label")}
                  </div>
                </div>`
              : nothing}
          </div>
        </div>
        <div>
          <h4
            class="text-xs font-bold text-white/40 uppercase tracking-wider mb-2"
          >
            ${translateText("clan_modal.territory_leaders")}
          </h4>
          ${leaders.length === 0
            ? html`<p class="text-white/40 text-sm">
                ${translateText("clan_modal.territory_no_leaders")}
              </p>`
            : html`<ol class="space-y-1.5">
                ${leaders.map(
                  (c, i) =>
                    html`<li>
                      <button
                        class="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5 transition-colors"
                        @click=${() => this.selectClan(c.tag)}
                      >
                        <span class="w-4 text-white/40 text-xs font-bold"
                          >${i + 1}</span
                        >
                        <span
                          class="w-3 h-3 rounded-sm shrink-0"
                          style="background:${clanColor(c.tag)}"
                        ></span>
                        <span class="font-mono text-xs font-bold text-white"
                          >[${c.tag}]</span
                        >
                        <span
                          class="flex-1 min-w-0 truncate text-sm text-white/70"
                          >${c.name}</span
                        >
                        <span class="text-xs text-white/50 shrink-0"
                          >${translateText("clan_modal.territory_count", {
                            count: c.territories,
                          })}</span
                        >
                      </button>
                    </li>`,
                )}
              </ol>`}
        </div>
      </section>
    `;
  }

  private renderFilters() {
    const filters: Filter[] =
      this.myClanTags.length > 0
        ? ["all", "held", "free", "mine"]
        : ["all", "held", "free"];
    return html`<div class="flex flex-wrap gap-2" role="group">
      ${filters.map(
        (f) =>
          html`<button
            aria-pressed=${this.filter === f}
            @click=${() => (this.filter = f)}
            class="px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ${this
              .filter === f
              ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
              : "bg-white/5 border-white/10 text-white/50 hover:text-white"}"
          >
            ${translateText(FILTER_LABELS[f])}
          </button>`,
      )}
    </div>`;
  }

  private renderRegion(region: MapCategory, list: Territory[]) {
    if (list.length === 0) return nothing;
    const held = list.filter((t) => t.holder).length;
    return html`<section class="space-y-3" data-region=${region}>
      <h4 class="flex items-baseline gap-2 text-sm font-bold text-white/70">
        ${translateText(`map_categories.${region}`)}
        <span class="text-xs font-medium text-white/30"
          >${held} / ${list.length}</span
        >
      </h4>
      <div
        class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3"
      >
        ${list.map((t) => this.renderTile(t))}
      </div>
    </section>`;
  }

  private renderTile(t: Territory) {
    const name = getMapName(t.map.type) ?? t.map.type;
    const holder = t.holder;
    const color = holder ? clanColor(holder.tag) : null;
    const mine = this.isMine(t);
    const tooltip = holder
      ? t.contenders
          .map(
            (c, i) =>
              `${i + 1}. [${c.tag}] ${translateText("clan_modal.territory_wins", { count: c.wins })}`,
          )
          .join("\n")
      : translateText("clan_modal.territory_unclaimed");
    return html`<button
      type="button"
      data-map=${t.map.type}
      title=${`${name}\n${tooltip}`}
      ?disabled=${!holder}
      @click=${() => holder && this.selectClan(holder.tag)}
      class="group relative aspect-[4/3] overflow-hidden rounded-xl border-2 bg-black/40 text-left transition-transform enabled:hover:-translate-y-0.5 ${mine
        ? "ring-2 ring-emerald-300/70 ring-offset-2 ring-offset-surface"
        : ""}"
      style="border-color:${color ?? "rgb(255 255 255 / 0.08)"}"
    >
      <img
        src=${terrainMapFileLoader.getMapData(t.map.type).webpPath}
        alt=""
        loading="lazy"
        draggable="false"
        class="absolute inset-0 w-full h-full object-cover ${holder
          ? ""
          : "grayscale opacity-40"}"
      />
      ${color
        ? html`<div
            class="absolute inset-0 mix-blend-color opacity-60"
            style="background:${color}"
          ></div>`
        : nothing}
      <div
        class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-2.5 pt-6 pb-2"
      >
        <div class="text-white text-xs font-bold truncate">${name}</div>
        ${holder
          ? html`<div class="flex items-center gap-1.5 text-[11px]">
              <span class="font-mono font-bold" style="color:${color}"
                >[${holder.tag}]</span
              >
              <span class="text-white/60 truncate"
                >${translateText("clan_modal.territory_wins", {
                  count: holder.wins,
                })}</span
              >
            </div>`
          : html`<div class="text-[11px] text-white/40">
              ${translateText("clan_modal.territory_unclaimed")}
            </div>`}
      </div>
    </button>`;
  }
}
