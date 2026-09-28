import { html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { assetUrl } from "../../core/AssetUrls";
import { GameMapType } from "../../core/game/Game";
import {
  decodeCountryIds,
  isPlayableCountry,
  NationsCountry,
} from "../../core/game/NationsMode";
import { ClientInfo } from "../../core/Schemas";
import { terrainMapFileLoader } from "../TerrainMapFileLoader";
import { translateText } from "../Utils";

// Pixels of the picker per map tile side: the 4108x1948 world is drawn at a
// quarter of its size.
const SCALE = 4;

const CONTINENTS = [
  "europe",
  "asia",
  "africa",
  "north_america",
  "south_america",
  "oceania",
] as const;
type Continent = (typeof CONTINENTS)[number];

// Continent of each country of the giant world map, by manifest flag code.
const CONTINENT_FLAGS: Record<Continent, string[]> = {
  europe: [
    "tr",
    "de",
    "fr",
    "es",
    "it",
    "gb",
    "ie",
    "pl",
    "gr",
    "bg",
    "rs",
    "ro",
    "hu",
    "ua",
    "se",
    "no",
    "Sami flag",
    "fi",
    "ru",
    "by",
    "is",
  ],
  asia: [
    "ge",
    "iq",
    "sy",
    "sa",
    "ye",
    "ae",
    "ir",
    "pk",
    "af",
    "kz",
    "tm",
    "Siberia",
    "in",
    "bd",
    "np",
    "cn",
    "kp",
    "kr",
    "jp",
    "mn",
    "id",
    "vn",
    "mm",
    "th",
  ],
  africa: [
    "tn",
    "ly",
    "eg",
    "ma",
    "dz",
    "sd",
    "so",
    "et",
    "mr",
    "td",
    "ne",
    "ng",
    "lr",
    "cf",
    "cd",
    "za",
    "mg",
    "mz",
    "tz",
    "ml",
    "na",
    "ao",
    "zw",
    "ga",
  ],
  north_america: [
    "ni",
    "mx",
    "us",
    "Texas",
    "California",
    "Utah",
    "Quebec",
    "newfoundlandandlabrador",
    "ca",
    "Alaska",
    "Nunavut",
    "Yukon",
    "gl",
    "Washington",
    "Kansas",
    "Mississippi",
    "Montana",
    "britishcolumbia",
    "alberta",
    "saskatchewan",
    "manitoba",
    "Massachusetts",
    "Minnesota",
    "Michigan",
    "northwestterritories",
  ],
  south_america: ["br", "amazonas", "ar", "cl", "pe", "co", "ve", "bo"],
  oceania: ["pg", "au", "Australian Aboriginal Flag", "nz"],
};

const CONTINENT_OF = new Map<string, Continent>(
  CONTINENTS.flatMap((c) => CONTINENT_FLAGS[c].map((f) => [f, c] as const)),
);

interface PickerCountry extends NationsCountry {
  index: number;
  name: string;
  flag?: string;
  continent?: Continent;
  /** Share of the playable world, in percent. */
  share: number;
}

interface PickerData {
  width: number;
  height: number;
  /** Per picker pixel: country index + 1, or 0. */
  pixels: Uint8Array;
  countries: PickerCountry[];
}

let dataPromise: Promise<PickerData> | null = null;

// Loaded once per page: the giant world map's countries, downsampled so the
// smallest countries still own at least one pixel.
function loadPickerData(): Promise<PickerData> {
  dataPromise ??= (async () => {
    const files = terrainMapFileLoader.getMapData(GameMapType.GiantWorldMap);
    const [bin, json, manifest] = await Promise.all([
      files.countriesBin!(),
      files.countriesJson!(),
      files.manifest(),
    ]);
    const ids = decodeCountryIds(bin, json.width * json.height);
    const total = json.countries
      .filter((c) => c.playable)
      .reduce((sum, c) => sum + c.tiles, 0);
    const countries = json.countries.map((c, index) => ({
      ...c,
      index,
      name: manifest.nations[index]?.name ?? "",
      flag: manifest.nations[index]?.flag,
      continent: CONTINENT_OF.get(manifest.nations[index]?.flag ?? ""),
      share: (c.tiles / total) * 100,
    }));
    const width = Math.ceil(json.width / SCALE);
    const height = Math.ceil(json.height / SCALE);
    const pixels = new Uint8Array(width * height);
    for (let y = 0; y < json.height; y++) {
      const row = Math.floor(y / SCALE) * width;
      for (let x = 0; x < json.width; x++) {
        const id = ids[y * json.width + x];
        if (id === 0 || !isPlayableCountry(json.countries, id - 1)) continue;
        const p = row + Math.floor(x / SCALE);
        const current = pixels[p];
        if (
          current === 0 ||
          json.countries[id - 1].tiles < json.countries[current - 1].tiles
        ) {
          pixels[p] = id;
        }
      }
    }
    return { width, height, pixels, countries };
  })();
  dataPromise.catch(() => (dataPromise = null));
  return dataPromise;
}

function countryColor(index: number): [number, number, number] {
  // Golden-angle hues keep neighbours apart without a hand-made palette.
  const h = ((index * 137.508) % 360) / 60;
  const s = 0.55;
  const l = 0.5;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function formatShare(share: number): string {
  return share >= 1 ? share.toFixed(1) : share.toFixed(2);
}

/**
 * Nations lobbies: the world map to pick a country on. Countries other
 * players hold are greyed out; the player's own glows. Picking dispatches
 * `pick-nation` with the manifest index, or null to release.
 */
@customElement("nations-picker")
export class NationsPicker extends LitElement {
  @property({ attribute: false }) clients: ClientInfo[] = [];
  @property({ type: String }) currentClientID = "";

  @state() private data: PickerData | null = null;
  @state() private failed = false;
  @state() private hovered: number | null = null;
  @state() private tooltip: { x: number; y: number } | null = null;
  @state() private search = "";
  @state() private continent: Continent | null = null;

  @query("canvas") private canvas?: HTMLCanvasElement;
  // What the canvas shows, so moving the tooltip doesn't repaint it.
  private drawnKey = "";

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    loadPickerData()
      .then((data) => (this.data = data))
      .catch((e) => {
        console.error("nations picker: could not load the countries", e);
        this.failed = true;
      });
  }

  private get holders(): Map<number, ClientInfo> {
    const holders = new Map<number, ClientInfo>();
    for (const c of this.clients) {
      if (c.nation !== undefined && !c.spectator) holders.set(c.nation, c);
    }
    return holders;
  }

  private get myNation(): number | undefined {
    return this.clients.find((c) => c.clientID === this.currentClientID)
      ?.nation;
  }

  protected updated(): void {
    this.draw();
  }

  private draw() {
    const data = this.data;
    const canvas = this.canvas;
    if (!data || !canvas) return;
    if (canvas.width !== data.width) {
      canvas.width = data.width;
      canvas.height = data.height;
      this.drawnKey = "";
    }
    const holders = this.holders;
    const mine = this.myNation;
    const key = `${canvas.width}|${this.hovered}|${mine}|${this.continent}|${[...holders.keys()].join(",")}`;
    if (key === this.drawnKey) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    this.drawnKey = key;
    const colors = data.countries.map((c) => {
      const holder = holders.get(c.index);
      if (c.index === mine) return [250, 204, 21, 255];
      if (holder !== undefined) return [70, 70, 78, 235];
      if (this.continent !== null && c.continent !== this.continent) {
        return [40, 40, 48, 110];
      }
      const [r, g, b] = countryColor(c.index);
      return c.index === this.hovered
        ? [
            Math.min(255, r + 70),
            Math.min(255, g + 70),
            Math.min(255, b + 70),
            255,
          ]
        : [r, g, b, 200];
    });
    const image = ctx.createImageData(data.width, data.height);
    const px = image.data;
    for (let i = 0; i < data.pixels.length; i++) {
      const id = data.pixels[i];
      if (id === 0) continue;
      const color = colors[id - 1];
      px[i * 4] = color[0];
      px[i * 4 + 1] = color[1];
      px[i * 4 + 2] = color[2];
      px[i * 4 + 3] = color[3];
    }
    ctx.putImageData(image, 0, 0);
  }

  private countryAt(e: MouseEvent): number | null {
    const data = this.data;
    const canvas = this.canvas;
    if (!data || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * data.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * data.height);
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return null;
    const id = data.pixels[y * data.width + x];
    return id === 0 ? null : id - 1;
  }

  private onMove = (e: MouseEvent) => {
    const country = this.countryAt(e);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    this.hovered = country;
    this.tooltip =
      country === null
        ? null
        : { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  private onLeave = () => {
    this.hovered = null;
    this.tooltip = null;
  };

  private onClick = (e: MouseEvent) => {
    const country = this.countryAt(e);
    if (country !== null) this.pick(country);
  };

  private pick(country: number | null) {
    if (country !== null) {
      const holder = this.holders.get(country);
      if (holder !== undefined && holder.clientID !== this.currentClientID) {
        return;
      }
    }
    this.dispatchEvent(
      new CustomEvent("pick-nation", {
        detail: { nation: country },
        bubbles: true,
        composed: true,
      }),
    );
  }

  private renderFlag(country: PickerCountry, size = "h-4") {
    return country.flag
      ? html`<img
          src=${assetUrl(`flags/${country.flag}.svg`)}
          alt=""
          class="${size} w-auto rounded-sm shadow"
        />`
      : nothing;
  }

  private renderTooltip() {
    const data = this.data;
    if (!data || this.hovered === null || this.tooltip === null) {
      return nothing;
    }
    const country = data.countries[this.hovered];
    const holder = this.holders.get(country.index);
    const left = this.tooltip.x > (this.canvas?.clientWidth ?? 0) / 2;
    return html`<div
      class="pointer-events-none absolute z-10 min-w-44 rounded-lg border border-white/15 bg-black/85 px-3 py-2 text-xs text-white shadow-xl"
      style="top:${this.tooltip.y + 14}px;${left
        ? `right:calc(100% - ${this.tooltip.x - 14}px)`
        : `left:${this.tooltip.x + 14}px`}"
    >
      <div class="flex items-center gap-2 text-sm font-bold">
        ${this.renderFlag(country)} ${country.name}
      </div>
      <div class="mt-1 text-white/70">
        ${translateText("nations_lobby.capital", {
          capital: country.capital ?? "",
        })}
      </div>
      <div class="text-white/70">
        ${translateText("nations_lobby.size", {
          share: formatShare(country.share),
        })}
      </div>
      <div
        class="mt-1 font-semibold ${holder
          ? "text-white/50"
          : "text-emerald-300"}"
      >
        ${holder
          ? translateText("nations_lobby.taken_by", {
              name: holder.username,
            })
          : translateText("nations_lobby.free")}
      </div>
    </div>`;
  }

  private renderSearch() {
    const data = this.data;
    if (!data) return nothing;
    const query = this.search.trim().toLowerCase();
    // Without a query, a picked continent lists all of its countries.
    if (query === "" && this.continent === null) return nothing;
    const holders = this.holders;
    const matches = data.countries
      .filter(
        (c) =>
          isPlayableCountry(data.countries, c.index) &&
          (this.continent === null || c.continent === this.continent) &&
          c.name.toLowerCase().includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, query === "" ? undefined : 8);
    return html`<ul
      class="mt-2 max-h-48 overflow-y-auto rounded-lg border border-white/10 bg-black/40"
    >
      ${matches.length === 0
        ? html`<li class="px-3 py-2 text-xs text-white/50">
            ${translateText("nations_lobby.no_match")}
          </li>`
        : matches.map((c) => {
            const holder = holders.get(c.index);
            const takenByOther =
              holder !== undefined && holder.clientID !== this.currentClientID;
            return html`<li>
              <button
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                ?disabled=${takenByOther}
                @click=${() => {
                  this.pick(c.index);
                  this.search = "";
                }}
              >
                ${this.renderFlag(c)}
                <span class="flex-1 truncate">${c.name}</span>
                <span class="text-xs text-white/50"
                  >${formatShare(c.share)} %</span
                >
              </button>
            </li>`;
          })}
    </ul>`;
  }

  private renderMine() {
    const data = this.data;
    const mine = this.myNation;
    if (!data || mine === undefined) {
      return html`<p class="text-sm text-white/70">
        ${translateText("nations_lobby.none_picked")}
      </p>`;
    }
    const country = data.countries[mine];
    return html`<div class="flex items-center gap-3">
      ${this.renderFlag(country, "h-8")}
      <div class="min-w-0 flex-1">
        <div class="truncate text-base font-bold text-yellow-300">
          ${country.name}
        </div>
        <div class="text-xs text-white/60">
          ${translateText("nations_lobby.capital", {
            capital: country.capital ?? "",
          })}
          ·
          ${translateText("nations_lobby.size", {
            share: formatShare(country.share),
          })}
        </div>
      </div>
      <button
        class="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
        @click=${() => this.pick(null)}
      >
        ${translateText("nations_lobby.release")}
      </button>
    </div>`;
  }

  private renderContinents() {
    const chip = (continent: Continent | null, label: string) =>
      html`<button
        type="button"
        class="rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${this
          .continent === continent
          ? "border-emerald-400 bg-emerald-500/25 text-white"
          : "border-white/15 bg-black/30 text-white/70 hover:bg-white/10"}"
        @click=${() => (this.continent = continent)}
      >
        ${label}
      </button>`;
    return html`<div class="flex flex-wrap gap-1.5">
      ${chip(null, translateText("nations_lobby.continent_all"))}
      ${CONTINENTS.map((c) =>
        chip(c, translateText(`nations_lobby.continent_${c}`)),
      )}
    </div>`;
  }

  render() {
    if (this.failed) {
      return html`<p class="text-sm text-red-300">
        ${translateText("nations_lobby.load_failed")}
      </p>`;
    }
    const thumbnail = terrainMapFileLoader.getMapData(
      GameMapType.GiantWorldMap,
    ).webpPath;
    return html`<section
      class="rounded-xl border border-white/10 bg-white/5 p-4 space-y-3"
    >
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h3 class="text-base font-bold text-white">
          ${translateText("nations_lobby.title")}
        </h3>
        <p class="text-xs text-white/60">
          ${translateText("nations_lobby.hint")}
        </p>
      </div>
      ${this.renderContinents()}
      <div
        class="relative w-full overflow-visible rounded-lg bg-[#0b2a45]"
        style="aspect-ratio: 4108 / 1948"
      >
        <img
          src=${thumbnail}
          alt=""
          class="absolute inset-0 h-full w-full rounded-lg object-fill opacity-60"
        />
        ${this.data
          ? html`<canvas
              class="absolute inset-0 h-full w-full cursor-pointer rounded-lg [image-rendering:pixelated]"
              @mousemove=${this.onMove}
              @mouseleave=${this.onLeave}
              @click=${this.onClick}
            ></canvas>`
          : html`<div class="absolute inset-0 grid place-items-center">
              <span
                class="size-10 rounded-full border-4 border-white/20 border-t-white animate-spin"
              ></span>
            </div>`}
        ${this.renderTooltip()}
      </div>
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="rounded-lg bg-black/30 p-3">${this.renderMine()}</div>
        <div>
          <input
            type="search"
            .value=${this.search}
            @input=${(e: InputEvent) =>
              (this.search = (e.target as HTMLInputElement).value)}
            placeholder=${translateText("nations_lobby.search")}
            class="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-emerald-400 focus:outline-none"
          />
          ${this.renderSearch()}
        </div>
      </div>
    </section>`;
  }
}
