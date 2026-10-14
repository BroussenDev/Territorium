import { html, LitElement, svg } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import {
  GRAPHICS_QUALITIES,
  type GraphicsQuality,
  UserSettings,
} from "../../core/game/UserSettings";
import {
  type BenchmarkResult,
  chipName,
  runGraphicsBenchmark,
} from "../render/gl/GraphicsBenchmark";
import { translateText } from "../Utils";

// Estimates above this read as "more than": a frame rate past what any
// display shows says nothing more.
const FPS_SHOWN_MAX = 240;

/**
 * The graphics quality picker with its performance test: a short animated
 * scene measures the graphics chip, then each level shows the frame rate to
 * expect in a game, and the recommended one is picked.
 *
 * Part of the first-launch setup (where the test runs as soon as the step
 * opens) and of Settings > Graphics (where the player starts it).
 */
@customElement("graphics-check")
export class GraphicsCheck extends LitElement {
  /** Starts the test as soon as the element is shown. */
  @property({ type: Boolean }) autostart = false;
  @state() private running = false;
  @state() private progress = 0;
  @state() private result: BenchmarkResult | null = null;
  @state() private quality: GraphicsQuality;
  @query("canvas") private canvas!: HTMLCanvasElement;

  private readonly userSettings = new UserSettings();

  constructor() {
    super();
    this.quality = this.userSettings.graphicsQuality();
  }

  createRenderRoot() {
    return this;
  }

  firstUpdated() {
    if (this.autostart) void this.run();
  }

  /** Runs (or reruns) the test, then picks the level it recommends. */
  async run() {
    if (this.running) return;
    this.running = true;
    this.progress = 0;
    this.result = null;
    await this.updateComplete;
    // The test measures at the preview's own size (the estimate scales it
    // to the screen), capped so a dense display does not slow it down.
    const canvas = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    try {
      this.result = await runGraphicsBenchmark(canvas, (done) => {
        this.progress = done;
      });
      this.choose(this.result.recommended);
    } finally {
      this.running = false;
    }
  }

  private choose(quality: GraphicsQuality) {
    this.quality = quality;
    // An estimate: the in-game watch (QualitySuggestion) still offers a
    // lower level if real games turn out slow.
    this.userSettings.setGraphicsQuality(quality);
    this.dispatchEvent(
      new CustomEvent("quality-change", { detail: { quality } }),
    );
  }

  private fpsLabel(fps: number): string {
    return fps > FPS_SHOWN_MAX
      ? translateText("graphics_check.fps_more", { fps: FPS_SHOWN_MAX })
      : translateText("graphics_check.fps_about", { fps });
  }

  // One to four rising bars: the level, drawn rather than spelled out.
  private levelIcon(level: number, active: boolean) {
    return html`<svg
      viewBox="0 0 20 16"
      class="h-4 w-5 shrink-0"
      aria-hidden="true"
    >
      ${[0, 1, 2, 3].map(
        (i) =>
          svg`<rect x=${i * 5 + 0.5} y=${12 - i * 4} width="4" height=${4 + i * 4} rx="1"
            class=${
              i <= level
                ? active
                  ? "fill-emerald-300"
                  : "fill-white/70"
                : "fill-white/15"
            }></rect>`,
      )}
    </svg>`;
  }

  private renderStage() {
    const result = this.result;
    return html`
      <div
        class="relative aspect-[21/9] max-h-72 w-full overflow-hidden rounded-lg border border-white/10 bg-black/40"
      >
        <canvas
          class="absolute inset-0 size-full transition-opacity duration-500 ${this
            .running
            ? "opacity-100"
            : "opacity-25"}"
        ></canvas>
        <div
          class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
        >
          ${this.running
            ? html`<p
                class="rounded-md bg-black/55 px-3 py-1.5 text-sm font-semibold text-white"
                data-graphics-running
              >
                ${translateText("graphics_check.running")}
              </p>`
            : result === null
              ? html`<button
                  type="button"
                  data-graphics-run
                  @click=${() => this.run()}
                  class="rounded-md bg-emerald-500 px-6 py-2.5 font-display text-base font-bold text-emerald-950 transition-colors hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
                >
                  ${translateText("graphics_check.run")}
                </button>`
              : html`<div class="flex flex-col items-center gap-1">
                  <p
                    class="font-display text-lg font-bold text-white"
                    data-graphics-result
                  >
                    ${translateText("graphics_check.result", {
                      quality: translateText(
                        `user_setting.graphics_quality_${result.recommended}`,
                      ),
                    })}
                  </p>
                  ${result.renderer !== ""
                    ? html`<p class="max-w-md truncate text-xs text-white/55">
                        ${chipName(result.renderer)}
                      </p>`
                    : null}
                  ${result.software
                    ? html`<p class="max-w-md text-sm text-amber-200">
                        ${translateText("graphics_check.software")}
                      </p>`
                    : null}
                  <button
                    type="button"
                    data-graphics-rerun
                    @click=${() => this.run()}
                    class="mt-2 rounded-md border border-white/20 bg-black/40 px-4 py-1.5 text-sm font-semibold text-white/85 transition-colors hover:border-white/40 hover:text-white"
                  >
                    ${translateText("graphics_check.rerun")}
                  </button>
                </div>`}
        </div>
        <div
          class="absolute inset-x-0 bottom-0 h-1 bg-white/10"
          role="progressbar"
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow=${Math.round(this.progress * 100)}
        >
          <div
            class="h-full bg-emerald-400 transition-[width] duration-150"
            style="width: ${this.progress * 100}%"
          ></div>
        </div>
      </div>
    `;
  }

  private renderLevels() {
    const result = this.result;
    return html`
      <div
        class="grid w-full grid-cols-2 gap-2 lg:grid-cols-4"
        role="radiogroup"
        aria-label=${translateText("user_setting.graphics_quality_label")}
      >
        ${GRAPHICS_QUALITIES.map((quality, level) => {
          const selected = quality === this.quality;
          const recommended = result?.recommended === quality;
          return html`<button
            type="button"
            role="radio"
            aria-checked=${selected}
            data-quality=${quality}
            ?disabled=${this.running}
            @click=${() => this.choose(quality)}
            class="flex flex-col gap-1.5 rounded-md border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-60 ${selected
              ? "border-emerald-400/70 bg-emerald-500/15"
              : "border-white/10 bg-black/30 hover:border-white/25 hover:bg-white/[0.04]"}"
          >
            <span class="flex items-center gap-2">
              ${this.levelIcon(level, selected)}
              <span class="font-display font-semibold"
                >${translateText(
                  `user_setting.graphics_quality_${quality}`,
                )}</span
              >
              ${recommended
                ? html`<span
                    class="ml-auto rounded-sm bg-emerald-400/20 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-200"
                    >${translateText("graphics_check.recommended")}</span
                  >`
                : null}
            </span>
            <span class="text-xs leading-snug text-white/55"
              >${translateText(`graphics_check.${quality}_desc`)}</span
            >
            <span
              class="text-sm font-semibold tabular-nums ${result === null
                ? "text-white/25"
                : "text-white/85"}"
              >${result === null
                ? translateText("graphics_check.fps_unknown")
                : this.fpsLabel(result.fps[quality])}</span
            >
          </button>`;
        })}
      </div>
    `;
  }

  render() {
    return html`
      <div class="flex w-full flex-col gap-3" data-graphics-check>
        ${this.renderStage()} ${this.renderLevels()}
        <p class="text-center text-xs text-white/45 text-balance">
          ${translateText("graphics_check.note")}
        </p>
      </div>
    `;
  }
}
